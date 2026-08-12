/**
 * Terrain — API
 *
 *   GET /api/terrain/today — what condition the body is in, and what it can
 *                            receive next
 *
 * The reasoning lives in shared/models/terrain.ts, which is pure and tested.
 * This file only gathers the inputs, and it is deliberately thin for that
 * reason: the part that decides what to tell a member should be checkable
 * without a database.
 *
 * ── Why the numbers are computed here and not read from healthSignals ─────
 *
 * `server/daily/healthSignals.ts` already reduces the same metrics — but it
 * reduces them to *sentences*, formatted for a prompt ("54 bpm", "7h 20m a
 * night"), because a model is the only thing that reads it. Parsing those back
 * into numbers to compare them would be absurd. The windows and the thresholds
 * are deliberately the same, so the two never contradict each other on screen.
 */

import type { Express } from "express";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { memberToday } from "../coaching/enrollment.js";
import {
  healthDays,
  healthWorkouts,
  exercises,
  workoutSessions,
  workoutSets,
} from "../../shared/schema.js";
import { readTerrain, terrainHeadline } from "../../shared/models/terrain.js";
import {
  externalActivityCategory,
  DEMANDING_EXTERNAL_TYPES,
} from "../../shared/models/training.js";
import { addDaysToString } from "../../shared/utils/dates.js";

/** Matches healthSignals: enough for a baseline, recent enough to be "lately". */
const BASELINE_DAYS = 28;
const RECENT_DAYS = 7;

const METRICS = ["sleepMinutes", "heartRateVariability", "restingHeartRate"] as const;

type Averages = Record<string, { recent: number | null; baseline: number | null }>;

/**
 * One query for both windows.
 *
 * The recent average is a subset of the baseline window rather than a separate
 * one, which is the conventional shape and the one healthSignals uses: the
 * question is "is this week unlike the last month", and a disjoint comparison
 * would answer a different question with the same words.
 */
async function averages(userId: string, onDate: string): Promise<Averages> {
  const since = addDaysToString(onDate, -BASELINE_DAYS);
  const recentSince = addDaysToString(onDate, -RECENT_DAYS);

  const rows = await db
    .select({
      metric: healthDays.metric,
      recent: sql<number | null>`avg(case when ${healthDays.onDate} >= ${recentSince} then ${healthDays.value} end)`,
      baseline: sql<number | null>`avg(${healthDays.value})`,
    })
    .from(healthDays)
    .where(
      and(
        eq(healthDays.userId, userId),
        gte(healthDays.onDate, since),
        inArray(healthDays.metric, METRICS as unknown as string[]),
      ),
    )
    .groupBy(healthDays.metric);

  const out: Averages = {};
  for (const m of METRICS) out[m] = { recent: null, baseline: null };
  for (const r of rows) {
    out[r.metric] = {
      // Postgres avg() returns numeric, which arrives as a string.
      recent: r.recent === null ? null : Number(r.recent),
      baseline: r.baseline === null ? null : Number(r.baseline),
    };
  }
  return out;
}

/**
 * One entry per (session, category) in the last seven days.
 *
 * Per session-category rather than per set: a member who did eight sets of
 * squats did one demanding leg session, and counting the sets would make a
 * normal session look like the heaviest week of their life.
 */
async function trainedCategories(userId: string, onDate: string): Promise<string[]> {
  const since = addDaysToString(onDate, -RECENT_DAYS);

  const rows = await db
    .selectDistinct({
      sessionId: workoutSessions.id,
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
    );

  const native = rows.map((r) => r.category);

  /**
   * Movement the phone knows about and Sakred was never told.
   *
   * ── What this fixes ─────────────────────────────────────────────────────
   *
   * This function read `workout_sets` and nothing else, which means it only
   * ever saw sessions logged inside Sakred. A member whose Oura wrote a
   * 54-minute run into Apple Health, or whose Strava wrote one into Health
   * Connect, had that run sitting in `health_workouts` — synced, stored,
   * visible on the health card — and the terrain reading still concluded they
   * had not trained. It would then tell them they had room for more movement
   * on the evening of a ten-mile day.
   *
   * ── Classified by our own model, not the platform's ─────────────────────
   *
   * `externalActivityCategory` translates the platform's word into a Sakred
   * category, and everything downstream — stress, restoration, Restore or
   * Build — is then decided by CATEGORY_LOAD exactly as it is for a logged
   * session. There is no second opinion about what a run costs.
   *
   * Anything we cannot place returns null and is dropped here. An unknown
   * activity contributing an invented load is worse than one contributing
   * none: the member can see the workout on their health card either way, but
   * only one of those puts a guess inside a reading they are asked to act on.
   */
  const imported = await db
    .select({ onDate: healthWorkouts.onDate, workoutType: healthWorkouts.workoutType })
    .from(healthWorkouts)
    .where(and(eq(healthWorkouts.userId, userId), gte(healthWorkouts.onDate, since)));

  /**
   * Never twice for the same effort.
   *
   * A member who lifts with Sakred open is very likely also wearing a watch
   * that writes the same hour into Apple Health, and counting both would
   * double their week. The rule is day-and-category: if a Sakred session that
   * day already contributed this category, the imported one adds nothing.
   *
   * Day-level rather than overlapping timestamps because that is the
   * resolution the data actually supports — `workout_sessions` records
   * `on_date` and `finished_at` but never a start time, so a true overlap test
   * would be comparing against a number we do not have. Two genuinely separate
   * sessions of the same kind on one day being counted once is the cost, and
   * it errs toward under-counting load, which is the safer direction for a
   * reading that decides whether to tell somebody to rest.
   */
  const claimed = new Set(rows.map((r) => `${r.onDate}|${r.category}`));

  for (const workout of imported) {
    const category = externalActivityCategory(workout.workoutType);
    if (!category) continue;
    const key = `${workout.onDate}|${category}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    native.push(category);
  }

  return native;
}

async function daysSinceLastSession(userId: string, onDate: string): Promise<number | null> {
  const [row] = await db
    .select({ last: sql<string | null>`max(${workoutSessions.onDate})` })
    .from(workoutSessions)
    .where(
      and(eq(workoutSessions.userId, userId), sql`${workoutSessions.finishedAt} is not null`),
    );

  /**
   * An imported workout is a session too.
   *
   * Without this the same fault as above appears in a second sentence: this
   * fed "Nothing demanding in 12 days", which would have gone on saying twelve
   * the morning after a run that Apple Health recorded and Sakred stored.
   *
   * Only activities that actually cost something count. A yoga session is real
   * movement and belongs in the member's history, but it is not what "nothing
   * demanding" is asking about, and letting it reset this counter would tell
   * somebody who has stretched for a fortnight that they are training.
   */
  const [external] = await db
    .select({ last: sql<string | null>`max(${healthWorkouts.onDate})` })
    .from(healthWorkouts)
    .where(
      and(
        eq(healthWorkouts.userId, userId),
        inArray(healthWorkouts.workoutType, DEMANDING_EXTERNAL_TYPES),
      ),
    );

  // The later of the two, and either may be absent.
  const last = [row?.last, external?.last].filter(Boolean).sort().pop() ?? null;

  if (!last) return null;
  return Math.round(
    (new Date(`${onDate}T12:00:00Z`).getTime() - new Date(`${last}T12:00:00Z`).getTime()) /
      86_400_000,
  );
}

export function registerTerrainRoutes(app: Express): void {
  app.get("/api/terrain/today", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user?.id ?? req.session?.userId) as string;
      /**
       * The member's own date, matching daily_notes and health_days.
       *
       * This fell back to `new Date().toISOString()` — the *server's* UTC date
       * — directly underneath a comment saying it must not. For anybody west
       * of Greenwich the last hours of their evening are already tomorrow in
       * UTC, so from about 20:00 Eastern the screen asked for a day that had
       * not happened, found nothing, and told a member with months of synced
       * data to "connect health data or log a session".
       *
       * A wrong-by-one-day read is the worst kind of bug here: it is invisible
       * for two thirds of the day and looks like a sync failure for the rest.
       */
      const onDate =
        typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : await memberToday(userId);

      const [avg, categories, since] = await Promise.all([
        averages(userId, onDate),
        trainedCategories(userId, onDate),
        daysSinceLastSession(userId, onDate),
      ]);

      const reading = readTerrain({
        sleepRecent: avg.sleepMinutes.recent,
        sleepBaseline: avg.sleepMinutes.baseline,
        hrvRecent: avg.heartRateVariability.recent,
        hrvBaseline: avg.heartRateVariability.baseline,
        rhrRecent: avg.restingHeartRate.recent,
        rhrBaseline: avg.restingHeartRate.baseline,
        trainedCategories: categories,
        daysSinceLastSession: since,
        // The reasons name these out loud, so they come from the same two
        // constants the averages were taken over rather than being restated.
        recentDays: RECENT_DAYS,
        baselineDays: BASELINE_DAYS,
      });

      res.json({ ...reading, headline: terrainHeadline(reading), onDate });
    } catch (err) {
      console.error("[terrain] today failed", err);
      res.status(500).json({ message: "Could not read your terrain." });
    }
  });
}
