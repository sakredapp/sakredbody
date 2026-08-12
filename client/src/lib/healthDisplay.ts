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
  /*
   * `summarise: "average" | "latest"` used to live here, deciding whether a
   * metric's headline number was its last reading or the mean of its last
   * seven days. It is gone because the answer is no longer per-metric: every
   * surface that shows a headline number also stamps it with a date, so the
   * number has to be the reading on that date or the label is a lie. See
   * `summarise()` below for the full account. The averaging did not disappear
   * — it became the baseline, which is where a comparison belongs.
   */
  /**
   * Whether the number accumulates across the day, or is simply measured.
   *
   * Steps at noon are half a day of steps. A resting heart rate at noon is a
   * resting heart rate. Only the first kind can be compared against a full
   * day's usual and come out looking like a collapse purely because the day is
   * not over — 3,937 steps against a usual of 18,133 is not a 78% drop, it is
   * lunchtime. Sleep counts as measured: last night is finished by the time it
   * is read, whatever the clock says now.
   */
  cumulative: boolean;
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
    cumulative: true,
    higherIsBetter: true,
  },
  distanceMeters: {
    label: "Distance",
    group: "Movement",
    // Kilometres to a member; metres in the column. Storing SI and displaying
    // human is the whole reason the two are separate concerns.
    format: (v) => `${round(v / 1000, 1)} km`,
    cumulative: true,
    higherIsBetter: true,
  },
  flightsClimbed: {
    label: "Flights",
    group: "Movement",
    format: (v) => round(v),
    cumulative: true,
    higherIsBetter: true,
  },
  exerciseMinutes: {
    label: "Exercise",
    group: "Movement",
    format: hoursMinutes,
    cumulative: true,
    higherIsBetter: true,
  },
  activeCalories: {
    label: "Active burn",
    group: "Movement",
    format: (v) => `${round(v)} kcal`,
    cumulative: true,
    higherIsBetter: true,
  },
  totalCalories: {
    label: "Total burn",
    group: "Movement",
    format: (v) => `${round(v)} kcal`,
    cumulative: true,
    higherIsBetter: null,
  },

  // ── Sleep ──
  sleepMinutes: {
    label: "Sleep",
    group: "Sleep",
    format: hoursMinutes,
    cumulative: false,
    higherIsBetter: true,
  },
  sleepDeepMinutes: {
    label: "Deep",
    group: "Sleep",
    format: hoursMinutes,
    cumulative: false,
    higherIsBetter: true,
  },
  sleepRemMinutes: {
    label: "REM",
    group: "Sleep",
    format: hoursMinutes,
    cumulative: false,
    higherIsBetter: true,
  },
  sleepAwakeMinutes: {
    label: "Awake",
    group: "Sleep",
    format: hoursMinutes,
    // Time awake inside a sleep session is the one sleep number where less is
    // the good outcome.
    cumulative: false,
    higherIsBetter: false,
  },

  // ── Heart ──
  restingHeartRate: {
    label: "Resting HR",
    group: "Heart",
    format: (v) => `${round(v)} bpm`,
    // Rising resting heart rate is the classic overreaching signal.
    cumulative: false,
    higherIsBetter: false,
  },
  heartRateVariability: {
    label: "HRV",
    group: "Heart",
    format: (v) => `${round(v)} ms`,
    cumulative: false,
    higherIsBetter: true,
  },
  vo2Max: {
    label: "VO₂ max",
    group: "Heart",
    // VO2 max is an estimate the device revises rather than a daily
    // measurement, so the current one is the answer and a mean only lags it.
    format: (v) => round(v, 1),
    cumulative: false,
    higherIsBetter: true,
  },

  // ── Body ──
  weightKg: {
    label: "Weight",
    group: "Body",
    format: (v) => `${round(v, 1)} kg`,
    cumulative: false,
    higherIsBetter: null,
  },
  bodyFatPercent: {
    label: "Body fat",
    group: "Body",
    format: (v) => `${round(v, 1)}%`,
    cumulative: false,
    higherIsBetter: null,
  },
  heightCm: {
    label: "Height",
    group: "Body",
    format: (v) => `${round(v)} cm`,
    cumulative: false,
    higherIsBetter: null,
  },

  // ── Vitals ──
  respiratoryRate: {
    label: "Respiratory rate",
    group: "Vitals",
    format: (v) => `${round(v, 1)} /min`,
    cumulative: false,
    higherIsBetter: null,
  },
  oxygenSaturation: {
    label: "Blood oxygen",
    group: "Vitals",
    format: (v) => `${round(v, 1)}%`,
    cumulative: false,
    higherIsBetter: true,
  },
  bodyTemperatureC: {
    label: "Body temp",
    group: "Vitals",
    format: (v) => `${round(v, 1)}°C`,
    cumulative: false,
    higherIsBetter: null,
  },

  // ── Practice ──
  mindfulnessMinutes: {
    label: "Mindfulness",
    group: "Practice",
    format: hoursMinutes,
    cumulative: true,
    higherIsBetter: true,
  },
  waterMl: {
    label: "Water",
    group: "Practice",
    format: (v) => `${round(v / 1000, 1)} L`,
    cumulative: true,
    higherIsBetter: true,
  },
  dietaryCalories: {
    label: "Eaten",
    group: "Practice",
    format: (v) => `${round(v)} kcal`,
    cumulative: true,
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
  metric: HealthMetric
): { value: number; baseline: number | null; days: number; onDate: string } | null {
  const display = METRIC_DISPLAY[metric];
  if (!display) return null;

  const points = days
    .map((d) => ({ onDate: d.onDate, value: d[metric] }))
    .filter((p): p is { onDate: string; value: number } => typeof p.value === "number")
    // The server already sorts (see `pivot`), but this function's whole
    // contract is "the most recent reading", and reading that off the end of
    // an array whose order is somebody else's promise is how it silently
    // becomes the oldest reading instead.
    .sort((a, b) => a.onDate.localeCompare(b.onDate));
  if (!points.length) return null;

  const mean = (xs: { value: number }[]) =>
    xs.reduce((a, b) => a + b.value, 0) / (xs.length || 1);

  /**
   * The reading on the most recent day held — never a window average.
   *
   * ── The bug this fixes ──────────────────────────────────────────────────
   *
   * Eighteen of the twenty-two metrics are declared `summarise: "average"`,
   * and this returned the mean of their last seven days. Every surface that
   * renders it, though, stamps the number with a single date and sits under a
   * header reading "Your body · Today". So the home screen showed 16,440 steps
   * dated today, while the detail sheet for the same metric on the same screen
   * showed 3,937 — the number actually recorded today. Both were "right"; they
   * were answering different questions, and only one of them was the question
   * the label asked.
   *
   * A member cannot act on a weekly mean presented as this morning, and cannot
   * tell it apart from the app being stale. The average is not lost — it is
   * the baseline below, which is where a comparison belongs.
   */
  const latest = points[points.length - 1];
  const value = latest.value;

  /**
   * Every other day held, which is what "your usual" means.
   *
   * Excludes the day being shown, or the number is partly compared with itself
   * and every deviation flattens. Five is the same floor MetricDetail uses,
   * deliberately: the tile and the sheet it opens must not quote different
   * usuals for the same metric.
   */
  const older = points.slice(0, -1);
  const baseline = older.length >= 5 ? mean(older) : null;

  /**
   * The date the value belongs to, returned rather than left to the caller.
   *
   * Every caller needs it — to say "Today so far", to suppress a comparison on
   * a day still being counted, to label the tile at all — and every caller was
   * previously re-deriving it from the same array, which is how the tile and
   * the sheet it opens ended up disagreeing about which day they were showing.
   */
  return { value, baseline, days: points.length, onDate: latest.onDate };
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
 *
 * ── Why sleep is not here ─────────────────────────────────────────────────
 *
 * Everything above is something a member *does*: they walk, they train, they
 * sit, they drink. Effort moves the number, so a ring filling up is a fair
 * account of the day, and going past 100% is a real thing to have done.
 *
 * Sleep is not that. Nobody hits 150% of a sleep goal by trying harder — a
 * night that reads well over target is either an unusual night or, far more
 * often, a measurement artefact. We shipped exactly that: overlapping sources
 * were being summed, and a normal night rendered as a triumphant 237%.
 *
 * A ring on a passive measurement turns every reading into a grade, and grades
 * the one thing a member has least control over. Sleep renders as the number
 * it is, with its trend beside it, and lets them draw the conclusion.
 */
export const METRIC_TARGET: Partial<Record<HealthMetric, number>> = {
  steps: 10_000,
  exerciseMinutes: 30,
  activeCalories: 500,
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
  /**
   * The date `value` actually came from.
   *
   * A number with no date attached is not information. Sync runs when the
   * phone feels like it, so a tile can easily be showing yesterday — and
   * showing yesterday's step count unlabelled, on a screen somebody opens in
   * the morning, is worse than showing nothing: they read it as today and
   * conclude the app is broken when it doesn't move.
   */
  onDate: string | null;
};

/**
 * "Today", "yesterday", or the date itself.
 *
 * Relative wording only where it is genuinely unambiguous. Past two days it
 * gives the actual date, because "5 days ago" is arithmetic somebody has to do
 * to work out whether it matters.
 */
export function dayLabel(onDate: string | null, today: string): string {
  if (!onDate) return "";
  if (onDate === today) return "Today";
  const diff = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${onDate}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 1) return "Yesterday";
  const [y, m, d] = onDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Is this reading still being added to?
 *
 * True only for a metric that accumulates, on the member's own today. Every
 * comparison against a baseline has to ask this first, because the baseline is
 * a full day and a partial day measured against it is not a change in the
 * person — it is the clock. The arrow that results is the most alarming thing
 * on the screen and it means nothing, which is the worst combination available.
 *
 * The reading is still shown. It is the *comparison* that is withheld, because
 * the number is true and the comparison is not.
 */
export function isStillCounting(
  metric: HealthMetric,
  onDate: string | null,
  today = localToday(),
): boolean {
  if (!onDate) return false;
  return METRIC_DISPLAY[metric]?.cumulative === true && onDate === today;
}

/** The member's own date, as the browser sees it. */
export function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

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
      /**
       * The freshest day this metric actually has, not the freshest day the
       * member has any data for. Sleep and steps arrive on different
       * schedules, so one tile can legitimately be a day behind another.
       */
      onDate:
        days
          .filter((d) => typeof d[metric] === "number")
          .map((d) => d.onDate)
          .sort()
          .pop() ?? null,
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
  // A day that is still filling up cannot be down on anything yet.
  if (isStillCounting(tile.metric, tile.onDate)) return null;
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


// ─── What to do about a reading ────────────────────────────────────────────

/**
 * Guidance for a metric, given how it compares with the member's own usual.
 *
 * ── Why a number alone is a dead end ──────────────────────────────────────
 *
 * Tapping Sleep opened a value, a baseline and a chart, and a member's honest
 * reaction was "it didn't take me to anything about my sleep" — because a
 * chart of a thing is not information *about* the thing. They already knew
 * they slept badly. What they wanted was what to do about it.
 *
 * ── Why it is written down rather than generated ──────────────────────────
 *
 * These are the same curated primitives the rest of the product uses. A model
 * asked to write sleep advice will produce something plausible and unbounded,
 * and the failure mode is a health app confidently inventing a protocol. Here
 * the advice is fixed, the only thing that varies is which one applies, and
 * that is decided by arithmetic on the member's own trailing average.
 *
 * Returns null when the reading is unremarkable. Advice attached to a normal
 * night is advice people learn to scroll past.
 */
export type MetricAdvice = {
  title: string;
  body: string;
  tip: string;
  /**
   * The herbal or mineral side of the practice, where there is a real
   * traditional answer to this particular reading.
   *
   * ── Why this belongs on a metric screen ──────────────────────────────────
   *
   * It is the half of Sakred that a numbers screen was silently leaving out.
   * "You slept badly" and a chart is a wearable. "You slept badly, and here is
   * what has been used for exactly this for a very long time" is the practice
   * this product is actually about — and it is the point at which the
   * Apothecary stops being a separate tab nobody opens and starts being the
   * answer to something the member is already looking at.
   *
   * ── The line it must not cross ───────────────────────────────────────────
   *
   * Named preparations and how they are traditionally taken. Never a dose,
   * never a claim to treat anything, never a substitute for care. "Widely used
   * for" is honest; "will fix your sleep" is not, and one of those is a
   * medical claim that a health app cannot make.
   */
  remedy?: { title: string; body: string };
};

/**
 * How much to sleep tonight, as an actual number of hours.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The sleep screen could tell you that you were down on your average and
 * nothing else. That is a diagnosis with no instruction attached — a member
 * reads it, agrees, and does nothing differently, because "sleep more" is not
 * a plan and they already knew.
 *
 * What is actually useful is a figure to aim at tonight. And the figure is
 * often much larger than people expect: somebody eight hours down across a
 * week needs a genuinely long night to clear it, and will not take one,
 * because ten hours in bed feels like sloth. Naming the number, and where it
 * came from, is what gives them permission to spend it.
 *
 * ── Their own usual, never a norm ─────────────────────────────────────────
 *
 * The target is built from this member's own baseline and their own shortfall.
 * There is no eight-hours-is-healthy anywhere in it, because the rest of this
 * file refuses population norms on purpose — an ideal night for one person is
 * a bad one for another, and a target we invented is a target they will fail
 * against for no reason.
 *
 * ── The two caps, and why ─────────────────────────────────────────────────
 *
 * At most three hours of repayment in one night: debt built over a week does
 * not clear in one, and a target nobody could hit is one they stop reading.
 * And never above ten and a half hours in total, which keeps the number
 * believable and inside HEALTH_RANGES either way.
 *
 * Returns null when there is nothing to repay. A screen that asks for a
 * catch-up every single night is one that gets ignored on the night it matters.
 */
export function sleepTonight(
  points: { onDate: string; value: number }[],
  baseline: number | null,
  overNights = 7,
): { target: number; debt: number; nights: number } | null {
  if (baseline === null || baseline <= 0) return null;

  const recent = points.slice(-overNights);
  if (!recent.length) return null;

  // Only shortfalls count. A long night does not cancel a short one — you do
  // not un-spend a bad night by having a good one afterwards, and netting them
  // off would hide exactly the week this is meant to catch.
  const debt = recent.reduce((sum, p) => sum + Math.max(0, baseline - p.value), 0);

  // Half an hour across a week is noise, not a debt worth a plan.
  if (debt < 30) return null;

  const MAX_REPAYMENT = 180;
  const MAX_TARGET = 630;
  const target = Math.min(baseline + Math.min(debt, MAX_REPAYMENT), MAX_TARGET);

  return { target, debt, nights: recent.length };
}

export function adviceFor(
  metric: HealthMetric,
  value: number,
  baseline: number | null,
): MetricAdvice | null {
  if (baseline == null || baseline <= 0) return null;
  const delta = value - baseline;

  if (metric === "sleepMinutes") {
    if (delta <= -45) {
      return {
        title: "A short night, against your own usual",
        body: "One is a bad night rather than a problem. What it costs you is patience and appetite control tomorrow, more than it costs you in training.",
        tip: "The single most effective thing is a consistent wake time — going to bed earlier tonight tends not to work, but getting up at the same hour keeps tomorrow night from drifting too.",
        remedy: {
          title: "Worth trying tonight",
          body: "Chamomile, tulsi or passionflower as a strong evening tea — all long used to settle the nervous system before sleep rather than to sedate. Magnesium glycinate is the form most people tolerate at night; the cheaper oxide mostly reaches the gut instead.",
        },
      };
    }
    if (delta >= 45) {
      return {
        title: "More than you usually get",
        body: "Often catch-up after a short stretch, and worth noticing what preceded it.",
        tip: "If you needed it, the debt was real. If this becomes the norm, it is worth asking what changed.",
      };
    }
    return null;
  }

  if (metric === "restingHeartRate") {
    if (delta >= 3) {
      return {
        title: "Above your own normal",
        body: "Usually a body still working on something — a hard session, a late meal, alcohol, or something coming on.",
        tip: "It is a reason to keep today easy rather than a reason to worry. If it stays up for several days without an obvious cause, that is worth mentioning to someone.",
        remedy: {
          title: "The traditional read",
          body: "Warm, simple food and salt with water rather than anything stimulating. Ginger or tulsi tea is the usual answer to a system running hot; coffee on a morning like this tends to buy an hour and cost the evening.",
        },
      };
    }
    return null;
  }

  if (metric === "heartRateVariability") {
    if (value / baseline <= 0.9) {
      return {
        title: "Down on your baseline",
        body: "You're leaning toward stress rather than recovery. Sleep, alcohol, training load and a hard week all move this one.",
        tip: "Don't compare the number with anybody else's; only your own trend means anything. One low reading is noise, a week of them isn't.",
        remedy: {
          title: "Where the adaptogens belong",
          body: "Ashwagandha and tulsi are the two traditionally used for a stretch like this — taken daily over weeks rather than as a rescue, which is the part most people get wrong. Slow nasal breathing with a longer exhale does more in ten minutes than either.",
        },
      };
    }
    return null;
  }

  if (metric === "steps") {
    if (delta <= -2000) {
      return {
        title: "Short on steps",
        body: "You're well down on your usual. Walking makes it up without needing a session, so this one is easy to fix today.",
        tip: "Walk after your largest meal. The same walk does more for blood sugar then than at any other time of day.",
      };
    }
    return null;
  }

  return null;
}
