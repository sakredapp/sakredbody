/**
 * How each metric is shown.
 *
 * One entry per metric in healthMetricEnum, enforced by script/test-health.ts.
 * That enforcement is the point of the file: without it, adding a metric to the
 * sync is a two-line change that stores data and displays nothing, and the
 * absence looks identical to "the member has no data for that".
 *
 * Formatting lives here rather than in the components because the same number
 * is rendered in three places — the member's Stats card, the coach's member
 * panel, and any future detail view — and a duration formatted as "442" in one
 * of them and "7h 22m" in the others is the kind of inconsistency nobody files
 * a bug about and everybody notices.
 */

import type { HealthMetric } from "@shared/schema";

export type MetricGroup = "Movement" | "Sleep" | "Heart" | "Body" | "Vitals" | "Practice";

/** The order groups appear in. Movement first: it is what most members open for. */
export const GROUP_ORDER: MetricGroup[] = [
  "Movement",
  "Sleep",
  "Heart",
  "Body",
  "Vitals",
  "Practice",
];

export type MetricDisplay = {
  label: string;
  group: MetricGroup;
  /** A whole value, formatted with its unit. */
  format: (value: number) => string;
  /**
   * How a window of days collapses into one headline number.
   *
   * "total" would be wrong for anything measured rather than accumulated — a
   * 30-day total resting heart rate is meaningless — and "average" is wrong for
   * steps, where a member wants their typical day, not the month's sum. Both
   * are per-metric decisions, so both are written down.
   */
  summarise: "average" | "latest";
  /**
   * Which direction is an improvement, for trend colouring. `null` where there
   * is no such thing — weight is a goal, not a virtue, and colouring it green
   * for down is the app taking a position it has no business taking.
   */
  higherIsBetter: boolean | null;
};

function hoursMinutes(value: number): string {
  const total = Math.round(value);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const round = (v: number, dp = 0) =>
  v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const METRIC_DISPLAY: Record<HealthMetric, MetricDisplay> = {
  // ── Movement ──
  steps: {
    label: "Steps",
    group: "Movement",
    format: (v) => round(v),
    summarise: "average",
    higherIsBetter: true,
  },
  distanceMeters: {
    label: "Distance",
    group: "Movement",
    // Kilometres to a member; metres in the column. Storing SI and displaying
    // human is the whole reason the two are separate concerns.
    format: (v) => `${round(v / 1000, 1)} km`,
    summarise: "average",
    higherIsBetter: true,
  },
  flightsClimbed: {
    label: "Flights",
    group: "Movement",
    format: (v) => round(v),
    summarise: "average",
    higherIsBetter: true,
  },
  exerciseMinutes: {
    label: "Exercise",
    group: "Movement",
    format: hoursMinutes,
    summarise: "average",
    higherIsBetter: true,
  },
  activeCalories: {
    label: "Active burn",
    group: "Movement",
    format: (v) => `${round(v)} kcal`,
    summarise: "average",
    higherIsBetter: true,
  },
  totalCalories: {
    label: "Total burn",
    group: "Movement",
    format: (v) => `${round(v)} kcal`,
    summarise: "average",
    higherIsBetter: null,
  },

  // ── Sleep ──
  sleepMinutes: {
    label: "Sleep",
    group: "Sleep",
    format: hoursMinutes,
    summarise: "average",
    higherIsBetter: true,
  },
  sleepDeepMinutes: {
    label: "Deep",
    group: "Sleep",
    format: hoursMinutes,
    summarise: "average",
    higherIsBetter: true,
  },
  sleepRemMinutes: {
    label: "REM",
    group: "Sleep",
    format: hoursMinutes,
    summarise: "average",
    higherIsBetter: true,
  },
  sleepAwakeMinutes: {
    label: "Awake",
    group: "Sleep",
    format: hoursMinutes,
    summarise: "average",
    // Time awake inside a sleep session is the one sleep number where less is
    // the good outcome.
    higherIsBetter: false,
  },

  // ── Heart ──
  restingHeartRate: {
    label: "Resting HR",
    group: "Heart",
    format: (v) => `${round(v)} bpm`,
    summarise: "average",
    // Rising resting heart rate is the classic overreaching signal.
    higherIsBetter: false,
  },
  heartRateVariability: {
    label: "HRV",
    group: "Heart",
    format: (v) => `${round(v)} ms`,
    summarise: "average",
    higherIsBetter: true,
  },
  vo2Max: {
    label: "VO₂ max",
    group: "Heart",
    format: (v) => round(v, 1),
    // Latest, not average: VO2 max is an estimate the device revises, so the
    // current one is the answer and a 30-day mean just lags it.
    summarise: "latest",
    higherIsBetter: true,
  },

  // ── Body ──
  weightKg: {
    label: "Weight",
    group: "Body",
    format: (v) => `${round(v, 1)} kg`,
    summarise: "latest",
    higherIsBetter: null,
  },
  bodyFatPercent: {
    label: "Body fat",
    group: "Body",
    format: (v) => `${round(v, 1)}%`,
    summarise: "latest",
    higherIsBetter: null,
  },
  heightCm: {
    label: "Height",
    group: "Body",
    format: (v) => `${round(v)} cm`,
    summarise: "latest",
    higherIsBetter: null,
  },

  // ── Vitals ──
  respiratoryRate: {
    label: "Respiratory rate",
    group: "Vitals",
    format: (v) => `${round(v, 1)} /min`,
    summarise: "average",
    higherIsBetter: null,
  },
  oxygenSaturation: {
    label: "Blood oxygen",
    group: "Vitals",
    format: (v) => `${round(v, 1)}%`,
    summarise: "average",
    higherIsBetter: true,
  },
  bodyTemperatureC: {
    label: "Body temp",
    group: "Vitals",
    format: (v) => `${round(v, 1)}°C`,
    summarise: "average",
    higherIsBetter: null,
  },

  // ── Practice ──
  mindfulnessMinutes: {
    label: "Mindfulness",
    group: "Practice",
    format: hoursMinutes,
    summarise: "average",
    higherIsBetter: true,
  },
  waterMl: {
    label: "Water",
    group: "Practice",
    format: (v) => `${round(v / 1000, 1)} L`,
    summarise: "average",
    higherIsBetter: true,
  },
  dietaryCalories: {
    label: "Eaten",
    group: "Practice",
    format: (v) => `${round(v)} kcal`,
    summarise: "average",
    higherIsBetter: null,
  },
};

export type DaySeries = { onDate: string } & Partial<Record<HealthMetric, number>>;

/**
 * The headline number for a metric over a window, plus the baseline to compare
 * it against — or null when there is nothing to show.
 *
 * Returning null rather than 0 matters: a member with no HRV data and a member
 * whose HRV is genuinely 0 are different situations, and only one of them
 * should render a tile.
 */
export function summarise(
  days: DaySeries[],
  metric: HealthMetric,
  recentDays = 7
): { value: number; baseline: number | null; days: number } | null {
  const display = METRIC_DISPLAY[metric];
  if (!display) return null;

  const points = days
    .map((d) => ({ onDate: d.onDate, value: d[metric] }))
    .filter((p): p is { onDate: string; value: number } => typeof p.value === "number");
  if (!points.length) return null;

  const recent = points.slice(-recentDays);

  const mean = (xs: { value: number }[]) =>
    xs.reduce((a, b) => a + b.value, 0) / (xs.length || 1);

  const value = display.summarise === "latest" ? points[points.length - 1].value : mean(recent);

  // A baseline drawn from the same days as the value compares a window with
  // itself and always reads as flat. Only the days BEFORE the recent window
  // count, and only if there are enough of them to mean anything.
  const older = points.slice(0, Math.max(0, points.length - recentDays));
  const baseline = display.summarise === "latest" || older.length < 3 ? null : mean(older);

  return { value, baseline, days: points.length };
}

/** Metrics that actually have data, in display order, grouped. */
export function groupsWithData(
  days: DaySeries[]
): { group: MetricGroup; metrics: HealthMetric[] }[] {
  const present = (Object.keys(METRIC_DISPLAY) as HealthMetric[]).filter((m) =>
    days.some((d) => typeof d[m] === "number")
  );

  return GROUP_ORDER.map((group) => ({
    group,
    metrics: present.filter((m) => METRIC_DISPLAY[m].group === group),
  })).filter((g) => g.metrics.length > 0);
}

/**
 * The order a coach would look in, for the home-screen swatches.
 *
 * Anything not listed still qualifies — it falls in behind these, so a member
 * who only shares steps and water gets steps and water rather than nothing.
 */
export const SWATCH_PRIORITY: HealthMetric[] = [
  "sleepMinutes",
  "restingHeartRate",
  "heartRateVariability",
  "steps",
  "activeCalories",
  "exerciseMinutes",
  "weightKg",
  "vo2Max",
  "oxygenSaturation",
  "respiratoryRate",
  "distanceMeters",
  "mindfulnessMinutes",
  "waterMl",
];

/**
 * Which metrics this member actually has, best first.
 *
 * Extracted from the component so it can be tested, because the rule it
 * encodes is the one that matters: a tile must never appear for a metric we do
 * not hold data for. An empty or zeroed tile reads as the app being broken,
 * not as the member not sharing that category — and the member cannot tell
 * those apart from the outside.
 *
 * "Has data" means at least one day with a number AND at least one of those
 * numbers above zero. The second half is the part that is easy to miss: a
 * metric whose every reading is 0 is one the device is reporting but nobody is
 * recording, and "Water 0.0 L" is exactly the tile that looks like a bug.
 */
export function pickSwatches(days: DaySeries[], limit = 4): HealthMetric[] {
  const ranked = [
    ...SWATCH_PRIORITY,
    ...(Object.keys(METRIC_DISPLAY) as HealthMetric[]).filter(
      (m) => !SWATCH_PRIORITY.includes(m)
    ),
  ];

  const held = ranked.filter((metric) => {
    let seen = false;
    for (const day of days) {
      const value = day[metric];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      seen = true;
      if (value > 0) return true;
    }
    // Seen but never above zero — the device reports it, nobody records it.
    return seen ? false : false;
  });

  return held.slice(0, limit);
}
