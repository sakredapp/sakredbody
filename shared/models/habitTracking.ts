/**
 * How a habit is measured — the lookups the columns are derived from.
 *
 * ── Why three of the proposed columns are not here ────────────────────────
 *
 * The spec asked for seven fields: trackingType, unit, defaultTarget,
 * healthDataSource, autoTrackEligible, polarityStrength and contextDependent.
 * Four are stored. The other three are derived, because each of them can only
 * ever restate something already known:
 *
 *   unit              — hours are always hours. A `unit` column exists to be
 *                       set to "minutes" on a habit whose trackingType is
 *                       "hours", and then something displays 8 minutes of sleep.
 *   autoTrackEligible — a habit is auto-trackable exactly when a health metric
 *                       can answer it. Storing both allows a row that claims
 *                       to be auto-trackable with nothing to read from.
 *   contextDependent  — the same fact as polarityStrength === "contextual",
 *                       spelled twice.
 *
 * A derived value cannot disagree with its source. A second column can, and
 * on a 120-row catalogue somebody eventually makes it.
 */

import type { HealthMetric } from "./health.js";

export const TRACKING_TYPES = [
  { id: "boolean", label: "Done or not", unit: null, decimals: 0 },
  { id: "minutes", label: "Minutes", unit: "min", decimals: 0 },
  { id: "hours", label: "Hours", unit: "h", decimals: 1 },
  { id: "count", label: "Count", unit: null, decimals: 0 },
  { id: "steps", label: "Steps", unit: "steps", decimals: 0 },
  { id: "ounces", label: "Fluid ounces", unit: "oz", decimals: 0 },
  { id: "litres", label: "Litres", unit: "L", decimals: 1 },
  { id: "grams", label: "Grams", unit: "g", decimals: 0 },
  { id: "servings", label: "Servings", unit: null, decimals: 0 },
  { id: "rating", label: "Rating out of 10", unit: "/10", decimals: 0 },
  { id: "time-of-day", label: "Time of day", unit: null, decimals: 0 },
] as const;

export type TrackingType = (typeof TRACKING_TYPES)[number]["id"];

const BY_ID = new Map(TRACKING_TYPES.map((t) => [t.id as string, t]));

/** Unknown types fall back to boolean rather than throwing on a member's screen. */
export function trackingMeta(type: string) {
  return BY_ID.get(type) ?? TRACKING_TYPES[0];
}

export function unitFor(type: string): string | null {
  return trackingMeta(type).unit;
}

/**
 * Format a value the way its habit should read.
 *
 * 7.7 hours is "7h 42m", not "7.7 h" — nobody has ever thought about their
 * sleep in tenths of an hour.
 */
export function formatTracked(type: string, value: number): string {
  if (type === "boolean") return value ? "Done" : "Not yet";
  if (type === "hours") {
    const h = Math.floor(value);
    const m = Math.round((value - h) * 60);
    return `${h}h ${m}m`;
  }
  const meta = trackingMeta(type);
  const n = meta.decimals === 0 ? Math.round(value) : Number(value.toFixed(meta.decimals));
  const pretty = type === "steps" ? n.toLocaleString() : String(n);
  return meta.unit ? `${pretty}${meta.unit === "/10" ? meta.unit : ` ${meta.unit}`}` : pretty;
}

/**
 * Can the phone answer this without anybody tapping?
 *
 * Derived, not stored: it is true exactly when there is a metric to read.
 */
export function autoTrackEligible(healthMetric: string | null | undefined): boolean {
  return Boolean(healthMetric);
}

export const POLARITY_STRENGTHS = ["strong", "contextual"] as const;
export type PolarityStrength = (typeof POLARITY_STRENGTHS)[number];

/**
 * Does this habit settle which way a day leaned?
 *
 * Sleep and a protein target do. Walking, breathwork, heat and fasting do not:
 * fasting sounds clearing and is a substantial stressor, heat creates demand
 * now and supports recovery later. Those still carry an emphasis — a member
 * needs to see them on a card — but the terrain reading should not treat them
 * as evidence, which is the difference between a model and a label.
 */
export function countsTowardLean(polarityStrength: string): boolean {
  return polarityStrength !== "contextual";
}

/**
 * Which health metric satisfies which habit, for the ones a phone can answer.
 * Everything absent from here is a person's own word, and always will be.
 */
export const AUTO_TRACKABLE: readonly HealthMetric[] = [
  "sleepMinutes",
  "steps",
  "exerciseMinutes",
  "activeCalories",
  "distanceMeters",
  "flightsClimbed",
  "mindfulnessMinutes",
  "waterMl",
  "dietaryCalories",
] as const;

// ─── Practice · Target · Metric ────────────────────────────────────────────

/**
 * The three shapes a catalogue item takes, derived rather than stored.
 *
 *   practice  "Take magnesium before bed"   — done or not
 *   target    "Hit 160g protein"            — a number the member enters
 *   metric    "Sleep 7h 42m"                — a number the phone already knows
 *
 * A fourth column would only restate `trackingType` and `healthMetric`, and
 * could then contradict them — a row claiming to be a metric with nothing to
 * read from, or a practice carrying a target. Same reasoning as `unit`,
 * `autoTrackEligible` and `contextDependent`: derive it, don't duplicate it.
 *
 * All three live equally inside Restore or Build. That is the point of the
 * split: a Restore list reading "Sleep 7h 42m / 8h · Water 2.4 / 3L ·
 * Magnesium ✓" is a terrain readout, not a checklist, and the item type is
 * what lets one screen render all three.
 */
export type ItemType = "practice" | "target" | "metric";

export function itemTypeOf(
  trackingType: string,
  healthMetric: string | null | undefined,
): ItemType {
  if (trackingType === "boolean") return "practice";
  return healthMetric ? "metric" : "target";
}

export const ITEM_TYPE_LABEL: Readonly<Record<ItemType, string>> = {
  practice: "Practice",
  target: "Target",
  metric: "Metric",
};
