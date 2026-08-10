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
export type MetricPlan = {
  /** The plugin's HealthDataType. */
  dataType: string;
  metric: HealthMetric;
  aggregation: "sum" | "average" | "min" | "max";
  /** Units we will accept from the plugin for this metric. */
  accepts: string[];
  /** Converts an accepted unit's value into our canonical unit. */
  convert?: (value: number, unit: string) => number;
};

export const METRIC_PLANS: MetricPlan[] = [
  // ── Movement: totals over the day ──
  { dataType: "steps", metric: "steps", aggregation: "sum", accepts: ["count"] },
  { dataType: "distance", metric: "distanceMeters", aggregation: "sum", accepts: ["meter"] },
  { dataType: "flightsClimbed", metric: "flightsClimbed", aggregation: "sum", accepts: ["count"] },
  { dataType: "exerciseTime", metric: "exerciseMinutes", aggregation: "sum", accepts: ["minute"] },
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

/** Every plugin data type we ask permission for, plus sleep and workouts. */
export const READ_TYPES: string[] = [
  ...METRIC_PLANS.map((p) => p.dataType),
  "sleep",
  "workouts",
];

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
export function foldSleep(
  samples: {
    startDate: string;
    endDate: string;
    sleepState?: string;
    stages?: { startDate: string; endDate: string; stage: string; durationMinutes: number }[];
    sourceName?: string;
  }[]
): CanonicalSample[] {
  const byDate = new Map<string, Record<string, number>>();
  const appByDate = new Map<string, string>();

  const add = (date: string, metric: string, minutes: number) => {
    if (!date || !Number.isFinite(minutes) || minutes <= 0) return;
    const day = byDate.get(date) ?? {};
    day[metric] = (day[metric] ?? 0) + minutes;
    byDate.set(date, day);
  };

  for (const s of samples) {
    const date = localDate(s.endDate || s.startDate);
    if (!date) continue;
    if (s.sourceName && !appByDate.has(date)) appByDate.set(date, s.sourceName);

    if (s.stages?.length) {
      for (const stage of s.stages) {
        const mins = stage.durationMinutes;
        // 'awake' is time in the session spent not sleeping — counted on its
        // own, and kept out of the total, which is what a member means by
        // "how long did I sleep".
        if (stage.stage === "awake") add(date, "sleepAwakeMinutes", mins);
        else {
          add(date, "sleepMinutes", mins);
          if (stage.stage === "deep") add(date, "sleepDeepMinutes", mins);
          if (stage.stage === "rem") add(date, "sleepRemMinutes", mins);
        }
      }
      continue;
    }

    // No stage breakdown: a plain session. 'inBed' is not sleep — Apple
    // records it from a phone on a nightstand, and counting it inflates a
    // member's sleep by however long they read.
    const minutes = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60_000;
    if (s.sleepState === "awake") add(date, "sleepAwakeMinutes", minutes);
    else if (s.sleepState !== "inBed") add(date, "sleepMinutes", minutes);
  }

  const out: CanonicalSample[] = [];
  byDate.forEach((metrics, onDate) => {
    Object.keys(metrics).forEach((metric) => {
      out.push({
        onDate,
        metric: metric as HealthMetric,
        value: Math.round(metrics[metric] * 100) / 100,
        unit: "min",
        sourceApp: appByDate.get(onDate) ?? null,
      });
    });
  });
  return out;
}
