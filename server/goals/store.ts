/**
 * Goals — reads, writes, and the narrow path by which the product may write
 * one on a member's behalf.
 *
 * ── The rule the whole file is arranged around ────────────────────────────
 *
 * Automatic progress is only ever taken from data that already means what the
 * goal means. Every decision about whether a set or an imported session counts
 * lives in shared/models/goals.ts, where it can be tested without a database;
 * this file finds the candidates, asks, and writes what comes back. It contains
 * no opinion of its own about what a 45-minute run implies.
 *
 * The other half is the unique index. Health Connect and HealthKit both re-read
 * a trailing window on a timer, so the same session arrives again every fifteen
 * minutes for days; `uq_goal_progress_source` is what turns the second arrival
 * into nothing rather than into a fortieth entry under one run.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db, transactionally } from "../db.js";
import {
  memberGoals,
  goalProgress,
  goalTargetRevisions,
  summariseGoal,
  evidenceFromSet,
  evidenceFromActivity,
  type GoalTarget,
  type Measurement,
  type MemberGoal,
  type MatchableGoal,
  type CanonicalSet,
  type CanonicalActivity,
  type ProgressSource,
} from "../../shared/models/goals.js";
import {
  exercises,
  externalActivityCategory,
  workoutSets,
} from "../../shared/models/training.js";
import type { GoalRelevance } from "../../shared/models/recommend.js";

/**
 * What ranking needs, plus the member's own words for it.
 *
 * The title is carried alongside rather than inside `GoalRelevance` because
 * the ranking must not be able to see it. A pure model with a title in hand is
 * a pure model one careless afternoon away from matching on it, and matching a
 * goal to a category by name is the failure this whole path is built to avoid.
 * It is here so `Why this?` can say "supports your six-minute mile" without a
 * second query.
 */
export type RelevantGoal = GoalRelevance & { title: string };

/** How much history a goal's list view carries. Detail asks for all of it. */
const RECENT_PROGRESS = 60;

export type GoalWithProgress = MemberGoal & {
  latest: { observedAt: Date; value: GoalTarget; source: string } | null;
  best: { observedAt: Date; value: GoalTarget; source: string } | null;
  observations: number;
  reached: boolean;
};

type ProgressRow = typeof goalProgress.$inferSelect;

function shape(row: ProgressRow) {
  return { observedAt: row.observedAt, value: row.value, source: row.source };
}

/**
 * A member's goals with latest and best already worked out.
 *
 * Two queries, not one per goal. The summary is derived in TypeScript rather
 * than by a window function because `comparable` is the thing deciding which
 * rows count, and it knows about mile distances and rep floors — moving that
 * into SQL would mean maintaining the rule twice, in two languages, with only
 * one of them tested.
 */
export async function goalsFor(
  userId: string,
  opts: { statuses?: readonly string[] } = {},
): Promise<GoalWithProgress[]> {
  const where = opts.statuses?.length
    ? and(eq(memberGoals.userId, userId), inArray(memberGoals.status, [...opts.statuses]))
    : eq(memberGoals.userId, userId);

  const goals = await db
    .select()
    .from(memberGoals)
    .where(where)
    .orderBy(memberGoals.sortOrder, desc(memberGoals.createdAt));

  if (!goals.length) return [];

  const rows = await db
    .select()
    .from(goalProgress)
    .where(
      inArray(
        goalProgress.goalId,
        goals.map((g) => g.id),
      ),
    )
    .orderBy(desc(goalProgress.observedAt))
    .limit(RECENT_PROGRESS * goals.length);

  const byGoal = new Map<string, ProgressRow[]>();
  for (const row of rows) {
    const list = byGoal.get(row.goalId) ?? [];
    list.push(row);
    byGoal.set(row.goalId, list);
  }

  return goals.map((goal) => {
    const summary = summariseGoal(goal, byGoal.get(goal.id) ?? []);
    return {
      ...goal,
      latest: summary.latest ? shape(summary.latest) : null,
      best: summary.best ? shape(summary.best) : null,
      observations: summary.counted,
      reached: summary.reached,
    };
  });
}

export async function goalDetail(userId: string, goalId: string) {
  const [goal] = await db
    .select()
    .from(memberGoals)
    .where(and(eq(memberGoals.id, goalId), eq(memberGoals.userId, userId)));
  if (!goal) return null;

  const [progress, revisions] = await Promise.all([
    db
      .select()
      .from(goalProgress)
      .where(eq(goalProgress.goalId, goalId))
      .orderBy(desc(goalProgress.observedAt)),
    db
      .select()
      .from(goalTargetRevisions)
      .where(eq(goalTargetRevisions.goalId, goalId))
      .orderBy(desc(goalTargetRevisions.createdAt)),
  ]);

  const summary = summariseGoal(goal, progress);
  return {
    goal,
    progress,
    revisions,
    latest: summary.latest ? shape(summary.latest) : null,
    best: summary.best ? shape(summary.best) : null,
    observations: summary.counted,
    incomparable: summary.incomparable,
    reached: summary.reached,
  };
}

export type NewGoal = {
  userId: string;
  title: string;
  description?: string | null;
  emphasis: string;
  measurement: Measurement;
  target: GoalTarget;
  exerciseId?: string | null;
  activityType?: string | null;
  targetDate?: string | null;
  /** Who is writing it. A coach may; the goal is still the member's. */
  actor: string;
};

/**
 * Create a goal and the first row of its target history, together.
 *
 * The revision is written at creation rather than only on the first change,
 * which is what makes the history complete: without it, a goal whose target
 * moved once would have a record beginning at the second value, and the
 * original — the one the member set out with — would be gone.
 */
export async function createGoal(input: NewGoal): Promise<MemberGoal> {
  return transactionally(async (tx) => {
    const [goal] = await tx
      .insert(memberGoals)
      .values({
        userId: input.userId,
        title: input.title,
        description: input.description ?? null,
        emphasis: input.emphasis,
        measurement: input.measurement,
        target: input.target,
        exerciseId: input.exerciseId ?? null,
        activityType: input.activityType ?? null,
        targetDate: input.targetDate ?? null,
        createdBy: input.actor,
        updatedBy: input.actor,
      })
      .returning();

    await tx.insert(goalTargetRevisions).values({
      goalId: goal.id,
      userId: input.userId,
      measurement: input.measurement,
      target: input.target,
      changedBy: input.actor,
    });

    return goal;
  });
}

/**
 * Move the target, keeping what it was.
 *
 * Both writes or neither. A goal whose column says 6:00 with no revision
 * saying when it stopped being 6:30 is exactly the state the revisions table
 * exists to prevent, and a failure between two statements is the likeliest way
 * to reach it.
 */
export async function retargetGoal(input: {
  userId: string;
  goalId: string;
  measurement: Measurement;
  target: GoalTarget;
  note?: string | null;
  actor: string;
}): Promise<MemberGoal | null> {
  return transactionally(async (tx) => {
    const [goal] = await tx
      .update(memberGoals)
      .set({
        measurement: input.measurement,
        target: input.target,
        updatedBy: input.actor,
        updatedAt: new Date(),
      })
      .where(and(eq(memberGoals.id, input.goalId), eq(memberGoals.userId, input.userId)))
      .returning();
    if (!goal) return null;

    await tx.insert(goalTargetRevisions).values({
      goalId: goal.id,
      userId: input.userId,
      measurement: input.measurement,
      target: input.target,
      changedBy: input.actor,
      note: input.note ?? null,
    });

    return goal;
  });
}

export async function updateGoal(input: {
  userId: string;
  goalId: string;
  actor: string;
  patch: {
    title?: string;
    description?: string | null;
    emphasis?: string;
    status?: string;
    targetDate?: string | null;
    sortOrder?: number;
  };
}): Promise<MemberGoal | null> {
  const patch: Record<string, unknown> = { ...input.patch, updatedBy: input.actor, updatedAt: new Date() };

  /*
    Achieving and un-achieving.

    `achieved_at` follows the status rather than being set separately, so the
    two cannot disagree — a goal reading "achieved" with no date, or carrying a
    date after the member reopened it, are both states somebody would have to
    interpret later. Reopening clears it: the member is saying it is not done,
    and the progress row that reached the target is still there to say when it
    was.
  */
  if (input.patch.status === "achieved") patch.achievedAt = new Date();
  else if (input.patch.status) patch.achievedAt = null;

  const [goal] = await db
    .update(memberGoals)
    .set(patch)
    .where(and(eq(memberGoals.id, input.goalId), eq(memberGoals.userId, input.userId)))
    .returning();
  return goal ?? null;
}

/**
 * Something a person observed and typed.
 *
 * Manual is not a lesser source. For most goals worth having it is the only
 * honest one — nothing in a phone knows how many pull-ups somebody did, and a
 * member who tested their mile on a track knows something no watch recorded.
 * These rows carry no `source_reference`, which is why the unique index is
 * partial: two entries on the same day are two facts.
 */
export async function recordProgress(input: {
  userId: string;
  goalId: string;
  measurement: Measurement;
  value: GoalTarget;
  observedAt: Date;
  onDate: string;
  source: ProgressSource;
  note?: string | null;
}): Promise<ProgressRow | null> {
  const [goal] = await db
    .select({ id: memberGoals.id })
    .from(memberGoals)
    .where(and(eq(memberGoals.id, input.goalId), eq(memberGoals.userId, input.userId)));
  if (!goal) return null;

  const [row] = await db
    .insert(goalProgress)
    .values({
      goalId: input.goalId,
      userId: input.userId,
      observedAt: input.observedAt,
      onDate: input.onDate,
      measurement: input.measurement,
      value: input.value,
      source: input.source,
      note: input.note ?? null,
    })
    .returning();
  return row ?? null;
}

// ─── Evidence the product noticed on its own ───────────────────────────────

/**
 * The goals that could conceivably be moved by something.
 *
 * Active only. A paused goal is one the member has set down, and filling it in
 * behind their back would mean coming back to a screen that had been running
 * without them.
 */
async function matchable(userId: string): Promise<MatchableGoal[]> {
  const goals = await db
    .select({
      id: memberGoals.id,
      status: memberGoals.status,
      measurement: memberGoals.measurement,
      target: memberGoals.target,
      exerciseId: memberGoals.exerciseId,
      activityType: memberGoals.activityType,
    })
    .from(memberGoals)
    .where(and(eq(memberGoals.userId, userId), eq(memberGoals.status, "active")));
  return goals;
}

type Evidence = {
  goalId: string;
  measurement: string;
  value: GoalTarget;
  source: ProgressSource;
  sourceReference: string;
  observedAt: Date;
  onDate: string;
};

/**
 * Write what was found, and let the index refuse the rest.
 *
 * `onConflictDoNothing` rather than a read-then-write. Two syncs can overlap —
 * a foreground sync while the background worker is mid-run is the normal case,
 * not a race worth being surprised by — and a check followed by an insert has
 * a window between them. The index is the only thing that does not.
 */
async function writeEvidence(userId: string, found: Evidence[]): Promise<number> {
  if (!found.length) return 0;
  const written = await db
    .insert(goalProgress)
    .values(
      found.map((e) => ({
        goalId: e.goalId,
        userId,
        observedAt: e.observedAt,
        onDate: e.onDate,
        measurement: e.measurement,
        value: e.value,
        source: e.source,
        sourceReference: e.sourceReference,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: goalProgress.id });
  return written.length;
}

/**
 * A finished workout, offered to the member's goals.
 *
 * Called when a session is finished rather than as each set lands: a set can
 * be corrected or deleted while the workout is open, and recording progress
 * from a number the member is still editing would leave a proof of something
 * that never happened.
 */
export async function noteWorkoutEvidence(
  userId: string,
  onDate: string,
  observedAt: Date,
  sets: readonly CanonicalSet[],
): Promise<number> {
  if (!sets.length) return 0;
  const goals = await matchable(userId);
  if (!goals.length) return 0;

  const found: Evidence[] = [];
  for (const goal of goals) {
    for (const set of sets) {
      const value = evidenceFromSet(goal, set);
      if (!value) continue;
      found.push({
        goalId: goal.id,
        measurement: goal.measurement,
        value,
        source: "workout",
        sourceReference: set.id,
        observedAt,
        onDate,
      });
    }
  }
  return writeEvidence(userId, found);
}

/**
 * Imported sessions, offered to the member's goals.
 *
 * The external id is the idempotency key and it is stable across reads, which
 * is what makes calling this on every sync free.
 */
export async function noteActivityEvidence(
  userId: string,
  activities: readonly (CanonicalActivity & { onDate: string; startAt: Date })[],
): Promise<number> {
  if (!activities.length) return 0;
  const goals = await matchable(userId);
  if (!goals.length) return 0;

  const found: Evidence[] = [];
  for (const goal of goals) {
    for (const activity of activities) {
      const value = evidenceFromActivity(goal, activity);
      if (!value) continue;
      found.push({
        goalId: goal.id,
        measurement: goal.measurement,
        value,
        source: "health",
        sourceReference: activity.externalId,
        observedAt: activity.startAt,
        onDate: activity.onDate,
      });
    }
  }
  return writeEvidence(userId, found);
}

/**
 * Active goals, small, for the surfaces that show them beside something else.
 *
 * Build and Restore both want a short list and neither wants the progress
 * history, so this is deliberately a different query from `goalsFor` rather
 * than that one with fields dropped afterwards — the point of the compact
 * surface is that it costs less, and a read that fetches sixty observations to
 * render three titles would not.
 */
export async function activeGoalsBrief(userId: string, limit = 6) {
  return db
    .select({
      id: memberGoals.id,
      title: memberGoals.title,
      emphasis: memberGoals.emphasis,
      measurement: memberGoals.measurement,
      target: memberGoals.target,
      exerciseId: memberGoals.exerciseId,
      activityType: memberGoals.activityType,
    })
    .from(memberGoals)
    .where(and(eq(memberGoals.userId, userId), eq(memberGoals.status, "active")))
    .orderBy(memberGoals.sortOrder, memberGoals.createdAt)
    .limit(limit);
}

export type GoalBrief = Awaited<ReturnType<typeof activeGoalsBrief>>[number];

/**
 * A finished session's sets, offered to the member's goals.
 *
 * Reads the sets here rather than taking them from the caller so that the
 * training route stays one line and the shape the matcher needs is decided in
 * one place. Warm-ups are fetched too — `evidenceFromSet` refuses them, and
 * filtering in SQL as well would put the same rule in two languages.
 */
export async function noteSessionEvidence(
  userId: string,
  sessionId: string,
  onDate: string,
  observedAt: Date,
): Promise<number> {
  const sets = await db
    .select({
      id: workoutSets.id,
      exerciseId: workoutSets.exerciseId,
      reps: workoutSets.reps,
      durationSeconds: workoutSets.durationSeconds,
      distanceM: workoutSets.distanceM,
      weightKg: workoutSets.weightKg,
      isWarmup: workoutSets.isWarmup,
    })
    .from(workoutSets)
    .where(eq(workoutSets.sessionId, sessionId));
  return noteWorkoutEvidence(userId, onDate, observedAt, sets);
}

/**
 * Active goals, reduced to the categories that serve them.
 *
 * This is the whole connection between a goal and a recommendation. A goal
 * reaches the ranking as canonical category ids or it does not reach it at
 * all — there is no title matching, no keyword search and no fuzzy anything,
 * because "Bench Press" the goal matching "bench" the search term is how a
 * mobility session ends up credited to somebody's powerlifting goal.
 *
 * Active only. A paused goal is one the member has set down, and a system that
 * kept steering by it would be ignoring the clearest instruction they have
 * given it.
 *
 * A goal about neither a movement nor an activity — "practise four times a
 * week", a custom one — resolves to no categories and simply never
 * participates. That is the honest outcome: nothing in the catalogue is
 * specifically about it.
 */
export async function goalRelevance(userId: string): Promise<RelevantGoal[]> {
  const goals = await db
    .select({
      id: memberGoals.id,
      title: memberGoals.title,
      exerciseId: memberGoals.exerciseId,
      activityType: memberGoals.activityType,
    })
    .from(memberGoals)
    .where(and(eq(memberGoals.userId, userId), eq(memberGoals.status, "active")));
  if (!goals.length) return [];

  const slugs = goals.map((g) => g.exerciseId).filter((id): id is string => !!id);
  const catalogue = slugs.length
    ? await db
        .select({ id: exercises.id, category: exercises.category })
        .from(exercises)
        .where(inArray(exercises.id, slugs))
    : [];
  const categoryOf = new Map(catalogue.map((e) => [e.id, e.category]));

  const out: RelevantGoal[] = [];
  for (const goal of goals) {
    const category = goal.exerciseId
      ? (categoryOf.get(goal.exerciseId) ?? null)
      : externalActivityCategory(goal.activityType);
    if (!category) continue;
    out.push({ id: goal.id, title: goal.title, categories: [category] });
  }
  return out;
}
