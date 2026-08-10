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
/**
 * Daily goals, for the metrics where one exists outside this app.
 *
 * Deliberately sparse. A ring implies a target, and a target implies we are
 * telling a member what their body should be doing — which for most of these
 * we have no business doing. Ten thousand steps, half an hour of movement,
 * eight hours of sleep and two litres of water are conventions a member
 * already carries in their head from every other device they own; putting a
 * ring on them reflects an expectation they arrived with. Inventing one for
 * resting heart rate or body fat would be the app taking a clinical position.
 *
 * Anything absent here simply never renders as a ring. That is the mechanism,
 * not an oversight — see planTiles.
 */
export const METRIC_TARGET: Partial<Record<HealthMetric, number>> = {
  steps: 10_000,
  exerciseMinutes: 30,
  activeCalories: 500,
  sleepMinutes: 8 * 60,
  mindfulnessMinutes: 10,
  waterMl: 2500,
  flightsClimbed: 10,
};

/**
 * The last `limit` readings for a metric, oldest first.
 *
 * Missing days are skipped rather than filled with zero. Filling would draw a
 * line to the floor on a day the member simply did not wear the watch, which
 * on a sleep chart reads as a catastrophic night rather than as absence — the
 * single most misleading thing a small chart can do. The cost is an x-axis
 * that is not strictly even, which at this size nobody can perceive.
 */
export function seriesFor(days: DaySeries[], metric: HealthMetric, limit = 14): number[] {
  const values: number[] = [];
  for (const day of days) {
    const value = day[metric];
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  }
  return values.slice(-limit);
}

/** How a tile draws itself. Derived from the data, never assigned by hand. */
export type TileShape = "hero" | "ring" | "spark" | "stat";

export type Tile = {
  metric: HealthMetric;
  shape: TileShape;
  /** Columns out of four. Full-width tiles take 4, the rest take 2. */
  span: 2 | 4;
  value: number;
  /** The mean of the days before the recent window, or null if too few. */
  baseline: number | null;
  /** Chronological readings for the chart. Empty for a plain stat. */
  points: number[];
  /** Only set when METRIC_TARGET has one — a ring cannot exist without it. */
  target: number | null;
};

/** Below this a line is two dots and a slope, which says nothing. */
const MIN_SPARK_POINTS = 4;
/** The hero tile carries a fortnight's shape; less than a week isn't one. */
const MIN_HERO_POINTS = 7;

/**
 * The home board: which tiles, in what order, drawn how.
 *
 * The shape of every tile falls out of what the member actually has, which is
 * the point — two members open this screen and get different layouts, because
 * they are different people with different devices. A fixed layout would have
 * to either leave holes for whoever lacks a metric, or pad them with zeroes,
 * and both read as the app being broken rather than as data not existing.
 *
 * The rules, in order:
 *
 *   1. Priority order comes from pickSwatches, which already guarantees every
 *      metric here has at least one non-zero reading.
 *   2. The top metric becomes the hero — full width, with its own chart — but
 *      only if it has a week of readings to draw. A hero tile with three
 *      points is a big box containing a short line.
 *   3. A metric with a conventional daily target and a reading for today gets
 *      a ring.
 *   4. A metric with enough history gets a sparkline.
 *   5. Everything else is a number and a trend, which is honest about being
 *      all we have.
 *   6. Half-width tiles are laid two to a row, so an odd one out is widened
 *      rather than left beside a hole.
 */
export function planTiles(days: DaySeries[], limit = 5): Tile[] {
  const metrics = pickSwatches(days, limit);

  const tiles: Tile[] = [];
  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i];
    const stat = summarise(days, metric);
    if (!stat) continue;

    const points = seriesFor(days, metric);
    const target = METRIC_TARGET[metric] ?? null;

    // Rule 2, and only for the first metric: a screen with two heroes has no
    // hero, and the second one is just a wide tile pretending to lead.
    const hero = i === 0 && points.length >= MIN_HERO_POINTS;

    const shape: TileShape = hero
      ? "hero"
      : target !== null
        ? "ring"
        : points.length >= MIN_SPARK_POINTS
          ? "spark"
          : "stat";

    tiles.push({
      metric,
      shape,
      span: hero ? 4 : 2,
      value: stat.value,
      baseline: stat.baseline,
      points,
      target,
    });
  }

  // Rule 6. Count only the half-width tiles: the hero already fills its row,
  // so it must not be counted when deciding whether one is left over.
  const halves = tiles.filter((t) => t.span === 2);
  if (halves.length % 2 === 1) {
    const last = halves[halves.length - 1];
    last.span = 4;
    // A ring stretched across the full width is mostly empty space with a
    // circle marooned on one side. Widening it changes what it should draw.
    if (last.shape === "ring" && last.points.length >= MIN_SPARK_POINTS) {
      last.shape = "spark";
    }
  }

  return tiles;
}

/**
 * How a value compares to the member's own earlier weeks.
 *
 * Against their own baseline, never against a population — the whole premise
 * of the product is that the interesting comparison is with yourself. `good`
 * is null where the metric has no better direction, so the UI can show the
 * movement without colouring it as an achievement or a failure.
 */
export function trendOf(tile: Tile): { pct: number; good: boolean | null } | null {
  if (tile.baseline === null || tile.baseline === 0) return null;
  const pct = ((tile.value - tile.baseline) / tile.baseline) * 100;
  // Under a couple of percent is noise in the sensor, not a change in the
  // person. Showing "+0.4%" invites someone to read meaning into drift.
  if (Math.abs(pct) < 2) return null;

  const better = METRIC_DISPLAY[tile.metric].higherIsBetter;
  return { pct, good: better === null ? null : pct > 0 === better };
}

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
