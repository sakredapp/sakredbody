/**
 * One member, assembled — what a coach or a decision needs in order to say
 * something useful about a person.
 *
 * ── This composes. It does not decide, and it does not store ──────────────
 *
 * Every field below comes from the reader that already owns it: `terrainFor`
 * for the body's current state, `activePlanFor` for what a coach wrote,
 * `recentMovement` for what actually happened, `goalsFor` for where the member
 * is trying to get to, `trainingMemory` for what their body has done with
 * similar work before. There is no coaching terrain, no coaching training
 * load, no second copy of health data, and no table behind this file.
 *
 * That is a rule with a history. Movement had two implementations once, and on
 * the evening of a five-mile run Restore said the member had trained nine
 * times that week while Today said their movement was down — same database,
 * four seconds apart. A third implementation sitting between a coach and a
 * member would put that contradiction between two people trying to talk about
 * one body.
 *
 * ── The seven facts, kept apart ───────────────────────────────────────────
 *
 *   GOAL            where they are trying to go
 *   PLAN            the strategy currently in use
 *   TERRAIN         what today can support
 *   RECOMMENDATION  what Sakred suggested
 *   ACTIVITY        what actually happened
 *   RESPONSE        how it landed
 *   PROGRESS        evidence of movement toward the goal
 *
 * They are separate fields on one object rather than a merged summary,
 * because the interesting questions are all about the gaps between them: a
 * coach planned intervals, Terrain argued for less, the member walked, and
 * they slept better than they had all week. Any two of those collapsed into
 * one number would delete the only thing worth discussing.
 *
 * ── Authorization is not here ─────────────────────────────────────────────
 *
 * This function will assemble a context for any member id it is handed. Every
 * caller is behind its own gate, and the gates are the routes — see the header
 * of clientRoutes.ts. Putting the check in here as well would look like
 * defence in depth and would actually be a second policy, free to disagree
 * with the first.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { wellnessRoutines } from "../../shared/models/coaching.js";
import { terrainCheckins } from "../../shared/models/terrainSignals.js";
import { coachingPlanItems } from "../../shared/models/coachingPlans.js";
import { categoryOrientation } from "../../shared/models/training.js";
import { getActiveEnrollment, memberToday, settleRoutines } from "./enrollment.js";
import { activePlanFor } from "./plans.js";
import { terrainFor, RECENT_DAYS } from "../terrain/read.js";
import { recentMovement } from "../movement/history.js";
import { trainingMemory } from "../training/memory.js";
import { goalsFor } from "../goals/store.js";
import { addDaysToString } from "../../shared/utils/dates.js";

/**
 * The plan a member is on, and who put them on it.
 *
 * Settles first, so a plan that ran out yesterday is not reported as running.
 *
 * ── On attribution ────────────────────────────────────────────────────────
 *
 * `assigned_by_user_id` is only populated on phases written since the column
 * existed, and nothing back-filled it — there was no coaching history to
 * recover, and inventing one would put a coach's name on work they did not do.
 * So `assignedBy` is null for older phases and the UI says nothing rather than
 * guessing.
 */
export async function planFor(memberId: string) {
  await settleRoutines(memberId);
  const enrollment = await getActiveEnrollment(memberId);
  if (!enrollment) return null;

  const [routine] = await db
    .select({ name: wellnessRoutines.name, description: wellnessRoutines.description })
    .from(wellnessRoutines)
    .where(eq(wellnessRoutines.id, enrollment.routineId));

  const start = new Date(enrollment.startDate);
  const end = new Date(enrollment.endDate);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const currentDay = Math.min(
    totalDays,
    Math.max(1, Math.round((Date.now() - start.getTime()) / 86_400_000) + 1),
  );

  return {
    name: routine?.name ?? null,
    description: routine?.description ?? null,
    intensity: enrollment.intensity,
    startedAt: enrollment.startDate,
    currentDay,
    totalDays,
  };
}

/** The last thing the member said about themselves. */
export async function latestCheckin(memberId: string) {
  const [row] = await db
    .select()
    .from(terrainCheckins)
    .where(eq(terrainCheckins.userId, memberId))
    .orderBy(desc(terrainCheckins.onDate))
    .limit(1);
  return row ?? null;
}

/**
 * How much the week asked of this body, and how much it gave back.
 *
 * Two counts and not a ratio. Restore and Build are complementary capacities
 * in this model rather than opposing scores, and a single number invites a
 * coach to chase it.
 */
export function buildRestore(movement: { category: string }[]) {
  let build = 0;
  let restore = 0;
  for (const m of movement) {
    const o = categoryOrientation(m.category);
    if (o === "yang" || o === "both") build += 1;
    if (o === "yin" || o === "both") restore += 1;
  }
  return { build, restore, days: RECENT_DAYS };
}

export type CoachingContext = Awaited<ReturnType<typeof readCoachingContext>>;

/**
 * Everything, once.
 *
 * `days` bounds the activity window only. Goals are not windowed — a goal a
 * member set in March is exactly as current as one they set yesterday, and
 * a thirty-day cutoff applied to intent would quietly hide the long ones,
 * which are the ones most worth a conversation.
 */
export async function readCoachingContext(
  memberId: string,
  opts: { days?: number } = {},
) {
  const onDate = await memberToday(memberId);
  const days = Math.min(90, Math.max(7, opts.days ?? 30));
  const since = addDaysToString(onDate, -days);

  const [terrain, routine, coachPlan, checkin, goals, movement, memory] = await Promise.all([
    terrainFor(memberId, onDate),
    planFor(memberId),
    activePlanFor(memberId),
    latestCheckin(memberId),
    /*
      Paused goals are included and labelled rather than filtered out.

      A goal somebody set down three weeks ago is one of the more useful things
      a coach can know — it is often the reason a plan stopped working — and a
      reader that only returned the active ones would make the fact that it was
      ever there invisible. What a paused goal must not do is influence a
      recommendation, and that refusal lives in the ranking, not here.
    */
    goalsFor(memberId, { statuses: ["active", "paused", "achieved"] }),
    recentMovement(memberId, since),
    trainingMemory(memberId, onDate),
  ]);

  /*
    The lines of the coach's plan that say which goal they serve.

    Optional by design — most lines serve no goal, and health is not only goal
    pursuit — so this is a lookup a caller may use rather than something folded
    into the plan object. Absent means the coach did not say, never that the
    line is unrelated.
  */
  const planItems = coachPlan
    ? await db
        .select()
        .from(coachingPlanItems)
        .where(eq(coachingPlanItems.planId, coachPlan.id))
    : [];

  return {
    onDate,
    days,
    /** What the body currently supports. The strongest voice; see terrain.ts. */
    terrain,
    /** Where the member is trying to go. */
    goals,
    /** The strategy: a routine they are enrolled in, and a coach's own plan. */
    routine,
    coachPlan,
    planItems,
    /** What actually happened, and what their body has made of similar work. */
    movement,
    weekBalance: buildRestore(
      movement.filter((m) => m.onDate >= addDaysToString(onDate, -RECENT_DAYS)),
    ),
    memory,
    /** What the member said about themselves, never dressed as a measurement. */
    checkin,
  };
}
