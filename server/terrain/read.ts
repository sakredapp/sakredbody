/**
 * The terrain reading — one implementation, several authorized readers.
 *
 * ── Why this was extracted ────────────────────────────────────────────────
 *
 * All of this lived inside the `GET /api/terrain/today` handler, which was
 * fine while the member was the only person who could ask. A coach opening a
 * client now asks the same question about somebody else, and there are exactly
 * two ways to answer it: call this, or write a second one.
 *
 * This app has already paid for the second option once. `server/movement/
 * history.ts` exists because "has this member been training" had two
 * implementations that drifted, and on the evening of a five-mile run the
 * member's Restore screen and their Today screen contradicted each other from
 * the same database, four seconds apart.
 *
 * A coach's copy of that bug would be worse, not better: two people would be
 * looking at the same body through two different readings and trying to have a
 * conversation about it.
 *
 * So there is no `calculateCoachTerrain`. There is this, and who is allowed to
 * call it is a question answered somewhere else entirely.
 *
 * ── Live, not frozen ──────────────────────────────────────────────────────
 *
 * This reads the body now. The stable day context — moon, season, personal day
 * — is a different layer with a different lifetime, and the daily note is
 * written once at dawn and deliberately knows nothing about what the member has
 * done since. A coach must see the live reading: if Sarah ran after breakfast,
 * her coach's screen cannot still be saying her movement is down because a note
 * was frozen before she laced up.
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { healthDays, healthWorkouts, workoutSessions } from "../../shared/schema.js";
import { readTerrain, composeTerrainNow, terrainHeadline } from "../../shared/models/terrain.js";
import { terrainCheckins } from "../../shared/models/terrainSignals.js";
import { DEMANDING_EXTERNAL_TYPES, categoryOrientation } from "../../shared/models/training.js";
import { movementEvents, recentMovement } from "../movement/history.js";
import { addDaysToString } from "../../shared/utils/dates.js";

/** Matches healthSignals: enough for a baseline, recent enough to be "lately". */
export const BASELINE_DAYS = 28;
export const RECENT_DAYS = 7;

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
 * One entry per (day, category) in the last seven days, from both tables.
 *
 * Per day-category rather than per set: a member who did eight sets of squats
 * did one demanding leg session, and counting the sets would make a normal
 * session look like the heaviest week of their life.
 *
 * The gathering, the dedupe against imported workouts and the classification
 * all live in `recentMovement`. They used to live here, and a second copy of
 * them did not live in `server/today/signals.ts` — which is precisely why Today
 * and Restore could disagree about whether the member had trained.
 */
async function trainedCategories(userId: string, onDate: string) {
  return recentMovement(userId, addDaysToString(onDate, -RECENT_DAYS));
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
   * Without this the same fault appears in a second sentence: this fed
   * "Nothing demanding in 12 days", which would have gone on saying twelve the
   * morning after a run that Apple Health recorded and Sakred stored.
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

/** The member's own report for this day, if they have made one. */
async function todaysReport(userId: string, onDate: string) {
  const [row] = await db
    .select({
      energy: terrainCheckins.energy,
      recovery: terrainCheckins.recovery,
      nervousSystem: terrainCheckins.nervousSystem,
      digestion: terrainCheckins.digestion,
      bodyTension: terrainCheckins.bodyTension,
      mentalClarity: terrainCheckins.mentalClarity,
      drive: terrainCheckins.drive,
    })
    .from(terrainCheckins)
    .where(and(eq(terrainCheckins.userId, userId), eq(terrainCheckins.onDate, onDate)))
    .limit(1);
  // Deliberately not the note. It is the member's own words to their coach and
  // to themselves; nothing in the reading needs it, so nothing in the reading
  // carries it.
  return row ?? null;
}

export type TerrainRead = Awaited<ReturnType<typeof terrainFor>>;

/**
 * What condition this body is in, and what it can receive next.
 *
 * The reasoning is in `shared/models/terrain.ts`, which is pure and tested.
 * This gathers the inputs and nothing else — deliberately, because the part
 * that decides what to tell somebody should be checkable without a database.
 */
export async function terrainFor(userId: string, onDate: string) {
  const [avg, categories, since, reported] = await Promise.all([
    averages(userId, onDate),
    trainedCategories(userId, onDate),
    daysSinceLastSession(userId, onDate),
    /**
     * Today's check-in, and only today's.
     *
     * Keyed to `onDate` — the member's own local date, which is also the date
     * they answered under, so a check-in cannot leak across a timezone into a
     * day it wasn't about. Read live on every request rather than cached, so a
     * member who revises at 6pm sees the revised reading immediately, and so
     * does their coach.
     */
    todaysReport(userId, onDate),
  ]);

  const measured = readTerrain({
    sleepRecent: avg.sleepMinutes.recent,
    sleepBaseline: avg.sleepMinutes.baseline,
    hrvRecent: avg.heartRateVariability.recent,
    hrvBaseline: avg.heartRateVariability.baseline,
    rhrRecent: avg.restingHeartRate.recent,
    rhrBaseline: avg.restingHeartRate.baseline,
    trainedCategories: categories.map((m) => m.category),
    daysSinceLastSession: since,
    // The reasons name these out loud, so they come from the same two constants
    // the averages were taken over rather than being restated.
    recentDays: RECENT_DAYS,
    baselineDays: BASELINE_DAYS,
  });

  /**
   * The canonical Terrain Now — instruments and person, composed once here.
   *
   * Every reader of terrain goes through this function, so there is exactly one
   * place the two get combined and no way for a screen to see only half.
   */
  const reading = composeTerrainNow({ measured, reported });

  /**
   * The movement the reading is reasoning from, not just its conclusion.
   *
   * Restore could say "9 demanding sessions this week" and show none of them,
   * so a member had to take the number on faith — and when the number was
   * wrong, because every dog walk was counting as a session, there was nothing
   * on screen that would have revealed it.
   *
   * Orientation comes from the same CATEGORY_LOAD the reading used, so the list
   * cannot disagree with the sentence above it.
   */
  const movement = categories.map((m) => ({
    onDate: m.onDate,
    category: m.category,
    activity: m.activity,
    orientation: categoryOrientation(m.category),
    source: m.source,
  }));

  /**
   * What actually happened, as distinct from what the reading reasoned over.
   *
   * `movement` above is the (day, category) projection the load model uses —
   * correct for terrain, wrong as a diary, because two workouts sharing a
   * category collapse into one and only one of their names survives. A screen
   * showing somebody their week needs the events themselves.
   *
   * A separate field rather than a changed meaning for `movement`: the reduced
   * shape has callers that want exactly what it is, and quietly widening it
   * would make every one of them a guess.
   */
  const events = await movementEvents(userId, addDaysToString(onDate, -RECENT_DAYS));
  const movementEventList = events.map((e) => ({
    id: e.id,
    onDate: e.onDate,
    category: e.category,
    activity: e.activity,
    orientation: categoryOrientation(e.category),
    source: e.source,
  }));

  return {
    ...reading,
    headline: terrainHeadline(reading),
    movement,
    movementEvents: movementEventList,
    onDate,
  };
}
