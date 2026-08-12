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
  exercises,
  workoutSessions,
  workoutSets,
} from "../../shared/schema.js";
import { readTerrain, terrainHeadline } from "../../shared/models/terrain.js";
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

  return rows.map((r) => r.category);
}

async function daysSinceLastSession(userId: string, onDate: string): Promise<number | null> {
  const [row] = await db
    .select({ last: sql<string | null>`max(${workoutSessions.onDate})` })
    .from(workoutSessions)
    .where(
      and(eq(workoutSessions.userId, userId), sql`${workoutSessions.finishedAt} is not null`),
    );

  if (!row?.last) return null;
  return Math.round(
    (new Date(`${onDate}T12:00:00Z`).getTime() - new Date(`${row.last}T12:00:00Z`).getTime()) /
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
      });

      res.json({ ...reading, headline: terrainHeadline(reading), onDate });
    } catch (err) {
      console.error("[terrain] today failed", err);
      res.status(500).json({ message: "Could not read your terrain." });
    }
  });
}
