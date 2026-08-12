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

/** One thing the member did, reduced to the two facts every caller needs. */
export type MovementDay = {
  onDate: string;
  /** A Sakred category — never a platform's word. Callers read load from it. */
  category: string;
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
export async function recentMovement(
  userId: string,
  since: string,
): Promise<MovementDay[]> {
  const [logged, imported] = await Promise.all([
    db
      .selectDistinct({
        onDate: workoutSessions.onDate,
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
      .select({ onDate: healthWorkouts.onDate, workoutType: healthWorkouts.workoutType })
      .from(healthWorkouts)
      .where(and(eq(healthWorkouts.userId, userId), gte(healthWorkouts.onDate, since))),
  ]);

  const out: MovementDay[] = [];
  const claimed = new Set<string>();

  for (const row of logged) {
    const key = `${row.onDate}|${row.category}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    out.push({ onDate: row.onDate, category: row.category, source: "sakred" });
  }

  for (const row of imported) {
    /**
     * Anything we cannot place is dropped here, not guessed at.
     *
     * An unknown activity contributing an invented category would feed an
     * invented load into a reading the member is asked to act on. They still
     * see the workout on their health card either way — only one of those two
     * puts a guess inside the advice.
     */
    const category = externalActivityCategory(row.workoutType);
    if (!category) continue;
    const key = `${row.onDate}|${category}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    out.push({ onDate: row.onDate, category, source: "imported" });
  }

  // Newest first, which is what every caller wants and none of them should
  // have to arrange for itself.
  return out.sort((a, b) => b.onDate.localeCompare(a.onDate));
}
