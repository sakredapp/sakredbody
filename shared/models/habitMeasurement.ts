/**
 * What a number means on a given day.
 *
 * ── The problem this file exists to prevent ───────────────────────────────
 *
 * "Water: 20oz" can mean four different things depending on who wrote the
 * screen: add 20 to today, set today to 20, today's largest reading was 20, or
 * the most recent reading was 20. Water wants the first. Sleep wants the last.
 * If each component decides for itself, one screen shows 80oz and another
 * shows 20, and both are reading the same rows.
 *
 * So the entry carries an operation and the operation has a default derived
 * from the tracking type — the same discipline as `unit` and `itemType` in
 * habitTracking.ts. A member tapping "+20oz" four times writes four `add`
 * rows; a member correcting the total writes one `set`. Folding is the same
 * code either way.
 *
 * ── And the second problem ────────────────────────────────────────────────
 *
 * `health_days` already holds normalized daily health data. Copying an Apple
 * Health step count into a habit entry would give us two stored truths that
 * drift the moment the phone re-syncs a corrected day. So health-backed habits
 * *read* health_days and never write entries, and the resolver below is what
 * makes both look identical to everything above it.
 *
 * The one rule that must never bend: a HealthKit step total and a manually
 * entered step count are never summed.
 */

import type { HealthMetric } from "./health.js";
import { trackingMeta } from "./habitTracking.js";

// ─── How a day's readings combine ──────────────────────────────────────────

/**
 * cumulative  the day is the sum of what you did — water, protein, steps,
 *             minutes of breathwork, movement breaks.
 * observed    the day has one value and later readings replace earlier ones —
 *             sleep, HRV, a rating out of ten, the time you got to bed.
 */
export type Aggregation = "cumulative" | "observed";

const AGGREGATION: Record<string, Aggregation> = {
  boolean: "observed",
  minutes: "cumulative",
  hours: "observed",
  count: "cumulative",
  steps: "cumulative",
  ounces: "cumulative",
  litres: "cumulative",
  grams: "cumulative",
  servings: "cumulative",
  rating: "observed",
  "time-of-day": "observed",
  calories: "cumulative",
  meals: "cumulative",
};

export function aggregationOf(trackingType: string): Aggregation {
  return AGGREGATION[trackingType] ?? "observed";
}

/**
 * `hours` is observed rather than cumulative on purpose: the only hours we
 * track are sleep, and two naps plus a night is not an eleven-hour night.
 * Anything genuinely additive and time-shaped uses `minutes`.
 */
export const ENTRY_OPS = ["add", "set"] as const;
export type EntryOp = (typeof ENTRY_OPS)[number];

export function defaultEntryOp(trackingType: string): EntryOp {
  return aggregationOf(trackingType) === "cumulative" ? "add" : "set";
}

export type Entry = {
  value: number;
  op: string;
  /** 'manual' | 'override' — an override outranks health data for its day. */
  kind?: string;
};

/**
 * Fold a day's entries into one number.
 *
 * Order matters and is the caller's job: entries arrive sorted by creation
 * time, so a `set` written at 9pm wipes the `add`s from the morning, which is
 * exactly what "actually, the total was 165" should do.
 */
export function foldEntries(entries: readonly Entry[]): number {
  let total = 0;
  for (const e of entries) {
    if (!Number.isFinite(e.value)) continue;
    total = e.op === "set" ? e.value : total + e.value;
  }
  return total;
}

// ─── Health as a source ────────────────────────────────────────────────────

/**
 * Convert a normalized health value into the habit's own unit.
 *
 * `health_days` stores what the platform means — minutes of sleep, millilitres
 * of water, metres walked. A habit tracked in hours or fluid ounces needs the
 * same fact in its own vocabulary, and doing that arithmetic at the render
 * site is how one screen shows 7.7 and another shows 462.
 */
export function convertHealthValue(
  metric: string,
  value: number,
  trackingType: string,
): number | null {
  const from = HEALTH_NATIVE[metric as HealthMetric];
  if (!from) return null;
  if (from === trackingType) return value;
  const factor = CONVERSIONS[`${from}→${trackingType}`];
  return factor === undefined ? null : value * factor;
}

/** The tracking type each health metric is natively expressed in. */
const HEALTH_NATIVE: Partial<Record<HealthMetric, string>> = {
  steps: "steps",
  exerciseMinutes: "minutes",
  mindfulnessMinutes: "minutes",
  sleepMinutes: "minutes",
  sleepDeepMinutes: "minutes",
  sleepRemMinutes: "minutes",
  activeCalories: "calories",
  totalCalories: "calories",
  dietaryCalories: "calories",
  waterMl: "millilitres",
  distanceMeters: "metres",
  flightsClimbed: "count",
};

const CONVERSIONS: Record<string, number> = {
  "minutes→hours": 1 / 60,
  "hours→minutes": 60,
  "millilitres→litres": 1 / 1000,
  "millilitres→ounces": 1 / 29.5735,
  "metres→count": 1, // a distance habit tracked as a bare count of metres
  "steps→count": 1,
  "count→steps": 1,
};

// ─── Precedence ────────────────────────────────────────────────────────────

/**
 * Where today's number came from.
 *
 *   health    the phone answered it
 *   override  the member corrected the phone, or filled a day it missed
 *   manual    they typed it, and there was no health data to disagree with
 *   none      nothing yet
 */
export const VALUE_SOURCES = ["health", "override", "manual", "none"] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

export type ResolvedValue = {
  value: number;
  source: ValueSource;
  /** True when the phone could have answered this and didn't. */
  healthExpectedButMissing: boolean;
};

/**
 * The one precedence rule, written once.
 *
 *   1. an explicit override for that day
 *   2. health data
 *   3. manual entries — only when there is no health value to contradict
 *
 * Step 3's condition is the important one. Falling back to manual when health
 * is silent is a kindness on the day Health Access was denied; *adding* manual
 * to health is a bug that doubles somebody's step count and looks like a
 * device problem.
 */
export function resolveDailyValue(input: {
  trackingType: string;
  healthMetric?: string | null;
  healthValue?: number | null;
  entries: readonly Entry[];
}): ResolvedValue {
  const overrides = input.entries.filter((e) => e.kind === "override");
  const manual = input.entries.filter((e) => e.kind !== "override");

  const health =
    input.healthMetric && input.healthValue != null
      ? convertHealthValue(input.healthMetric, input.healthValue, input.trackingType)
      : null;

  if (overrides.length) {
    return {
      value: foldEntries(overrides),
      source: "override",
      healthExpectedButMissing: false,
    };
  }
  if (health != null) {
    return { value: health, source: "health", healthExpectedButMissing: false };
  }
  if (manual.length) {
    return {
      value: foldEntries(manual),
      source: "manual",
      healthExpectedButMissing: Boolean(input.healthMetric),
    };
  }
  return {
    value: 0,
    source: "none",
    healthExpectedButMissing: Boolean(input.healthMetric),
  };
}

/**
 * Can a person answer this by hand when the phone can't?
 *
 * Steps, water and mindfulness minutes: yes — somebody knows roughly what they
 * did. Heart rate variability: no. A member typing an HRV they did not measure
 * is inventing data, and a coach reading it cannot tell.
 */
const NO_MANUAL_FALLBACK: readonly string[] = [
  "heartRateVariability",
  "restingHeartRate",
  "vo2Max",
  "respiratoryRate",
  "oxygenSaturation",
  "bodyTemperatureC",
];

export function manualFallbackAllowed(healthMetric: string | null | undefined): boolean {
  if (!healthMetric) return true; // nothing to fall back from; it was always manual
  return !NO_MANUAL_FALLBACK.includes(healthMetric);
}

// ─── Progress ──────────────────────────────────────────────────────────────

export type ProgressState = "none" | "partial" | "met" | "over";

export function progressStateOf(
  trackingType: string,
  value: number,
  target: number | null | undefined,
): ProgressState {
  if (trackingType === "boolean") return value >= 1 ? "met" : "none";
  if (!target || target <= 0) return value > 0 ? "partial" : "none";
  if (value >= target * 1.25) return "over";
  if (value >= target) return "met";
  return value > 0 ? "partial" : "none";
}

/** "148 / 165 g" · "7h 42m / 8h" · "Done". What a card actually prints. */
export function describeProgress(
  trackingType: string,
  value: number,
  target: number | null | undefined,
): string {
  if (trackingType === "boolean") return value >= 1 ? "Done" : "Not yet";
  const meta = trackingMeta(trackingType);
  const fmt = (n: number) =>
    meta.decimals === 0 ? Math.round(n).toLocaleString() : n.toFixed(meta.decimals);
  const unit = meta.unit ? ` ${meta.unit}` : "";
  if (trackingType === "hours") {
    const hm = (n: number) => `${Math.floor(n)}h ${Math.round((n - Math.floor(n)) * 60)}m`;
    return target ? `${hm(value)} / ${hm(target)}` : hm(value);
  }
  return target ? `${fmt(value)} / ${fmt(target)}${unit}` : `${fmt(value)}${unit}`;
}
