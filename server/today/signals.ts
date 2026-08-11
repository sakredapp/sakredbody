/**
 * Everything the day's read is made of, gathered once.
 *
 * ── Why this is separate from the route ───────────────────────────────────
 *
 * `shared/models/recommend.ts` is a pure function over a bag of numbers, which
 * is what makes it testable and what let it be built and proven before any of
 * this existed. This file is the other half: the part that knows about tables,
 * timezones and the fact that a member may have no wearable at all.
 *
 * Keeping the boundary sharp matters more than it looks. Every rule about how
 * signals combine lives in the pure module — nothing here decides anything, it
 * only reports. If a judgement call ever appears in this file it is in the
 * wrong place.
 *
 * ── Baselines are the member's own ────────────────────────────────────────
 *
 * A resting heart rate of 52 is excellent for one person and a warning for
 * another, so every measurement is paired with that member's own trailing
 * average and never with a population norm. The window is 28 days, trailing,
 * and it deliberately *includes* today: excluding it would mean the baseline
 * silently changes shape on the first day of the month.
 *
 * A baseline of fewer than five readings is not a baseline. Returning one
 * anyway is how a member's second night of sleep data gets reported as "well
 * below your usual", where "usual" is one other night.
 */

import { and, eq, gte, desc, isNull, or, sql, inArray } from "drizzle-orm";
import { db } from "../db.js";
import {
  healthDays,
  terrainCheckins,
  workoutSessions,
  workoutSets,
  exercises,
  rhythmSubjects,
  rhythmEvents,
  suggestionDismissals,
  CONTEXT_FRESH_DAYS,
  SIGNAL_KEYS,
  type TerrainSignalId,
  type RhythmContextKind,
} from "../../shared/schema.js";
import type { ReadinessSignals } from "../../shared/models/recommend.js";
import {
  estimatePhase,
  cycleLean as leanFromPhase,
  type RhythmEstimate,
  type RhythmModel,
} from "../../shared/models/rhythm.js";
import { categoryLoad } from "../../shared/models/training.js";

/** Long enough that a baseline means something, short enough to still be "lately". */
const BASELINE_DAYS = 28;
/** Below this many readings, we have a number and not a normal. */
const MIN_BASELINE_POINTS = 5;
/** "Recently" for training load. Three days is the window soreness lives in. */
const RECENT_TRAINING_DAYS = 3;
/** How far back the novelty nudge looks for what they already reach for. */
const HABIT_WINDOW_DAYS = 21;

function shiftDate(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000,
  );
}

// ─── Health ────────────────────────────────────────────────────────────────

/** One metric, as the engine wants it: today's value and their own normal. */
type Reading = { today: number | null; baseline: number | null };

export type TodayStat = {
  metric: string;
  /** Today's value, or the most recent one if today hasn't synced yet. */
  value: number | null;
  /** The date `value` came from — so the UI can say "yesterday" honestly. */
  onDate: string | null;
  baseline: number | null;
};

/**
 * The metrics the read uses, plus the ones the member wants to see.
 *
 * Sleep is filed to the date a session *ends* on by the sync layer, so "last
 * night's sleep" is today's row. That is worth restating here because it is the
 * one place the naming is counter-intuitive enough to invite a wrong fix.
 */
const READ_METRICS = ["sleepMinutes", "restingHeartRate", "heartRateVariability"] as const;

export async function healthReadings(
  userId: string,
  today: string,
): Promise<{ readings: Record<string, Reading>; stats: TodayStat[] }> {
  const since = shiftDate(today, -BASELINE_DAYS);

  const rows = await db
    .select({
      onDate: healthDays.onDate,
      metric: healthDays.metric,
      value: healthDays.value,
    })
    .from(healthDays)
    .where(and(eq(healthDays.userId, userId), gte(healthDays.onDate, since)))
    .orderBy(desc(healthDays.onDate));

  const byMetric = new Map<string, { onDate: string; value: number }[]>();
  for (const row of rows) {
    const list = byMetric.get(row.metric);
    if (list) list.push(row);
    else byMetric.set(row.metric, [row]);
  }

  const readings: Record<string, Reading> = {};
  const stats: TodayStat[] = [];

  // Array.from rather than iterating the Map directly: the tsconfig target
  // here predates downlevelIteration, and this is not the file to change it in.
  for (const [metric, points] of Array.from(byMetric.entries())) {
    // Rows arrive newest-first, so the head is the freshest reading we hold.
    const latest = points[0];
    const todayValue = latest.onDate === today ? latest.value : null;

    /**
     * The baseline excludes today's own reading.
     *
     * Otherwise the comparison is partly against itself, which flattens
     * exactly the deviation the read is looking for — a single terrible night
     * drags the average it is being measured against down with it.
     */
    const history = points.filter((p: { onDate: string }) => p.onDate !== today);
    const baseline =
      history.length >= MIN_BASELINE_POINTS
        ? history.reduce((a: number, b: { value: number }) => a + b.value, 0) / history.length
        : null;

    readings[metric] = { today: todayValue, baseline };
    stats.push({ metric, value: latest.value, onDate: latest.onDate, baseline });
  }

  for (const metric of READ_METRICS) {
    if (!readings[metric]) readings[metric] = { today: null, baseline: null };
  }

  return { readings, stats };
}

// ─── The check-in ──────────────────────────────────────────────────────────

/**
 * Seven 1–5 answers, folded into the −3…+3 the engine expects.
 *
 * `signalLean` in terrainSignals.ts answers a different question — which side
 * of the practice this person is on — and returns a word. The engine wants
 * magnitude as well as direction, because "a bit flat" and "wrung out" should
 * not move the day by the same amount.
 *
 * Recovery, energy and nervous system pull down when low; drive and clarity
 * pull up when high. Body tension is inverted: a high number means *more*
 * tension, which is the one signal on the list where up is worse. Getting that
 * backwards would have made the tightest days read as the most capable.
 */
const DOWN_WHEN_LOW: readonly TerrainSignalId[] = ["recovery", "energy", "nervousSystem"];
const UP_WHEN_HIGH: readonly TerrainSignalId[] = ["drive", "mentalClarity"];

export function terrainLeanFrom(
  checkin: Partial<Record<TerrainSignalId, number | null>> | null,
): number | null {
  if (!checkin) return null;
  const answered = SIGNAL_KEYS.filter((k) => typeof checkin[k] === "number");
  // Two answers is a mood, not a reading. Below that the engine is better off
  // knowing nothing than knowing one number.
  if (answered.length < 3) return null;

  let lean = 0;
  for (const key of DOWN_WHEN_LOW) {
    const v = checkin[key];
    if (typeof v !== "number") continue;
    if (v <= 2) lean -= 1;
    else if (v >= 4) lean += 1;
  }
  for (const key of UP_WHEN_HIGH) {
    const v = checkin[key];
    if (typeof v !== "number") continue;
    if (v >= 4) lean += 1;
    else if (v <= 2) lean -= 1;
  }
  // High tension is a cost, not a capacity — the one inverted signal.
  const tension = checkin.bodyTension;
  if (typeof tension === "number") {
    if (tension >= 4) lean -= 1;
    else if (tension <= 2) lean += 1;
  }

  // Scaled back into the range the engine documents. Six contributing signals
  // could otherwise hand it a ±6 and quietly outweigh everything else.
  const scaled = Math.round((lean / 6) * 3);
  return Math.max(-3, Math.min(3, scaled));
}

export async function todaysCheckin(userId: string, today: string) {
  const [row] = await db
    .select()
    .from(terrainCheckins)
    .where(and(eq(terrainCheckins.userId, userId), eq(terrainCheckins.onDate, today)))
    .limit(1);
  return row ?? null;
}

// ─── Training load ─────────────────────────────────────────────────────────

export type TrainingRead = {
  hardSessionsRecently: number;
  daysSinceLastSession: number | null;
  /** Most recent first — what the novelty nudge reads. */
  recentCategories: string[];
};

/**
 * What they have actually been doing.
 *
 * "Hard" is decided by the category's own stress load rather than by duration
 * or by the member calling it hard, because those are the two numbers most
 * likely to be missing. A ninety-minute walk and a twenty-minute set of heavy
 * squats are not the same demand and only the category knows that.
 *
 * Only finished sessions count. An abandoned one is a session that did not
 * happen, and counting it would have the app telling somebody to rest because
 * of a workout they opened and walked away from.
 */
export async function trainingRead(userId: string, today: string): Promise<TrainingRead> {
  const since = shiftDate(today, -HABIT_WINDOW_DAYS);

  const rows = await db
    .select({
      onDate: workoutSessions.onDate,
      category: exercises.category,
    })
    .from(workoutSessions)
    .leftJoin(workoutSets, eq(workoutSets.sessionId, workoutSessions.id))
    .leftJoin(exercises, eq(exercises.id, workoutSets.exerciseId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.onDate, since),
        sql`${workoutSessions.finishedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(workoutSessions.onDate));

  const recentCategories: string[] = [];
  const seen = new Set<string>();
  const dates = new Set<string>();
  const hardDates = new Set<string>();

  for (const row of rows) {
    dates.add(row.onDate);
    if (!row.category) continue;
    if (!seen.has(row.category)) {
      seen.add(row.category);
      recentCategories.push(row.category);
    }
    if (
      categoryLoad(row.category).stress >= 2 &&
      daysBetween(row.onDate, today) <= RECENT_TRAINING_DAYS
    ) {
      // Counted per *day*, not per set — otherwise a single session with four
      // demanding movements in it reads as four hard sessions.
      hardDates.add(row.onDate);
    }
  }

  const lastDate = Array.from(dates).sort().pop() ?? null;

  return {
    hardSessionsRecently: hardDates.size,
    daysSinceLastSession: lastDate ? daysBetween(lastDate, today) : null,
    recentCategories,
  };
}

// ─── Rhythm ────────────────────────────────────────────────────────────────

export type SubjectRead = {
  id: string;
  relation: string;
  label: string | null;
  /** Asked outright. Null selects general guidance rather than a default. */
  subjectSex: "male" | "female" | null;
  supportPreference: string | null;
  model: RhythmModel;
  estimate: RhythmEstimate;
  /**
   * Contexts the member entered that are still true, newest first.
   *
   * Filtered by age here rather than in the guidance layer, because "still
   * true" is a fact about the calendar and the guidance layer is a pure
   * function that must not need to know today's date to be correct.
   */
  contexts: RhythmContextKind[];
};

/**
 * Every subject this member holds, each already turned into an estimate.
 *
 * Deriving here rather than storing is the same discipline `tracked_habit_phases`
 * follows: the events are the record, and the interpretation is recomputed on
 * every read so a change to the estimator cannot leave stale conclusions behind
 * in a column nobody remembers to migrate.
 */
export async function rhythmReads(userId: string, today: string): Promise<SubjectRead[]> {
  const subjects = await db
    .select()
    .from(rhythmSubjects)
    .where(and(eq(rhythmSubjects.ownerUserId, userId), isNull(rhythmSubjects.archivedAt)));

  if (!subjects.length) return [];

  const events = await db
    .select()
    .from(rhythmEvents)
    .where(
      and(
        inArray(
          rhythmEvents.subjectId,
          subjects.map((s) => s.id),
        ),
        isNull(rhythmEvents.supersededBy),
      ),
    )
    .orderBy(desc(rhythmEvents.onDate));

  return subjects.map((subject) => {
    const mine = events.filter((e) => e.subjectId === subject.id);
    // Newest first from the query, so the head of each filter is the latest.
    const lastPeriod = mine.find((e) => e.type === "period_started");
    const confirmed = mine.find((e) => e.type === "phase_confirmed");

    // A hard work week is over by the following week. Citing one a fortnight
    // later is worse than saying nothing — it is confidently stale, and the
    // member can see that it is wrong.
    const contexts = mine
      .filter(
        (e) =>
          e.type === "context_noted" &&
          e.contextKind &&
          daysBetween(e.onDate, today) <= CONTEXT_FRESH_DAYS,
      )
      .map((e) => e.contextKind as RhythmContextKind);

    const estimate = estimatePhase({
      model: subject.model as RhythmModel,
      lastPeriodStart: lastPeriod?.onDate ?? null,
      confirmedPhase: (confirmed?.phase as never) ?? null,
      confirmedOn: confirmed?.onDate ?? null,
      cycleLength: subject.cycleLength,
      periodLength: subject.periodLength,
      regular: subject.regular,
      today,
    });

    return {
      id: subject.id,
      relation: subject.relation,
      label: subject.label,
      subjectSex: (subject.subjectSex as "male" | "female" | null) ?? null,
      supportPreference: subject.supportPreference,
      model: subject.model as RhythmModel,
      estimate,
      contexts,
    };
  });
}

/**
 * What the member's *own* rhythm contributes to their day — and nothing else.
 *
 * A partner's phase must never move the member's readiness. It sounds obvious
 * written down and it is one join away from happening by accident, which is
 * why the filter is here and not left to the caller.
 */
export function ownCycleLean(reads: SubjectRead[]): number | null {
  const self = reads.find((r) => r.relation === "self");
  if (!self) return null;
  const lean = leanFromPhase(self.estimate);
  return lean === 0 ? null : lean;
}

// ─── What they've said no to ───────────────────────────────────────────────

export async function excludedCategories(userId: string, today: string): Promise<string[]> {
  const rows = await db
    .select({ category: suggestionDismissals.category })
    .from(suggestionDismissals)
    .where(
      and(
        eq(suggestionDismissals.userId, userId),
        or(isNull(suggestionDismissals.onDate), eq(suggestionDismissals.onDate, today)),
      ),
    );
  return Array.from(new Set(rows.map((r) => r.category)));
}

// ─── Assembly ──────────────────────────────────────────────────────────────

export function toReadinessSignals(input: {
  readings: Record<string, Reading>;
  terrainLean: number | null;
  training: TrainingRead;
  cycleLean: number | null;
}): ReadinessSignals {
  const { readings, terrainLean, training, cycleLean } = input;
  return {
    sleepMinutes: readings.sleepMinutes?.today ?? null,
    sleepBaselineMinutes: readings.sleepMinutes?.baseline ?? null,
    restingHeartRate: readings.restingHeartRate?.today ?? null,
    restingHeartRateBaseline: readings.restingHeartRate?.baseline ?? null,
    hrv: readings.heartRateVariability?.today ?? null,
    hrvBaseline: readings.heartRateVariability?.baseline ?? null,
    hardSessionsRecently: training.hardSessionsRecently,
    daysSinceLastSession: training.daysSinceLastSession,
    terrainLean,
    cycleLean,
  };
}
