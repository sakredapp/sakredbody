/**
 * What this member has actually been moving — from both places it is recorded.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Movement lives in two tables. `workout_sessions` holds what somebody logged
 * inside Sakred; `health_workouts` holds what their phone recorded. Any screen
 * asking "have they trained lately" needs both, and until this file there was
 * no single answer to that question — there were two implementations that had
 * already drifted.
 *
 * The terrain read counted imported workouts. Today's readiness did not. So on
 * the evening of a five-mile run the member's Restore screen said "9 demanding
 * sessions this week" while Today said their movement was down and the day
 * should be small. Both sentences were generated from the same database, four
 * seconds apart, and they disagreed because one of them was reading half the
 * data.
 *
 * That is not a bug you fix twice. A third caller would have made the same
 * mistake a third time, and the symptom — two screens contradicting each other
 * — is the kind a member reads as the app not knowing anything about them.
 *
 * ── What it does not do ───────────────────────────────────────────────────
 *
 * No thresholds, no wording, no judgement about whether the week was heavy.
 * This returns what happened; `shared/models/recommend.ts` and
 * `shared/models/terrain.ts` decide what it means, and they stay testable
 * without a database because nothing here leaks into them.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  exercises,
  healthWorkouts,
  workoutSessions,
  workoutSets,
} from "../../shared/schema.js";
import { externalActivityCategory } from "../../shared/models/training.js";

/**
 * One thing the member did.
 *
 * `category` is what the *load* model reads and must stay a Sakred word.
 * `activity` is what a *person* reads, and it was missing: this type described
 * itself as "reduced to the two facts every caller needs", which was true while
 * the only caller was the load calculation and false the moment a screen wanted
 * to show somebody what they had done. Restore ended up printing the broad
 * category — three rows of "Recovery" — for a week that had actually been yoga,
 * mobility and a walk.
 *
 * Nothing was lost at ingestion. `health_workouts.workout_type` held it, and
 * this reader already selected it in order to derive the category, then dropped
 * it on the way out. Carrying it needs no migration and no re-import.
 */
export type MovementDay = {
  onDate: string;
  /** A Sakred category — never a platform's word. Callers read load from it. */
  category: string;
  /**
   * What the member would call it: "yoga", "running", "strength".
   *
   * Null for Sakred-logged sessions, where the category *is* the identity — a
   * logged session is a set of exercises, not an activity with a name.
   */
  activity: string | null;
  /** Where it came from, for callers that surface provenance. */
  source: "sakred" | "imported";
};

/**
 * Every (day, category) the member moved in, from both tables, deduplicated.
 *
 * ── The dedupe, and what it costs ─────────────────────────────────────────
 *
 * A member who lifts with Sakred open is very likely also wearing a watch that
 * writes the same hour into Apple Health. Counting both doubles their week, so
 * the rule is day-and-category: if a Sakred session that day already
 * contributed a category, an imported workout of the same category adds
 * nothing.
 *
 * Day-level rather than overlapping timestamps because that is the resolution
 * the data supports — `workout_sessions` records `on_date` and `finished_at`
 * but never a start time, so a true overlap test would compare against a number
 * we do not have. The cost is real and worth stating: two genuinely separate
 * sessions of the same kind on one day collapse into one. It errs toward
 * under-counting load, which is the safer direction for a reading that decides
 * whether to tell somebody to rest. Fixing it properly means giving native
 * sessions a start timestamp, not inventing one here.
 *
 * Sakred sessions are added first so that when a pair collapses, the surviving
 * entry is the one the member logged themselves.
 */
/**
 * One thing that actually happened, kept whole.
 *
 * ── Why this exists beside the reduction ──────────────────────────────────
 *
 * `recentMovement` collapses to one entry per (day, category). That is correct
 * for load — eight sets of squats is one demand on the body — and it was
 * harmless as long as only the category survived, because two workouts sharing
 * a category produced identical output either way.
 *
 * Attaching the activity name made the collapse a false claim. Yoga and
 * mobility on the same day both map to `recovery`, so one of them was dropped
 * and whichever survived supplied the name — and since the query had no
 * ordering, *which* one survived could change between calls with no change to
 * the data. A history that quietly rewrites its own past is worse than a vague
 * one.
 *
 * So there are two representations of one truth, and neither impersonates the
 * other:
 *
 *     movementEvents()   what happened          → member history
 *     recentMovement()   day/category projection → terrain and load
 *
 * They share one mapper. The reduction is derived from these events rather than
 * queried separately, so the two cannot drift into disagreeing about what
 * counts as movement.
 */
export type MovementEvent = {
  /** Stable per event, so a list can key on it and an order can break ties. */
  id: string;
  /** When it happened. Sakred sessions have no start time; this is the finish. */
  occurredAt: Date | null;
  onDate: string;
  /** A Sakred category — what the load model reads. */
  category: string;
  /** What the member would call it, where the source named it. */
  activity: string | null;
  source: "sakred" | "imported";
};

/**
 * Every movement event in the window, newest first, deterministically.
 *
 * The ordering is explicit and total: time descending, then id. Postgres is
 * free to return unordered rows in any sequence it likes, and relying on that
 * was the actual defect underneath the duplicate-activity bug.
 */
export async function movementEvents(userId: string, since: string): Promise<MovementEvent[]> {
  const [logged, imported] = await Promise.all([
    db
      .selectDistinct({
        id: workoutSessions.id,
        onDate: workoutSessions.onDate,
        finishedAt: workoutSessions.finishedAt,
        title: workoutSessions.title,
        category: exercises.category,
      })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSessions.id, workoutSets.sessionId))
      .innerJoin(exercises, eq(exercises.id, workoutSets.exerciseId))
      .where(
        and(
          eq(workoutSessions.userId, userId),
          gte(workoutSessions.onDate, since),
          sql`${workoutSessions.finishedAt} is not null`,
          eq(workoutSets.isWarmup, false),
        ),
      ),
    db
      .select({
        id: healthWorkouts.id,
        onDate: healthWorkouts.onDate,
        startAt: healthWorkouts.startAt,
        workoutType: healthWorkouts.workoutType,
      })
      .from(healthWorkouts)
      .where(and(eq(healthWorkouts.userId, userId), gte(healthWorkouts.onDate, since))),
  ]);

  const events: MovementEvent[] = [];

  /**
   * A logged session becomes one event per category it touched, because that is
   * what the load model already counts and what the member did — a full-body
   * session that also included mobility is honestly two things.
   *
   * `title` is the member's own name for it where they gave one. No
   * imported-style activity word is invented for them.
   */
  for (const row of logged) {
    events.push({
      id: `${row.id}:${row.category}`,
      occurredAt: row.finishedAt ?? null,
      onDate: row.onDate,
      category: row.category,
      activity: row.title?.trim() || null,
      source: "sakred",
    });
  }

  for (const row of imported) {
    // Same rule as the reduction: an activity we cannot place is dropped rather
    // than guessed at, because an invented category feeds invented load.
    const category = externalActivityCategory(row.workoutType);
    if (!category) continue;
    events.push({
      id: row.id,
      occurredAt: row.startAt ?? null,
      onDate: row.onDate,
      category,
      activity: row.workoutType ?? null,
      source: "imported",
    });
  }

  return events.sort((a, b) => {
    if (a.onDate !== b.onDate) return b.onDate.localeCompare(a.onDate);
    const at = a.occurredAt?.getTime() ?? 0;
    const bt = b.occurredAt?.getTime() ?? 0;
    if (at !== bt) return bt - at;
    // Total order, so the same stored history always renders the same way.
    return a.id.localeCompare(b.id);
  });
}

export async function recentMovement(
  userId: string,
  since: string,
): Promise<MovementDay[]> {
  const events = await movementEvents(userId, since);

  const out: MovementDay[] = [];
  const claimed = new Set<string>();

  /**
   * Sakred-logged first, so that when a pair collapses the survivor is the one
   * the member logged themselves. Within that, the deterministic order
   * movementEvents already established — this reduction must not reintroduce
   * the ambiguity it exists to hide from the load model.
   */
  const ordered = [...events].sort((a, b) => {
    if (a.source !== b.source) return a.source === "sakred" ? -1 : 1;
    return 0;
  });

  for (const e of ordered) {
    const key = `${e.onDate}|${e.category}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    out.push({ onDate: e.onDate, category: e.category, activity: e.activity, source: e.source });
  }

  return out.sort((a, b) => b.onDate.localeCompare(a.onDate));
}

