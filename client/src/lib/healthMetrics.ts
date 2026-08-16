/**
 * Mapping the platforms' vocabulary onto ours.
 *
 * Pure functions only — no Capacitor import anywhere in this file. That is
 * what lets script/test-health.ts exercise the conversions in node, and the
 * conversions are the part most worth testing: a wrong factor here is a wrong
 * number on a coach's screen, and it looks completely plausible.
 *
 * Apple and Health Connect do not agree on names, units, or how a day is
 * bounded, and the plugin only partly papers over that. Everything crossing
 * into our API goes through here first so that an iPhone member and an Android
 * member land in the same column meaning the same thing.
 */

import type { HealthMetric } from "@shared/schema";

/**
 * A plugin data type, our metric, and how a day's worth of it is reduced.
 *
 * The aggregation is the interesting column. Summing steps is obviously right
 * and summing resting heart rate is obviously wrong, but the line between them
 * is per-metric knowledge that has to live somewhere explicit — the moment it
 * is implied by a helper's default, someone adds a metric and gets a day's
 * total body temperature.
 */
/** The two stores. Named here so the plans can say which of them they exist in. */
export type HealthPlatform = "healthkit" | "healthconnect";

export type MetricPlan = {
  /** The plugin's HealthDataType. */
  dataType: string;
  metric: HealthMetric;
  aggregation: "sum" | "average" | "min" | "max";
  /** Units we will accept from the plugin for this metric. */
  accepts: string[];
  /** Converts an accepted unit's value into our canonical unit. */
  convert?: (value: number, unit: string) => number;
  /**
   * Where this metric exists. Omitted means both, which is nearly everything.
   *
   * Not decoration. `requestAuthorization` sends the whole list in one call and
   * the Android plugin rejects the *entire* call on the first identifier it
   * does not recognise — so one metric that only Apple has took Health Connect
   * down at first contact, and the member saw "Unsupported data type:
   * exerciseTime" under a Connect button that could never work.
   */
  platforms?: HealthPlatform[];
};

export const METRIC_PLANS: MetricPlan[] = [
  // ── Movement: totals over the day ──
  { dataType: "steps", metric: "steps", aggregation: "sum", accepts: ["count"] },
  { dataType: "distance", metric: "distanceMeters", aggregation: "sum", accepts: ["meter"] },
  { dataType: "flightsClimbed", metric: "flightsClimbed", aggregation: "sum", accepts: ["count"] },
  {
    dataType: "exerciseTime",
    metric: "exerciseMinutes",
    aggregation: "sum",
    accepts: ["minute"],
    /**
     * Apple's own tally of exercise minutes. Health Connect has no equivalent
     * record — it models training as `ExerciseSessionRecord`, which carries a
     * start and an end — so the minutes are derived from the sessions
     * themselves on Android. See `exerciseMinutesFromWorkouts`.
     */
    platforms: ["healthkit"],
  },
  { dataType: "calories", metric: "activeCalories", aggregation: "sum", accepts: ["kilocalorie"] },
  { dataType: "totalCalories", metric: "totalCalories", aggregation: "sum", accepts: ["kilocalorie"] },

  // ── Heart: a representative value, never a total ──
  {
    dataType: "restingHeartRate",
    metric: "restingHeartRate",
    aggregation: "average",
    accepts: ["bpm", "count"],
  },
  {
    dataType: "heartRateVariability",
    metric: "heartRateVariability",
    aggregation: "average",
    accepts: ["millisecond"],
  },
  { dataType: "vo2Max", metric: "vo2Max", aggregation: "average", accepts: ["mL/min/kg"] },

  // ── Body ──
  { dataType: "weight", metric: "weightKg", aggregation: "average", accepts: ["kilogram"] },
  { dataType: "bodyFat", metric: "bodyFatPercent", aggregation: "average", accepts: ["percent"] },
  { dataType: "height", metric: "heightCm", aggregation: "max", accepts: ["centimeter"] },

  // ── Vitals ──
  {
    dataType: "respiratoryRate",
    metric: "respiratoryRate",
    aggregation: "average",
    accepts: ["count", "bpm"],
  },
  {
    dataType: "oxygenSaturation",
    metric: "oxygenSaturation",
    aggregation: "average",
    accepts: ["percent"],
    /**
     * HealthKit reports SpO2 as a fraction (0.97) and Health Connect as a
     * percentage (97). Both arrive labelled `percent`, so the unit cannot
     * distinguish them and the value has to.
     *
     * The ambiguity is bounded in our favour: a real saturation below 50% is
     * not something a consumer wearable records on a living person, so a value
     * at or under 1 is a fraction with certainty.
     */
    convert: (v) => (v <= 1 ? v * 100 : v),
  },
  {
    dataType: "bodyTemperature",
    metric: "bodyTemperatureC",
    aggregation: "average",
    accepts: ["celsius", "fahrenheit"],
    convert: (v, unit) => (unit === "fahrenheit" ? (v - 32) * (5 / 9) : v),
  },

  // ── Practice ──
  { dataType: "mindfulness", metric: "mindfulnessMinutes", aggregation: "sum", accepts: ["minute"] },
  {
    dataType: "dietaryWater",
    metric: "waterMl",
    aggregation: "sum",
    accepts: ["liter", "count"],
    // Litres on both platforms; `count` appears when the provider omits a unit.
    convert: (v, unit) => (unit === "liter" ? v * 1000 : v),
  },
  {
    dataType: "dietaryEnergyConsumed",
    metric: "dietaryCalories",
    aggregation: "sum",
    accepts: ["kilocalorie"],
  },
];

/** The metrics this platform actually has. */
export function plansFor(platform: HealthPlatform | null): MetricPlan[] {
  if (!platform) return METRIC_PLANS;
  return METRIC_PLANS.filter((p) => !p.platforms || p.platforms.includes(platform));
}

/**
 * Every data type we ask permission for on this platform, plus sleep and
 * workouts.
 *
 * ── Why this is per-platform and not one list ─────────────────────────────
 *
 * `requestAuthorization` sends the whole array in a single call, and the
 * Android plugin parses it before it does anything else: the first identifier
 * its enum does not recognise throws, and the call is rejected. Not that
 * metric — the call. So Health Connect never opened its permission sheet, and
 * the Settings screen showed "Unsupported data type: exerciseTime" in red
 * under a Connect button that could not work no matter how many times it was
 * pressed.
 *
 * One optional metric that only Apple has was enough to take the whole
 * integration down on Android. Asking each platform for what it has is the
 * fix; `script/test-health.ts` reads the plugin's own Kotlin enum and fails if
 * we ever ask Android for something it does not define, so the next divergence
 * is a failing test rather than a red line on a member's phone.
 */
export function readTypesFor(platform: HealthPlatform | null): string[] {
  return [...plansFor(platform).map((p) => p.dataType), "sleep", "workouts"];
}

/** Both platforms' types, for anything that has no platform in hand. */
export const READ_TYPES: string[] = readTypesFor(null);

/**
 * Exercise minutes, derived from the sessions rather than read as a metric.
 *
 * Health Connect records training as `ExerciseSessionRecord` — a start, an end
 * and a type — and the minutes Apple reports separately are, on Android,
 * simply how long those sessions lasted. Summed per member-local day, which is
 * the same day the workout rows are filed under, so the two cannot disagree
 * about which day a late-evening session belongs to.
 *
 * Rounded down to whole minutes and zero-length sessions dropped: a session
 * recorded with no duration is a session somebody's watch started and
 * abandoned, and counting it as a minute of exercise would be inventing one.
 */
export function exerciseMinutesFromWorkouts(
  workouts: readonly { onDate: string; durationSeconds?: number | null }[],
): { onDate: string; minutes: number }[] {
  const byDay = new Map<string, number>();
  for (const w of workouts) {
    const seconds = w.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    byDay.set(w.onDate, (byDay.get(w.onDate) ?? 0) + seconds);
  }
  return Array.from(byDay.entries())
    .map(([onDate, seconds]) => ({ onDate, minutes: Math.floor(seconds / 60) }))
    .filter((d) => d.minutes > 0)
    .sort((a, b) => a.onDate.localeCompare(b.onDate));
}

/**
 * The member's local calendar date for an instant.
 *
 * Not `toISOString().slice(0, 10)`, which is the UTC date: for a member in
 * Los Angeles everything after 5pm would be filed under tomorrow, so a day's
 * steps would split across two rows and both would look like a light day.
 * The device runs in the member's zone, so local components are the truth.
 */
export function localDate(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type CanonicalSample = {
  onDate: string;
  metric: HealthMetric;
  value: number;
  unit: string;
  sourceApp?: string | null;
};

/**
 * One aggregated bucket from the plugin → one row we can post, or null.
 *
 * Null rather than a guess when the unit is not one we recognise. The
 * temptation is to pass the value through with our canonical label attached,
 * which is precisely how a pound ends up in a column named kg — the row looks
 * right, reads right, and is wrong by a factor of 2.2.
 */
export function toCanonical(
  plan: MetricPlan,
  bucket: { startDate: string; value: number; unit: string },
  sourceApp?: string | null
): CanonicalSample | null {
  if (!plan.accepts.includes(bucket.unit)) return null;
  if (!Number.isFinite(bucket.value)) return null;
  const onDate = localDate(bucket.startDate);
  if (!onDate) return null;

  const value = plan.convert ? plan.convert(bucket.value, bucket.unit) : bucket.value;
  if (!Number.isFinite(value)) return null;

  return {
    onDate,
    metric: plan.metric,
    value: Math.round(value * 1000) / 1000,
    unit: CANONICAL_UNITS[plan.metric],
    sourceApp: sourceApp ?? null,
  };
}

/**
 * Our unit per metric, mirroring HEALTH_UNITS in shared/models/health.ts.
 *
 * Duplicated deliberately rather than imported: the server's copy is what it
 * validates against, and a client that derived its labels from the same object
 * could never disagree with it — which sounds good until you realise it means
 * the check can never fail, and a check that cannot fail is not a check.
 * script/test-health.ts asserts the two tables match.
 */
export const CANONICAL_UNITS: Record<HealthMetric, string> = {
  steps: "count",
  distanceMeters: "m",
  flightsClimbed: "count",
  exerciseMinutes: "min",
  activeCalories: "kcal",
  totalCalories: "kcal",
  restingHeartRate: "bpm",
  heartRateVariability: "ms",
  vo2Max: "mL/kg/min",
  sleepMinutes: "min",
  sleepDeepMinutes: "min",
  sleepRemMinutes: "min",
  sleepAwakeMinutes: "min",
  weightKg: "kg",
  bodyFatPercent: "%",
  heightCm: "cm",
  respiratoryRate: "brpm",
  oxygenSaturation: "%",
  bodyTemperatureC: "degC",
  mindfulnessMinutes: "min",
  waterMl: "mL",
  dietaryCalories: "kcal",
};

/**
 * Sleep, folded into daily totals by stage.
 *
 * Sleep is the one metric where the day boundary is genuinely wrong by
 * default. A session from 23:40 Tuesday to 07:10 Wednesday is, to everyone
 * except a date function, Wednesday's sleep — so a session is attributed to
 * the date it ENDS on. Bucketing it by start date would file most people's
 * sleep under the previous day, and would move it between days depending on
 * whether they happened to fall asleep before or after midnight.
 */
/**
 * Ninety minutes. See the note in foldSleep, and HealthSyncEngine.swift, which
 * has to agree with this — the two paths write to the same rows, and a night
 * that lands on different days depending on which one ran is worse than either
 * rule on its own.
 */
const SESSION_GAP_MS = 90 * 60 * 1000;

/**
 * For every stage-level sample, when the sleep it belongs to ended.
 *
 * Samples carrying their own `stages` are already whole sessions and are left
 * alone. The rest are sorted by start and walked once, extending the open
 * session while the next sample begins within SESSION_GAP_MS of the furthest
 * end seen so far — the furthest end, not the previous sample's, because
 * sources overlap and one long span from a watch can enclose several short
 * ones from a ring.
 */
function sessionEnds<T extends { startDate: string; endDate: string; stages?: unknown[] }>(
  samples: T[],
): Map<T, string> {
  const loose = samples
    .filter((s) => !s.stages?.length && s.startDate && s.endDate)
    .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));

  const ends = new Map<T, string>();
  let group: T[] = [];
  let openEnd = -Infinity;

  const close = () => {
    if (!group.length) return;
    const last = group.reduce((a, b) => (Date.parse(a.endDate) >= Date.parse(b.endDate) ? a : b));
    for (const s of group) ends.set(s, last.endDate);
    group = [];
  };

  for (const s of loose) {
    const start = Date.parse(s.startDate);
    const end = Date.parse(s.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (group.length && start > openEnd + SESSION_GAP_MS) close();
    group.push(s);
    openEnd = Math.max(openEnd, end);
  }
  close();

  return ends;
}

export function foldSleep(
  samples: {
    startDate: string;
    endDate: string;
    sleepState?: string;
    stages?: { startDate: string; endDate: string; stage: string; durationMinutes: number }[];
    sourceName?: string;
  }[]
): CanonicalSample[] {
  const byDate = new Map<string, Map<string, [number, number][]>>();
  const durationByDate = new Map<string, Map<string, number>>();
  const appByDate = new Map<string, string>();

  /**
   * Intervals, not durations.
   *
   * A member with a watch *and* a ring has every minute of the night reported
   * twice, and adding those durations is how one eight-hour night becomes
   * sixteen. Two sources agreeing about the same 3am add nothing to each
   * other — agreement is not extra sleep — so what gets stored is how much of
   * the clock was covered, which is the union. `unionMinutes` does that at the
   * end; this only collects.
   */
  const add = (date: string, metric: string, from: string, to: string) => {
    const start = Date.parse(from);
    const end = Date.parse(to);
    if (!date || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const day = byDate.get(date) ?? new Map<string, [number, number][]>();
    const spans = day.get(metric) ?? [];
    spans.push([start, end]);
    day.set(metric, spans);
    byDate.set(date, day);
  };

  /**
   * The fallback for a source that reports a stage's length but not when it
   * happened. There is nothing to union — a duration with no place on the
   * clock cannot be compared with anything — so it is added, and a member
   * whose only source is one of these keeps working exactly as before.
   */
  const addDuration = (date: string, metric: string, minutes: number) => {
    if (!date || !Number.isFinite(minutes) || minutes <= 0) return;
    const day = durationByDate.get(date) ?? new Map<string, number>();
    day.set(metric, (day.get(metric) ?? 0) + minutes);
    durationByDate.set(date, day);
  };

  /*
    A stage is dated by the night it belongs to, not by its own clock.

    Some platforms hand back one session with its stages inside it, and that
    session already knows when it ended. Others hand back the stages loose —
    core, deep, REM, awake, each a few minutes long and each its own record.
    Dating those individually files everything before midnight under the day
    before, so falling asleep at 23:15 costs the member three quarters of an
    hour off last night and adds it to the night before. Neither day is then
    true, and neither is wrong enough to look broken.

    So the loose ones are grouped into sessions first, on the same rule the
    iOS plugin uses: a gap of SESSION_GAP_MS or more starts a new sleep. Below
    that it is the same night, awake stretches included. Above it — an
    afternoon nap — it is a separate sleep on its own day.
  */
  const sessionEnd = sessionEnds(samples);

  for (const s of samples) {
    const date = s.stages?.length
      ? localDate(s.endDate || s.startDate)
      : localDate(sessionEnd.get(s) ?? s.endDate ?? s.startDate);
    if (!date) continue;
    if (s.sourceName && !appByDate.has(date)) appByDate.set(date, s.sourceName);

    if (s.stages?.length) {
      for (const stage of s.stages) {
        const timed = Number.isFinite(Date.parse(stage.startDate ?? "")) &&
          Number.isFinite(Date.parse(stage.endDate ?? ""));
        const put = (metric: string) =>
          timed
            ? add(date, metric, stage.startDate, stage.endDate)
            : addDuration(date, metric, stage.durationMinutes);

        // 'awake' is time in the session spent not sleeping — counted on its
        // own, and kept out of the total, which is what a member means by
        // "how long did I sleep".
        if (stage.stage === "awake") put("sleepAwakeMinutes");
        else {
          put("sleepMinutes");
          if (stage.stage === "deep") put("sleepDeepMinutes");
          if (stage.stage === "rem") put("sleepRemMinutes");
        }
      }
      continue;
    }

    // No stage breakdown: a plain session. 'inBed' is not sleep — Apple
    // records it from a phone on a nightstand, and counting it inflates a
    // member's sleep by however long they read.
    if (s.sleepState === "awake") add(date, "sleepAwakeMinutes", s.startDate, s.endDate);
    else if (s.sleepState !== "inBed") add(date, "sleepMinutes", s.startDate, s.endDate);
  }

  const out: CanonicalSample[] = [];
  const dates = new Set([...Array.from(byDate.keys()), ...Array.from(durationByDate.keys())]);

  dates.forEach((onDate) => {
    const spansByMetric = byDate.get(onDate) ?? new Map<string, [number, number][]>();
    const sumsByMetric = durationByDate.get(onDate) ?? new Map<string, number>();
    const metrics = new Set([
      ...Array.from(spansByMetric.keys()),
      ...Array.from(sumsByMetric.keys()),
    ]);

    metrics.forEach((metric) => {
      const minutes =
        unionMinutes(spansByMetric.get(metric) ?? []) + (sumsByMetric.get(metric) ?? 0);
      if (minutes <= 0) return;
      out.push({
        onDate,
        metric: metric as HealthMetric,
        value: Math.round(minutes * 100) / 100,
        unit: "min",
        sourceApp: appByDate.get(onDate) ?? null,
      });
    });
  });
  return out;
}

/**
 * Minutes covered by these intervals, counting overlaps once.
 *
 * Sort by start, walk once, extend the open span while the next one begins
 * before the current one ends. The mirror of `unionedMinutes` in
 * HealthSyncEngine.swift — both paths write the same rows, so they have to
 * answer the same way.
 */
function unionMinutes(spans: [number, number][]): number {
  if (!spans.length) return 0;
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [openStart, openEnd] = sorted[0];

  for (const [start, end] of sorted.slice(1)) {
    if (start > openEnd) {
      total += openEnd - openStart;
      openStart = start;
      openEnd = end;
    } else if (end > openEnd) {
      // Overlapping or touching — absorb it rather than add it.
      openEnd = end;
    }
  }
  total += openEnd - openStart;
  return total / 60_000;
}
