/**
 * What to do today, and why.
 *
 * ── The problem this replaces ─────────────────────────────────────────────
 *
 * Today used to open with the moon, the season and an ascendant. It was true
 * to the brand and useless to the member: nothing on the screen answered "what
 * should I actually do in the next hour", which is the only question somebody
 * opens a health app holding.
 *
 * The opposite failure is just as easy and much more common — a screen that
 * recites measurements back. "HRV 48ms, readiness 62, sleep score 71" is not
 * advice, it is a dashboard wearing advice's clothing, and the member is still
 * the one doing the interpretation.
 *
 * So this module does the interpreting and returns something you can act on:
 * three concrete options, each with the actual reason in plain words.
 *
 * ── Three, not one ────────────────────────────────────────────────────────
 *
 * One recommendation is a command, and a command that misreads the day is
 * worse than silence — a member who genuinely feels fine and is told to rest
 * stops trusting the feature, permanently. Three options that share a *read*
 * of the day but differ in what they ask keep the judgement with the person
 * who has the rest of the context: whether they slept badly because of a
 * newborn or because of a race tomorrow.
 *
 * They are deliberately spread rather than ranked. Even on a wrecked day one
 * option still asks something, because "you are too broken to do anything" is
 * rarely true and never motivating. Even on a great day one option restores,
 * because the people most likely to overreach are the ones having a good week.
 *
 * ── Nudging out of the groove ─────────────────────────────────────────────
 *
 * Everybody has two or three things they always reach for. The engine knows
 * what they did recently and pushes the unfamiliar option up, which is where
 * most of the value is: the lifter who has never held a stretch, the yogi who
 * has never picked up anything heavy.
 *
 * That is a nudge and not a rule. Novelty breaks ties; it never overrides the
 * read of the day, because surprising somebody into a hard session on three
 * hours of sleep is how a fun feature becomes an injury.
 *
 * ── Saying "we don't know" without going blank ────────────────────────────
 *
 * A member with no wearable, on day one, has no signals at all. The honest
 * answer is that we cannot read their day — but a blank screen is what we are
 * fixing, so the engine still returns three options and simply stops claiming
 * a reason it does not have. `confidence` carries that, and the copy changes
 * from "you slept badly, so" to "worth doing". Never invent the because.
 */

import {
  EXERCISE_CATEGORIES,
  categoryLoad,
  categoryOrientation,
  type Orientation,
} from "./training.js";

// ─── 1. Reading the day ────────────────────────────────────────────────────

export type Readiness = "depleted" | "steady" | "primed";

/**
 * Everything the read is allowed to use.
 *
 * All optional, all nullable, because the common case is a member with some
 * of these and not others. A baseline alongside each measurement rather than a
 * population norm: 52 resting beats is excellent for one person and a warning
 * sign for another, and only their own trend distinguishes those.
 */
export type ReadinessSignals = {
  sleepMinutes?: number | null;
  sleepBaselineMinutes?: number | null;
  restingHeartRate?: number | null;
  restingHeartRateBaseline?: number | null;
  hrv?: number | null;
  hrvBaseline?: number | null;
  /** Sessions in the last three days the engine considered demanding. */
  hardSessionsRecently?: number;
  daysSinceLastSession?: number | null;
  /** −3 (wrung out) to +3 (ready), straight from the terrain check-in. */
  terrainLean?: number | null;
  /**
   * What the cycle phase contributes, from `cycleLean` in rhythm.ts.
   *
   * Clamped to ±1 below, and that bound is the feature rather than a detail.
   * Sleep and resting heart rate are each worth ±2, so a phase can colour a
   * day and can never decide one — somebody in late luteal who slept nine
   * hours and feels strong still reads as primed. An app that overrides a
   * woman's own signals because a calendar says day 23 has replaced her
   * judgement with an average.
   */
  cycleLean?: number | null;
};

export type ReadinessRead = {
  level: Readiness;
  score: number;
  /** Plain sentences, already translated. Never a metric name and a number. */
  reasons: string[];
  /**
   * How much we actually know. `none` means say nothing about why — see the
   * note above on not inventing the because.
   */
  confidence: "none" | "low" | "good";
};

/**
 * The band a night can actually fall in.
 *
 * Deliberately wide. The job is to catch a measurement fault, not to tell
 * somebody their nine-hour Sunday was wrong — a person who genuinely slept
 * twelve hours should still be read as having slept a lot.
 */
const MIN_PLAUSIBLE_SLEEP = 60;
const MAX_PLAUSIBLE_SLEEP = 13 * 60;

/** Whole hours and minutes, for copy: 445 → "7h 25m". */
function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * Read the day.
 *
 * Signals contribute to one score rather than gating each other, so a single
 * bad number never decides the day on its own. Somebody who slept badly but
 * whose heart rate and check-in are both fine lands at "steady", which is
 * usually the truth — one short night is not a state of depletion.
 */
export function readReadiness(signals: ReadinessSignals): ReadinessRead {
  let score = 0;
  let known = 0;
  const reasons: string[] = [];

  const {
    sleepMinutes,
    sleepBaselineMinutes,
    restingHeartRate,
    restingHeartRateBaseline,
    hrv,
    hrvBaseline,
    hardSessionsRecently = 0,
    daysSinceLastSession,
    terrainLean,
    cycleLean,
  } = signals;

  /**
   * Sleep, against the member's own usual night — when the number is a night.
   *
   * A reading of seventeen hours is not somebody who slept well, it is a
   * measurement problem: several apps writing the same night into Health and
   * the total being summed rather than unioned. That bug is fixed at the
   * source, and this is the guard that stops the *next* one being read aloud
   * as a compliment. The app said "You slept well — 17h 4m" to a real person,
   * which is worse than saying nothing, because it is confidently wrong about
   * something they can check.
   *
   * Outside the plausible band the signal is dropped whole: no score, no
   * reason, and not counted toward confidence. We do not know how they slept.
   */
  const sleepIsPlausible =
    sleepMinutes != null && sleepMinutes >= MIN_PLAUSIBLE_SLEEP && sleepMinutes <= MAX_PLAUSIBLE_SLEEP;

  if (sleepIsPlausible && sleepMinutes != null && sleepBaselineMinutes != null && sleepBaselineMinutes > 0) {
    known++;
    const deficit = sleepBaselineMinutes - sleepMinutes;
    if (deficit >= 90) {
      score -= 2;
      reasons.push(`You slept ${hm(sleepMinutes)} against your usual ${hm(sleepBaselineMinutes)}.`);
    } else if (deficit >= 45) {
      score -= 1;
      reasons.push(`A short night — ${hm(sleepMinutes)}, about ${hm(deficit)} down on your usual.`);
    } else if (deficit <= -30) {
      score += 1;
      reasons.push(`You slept well — ${hm(sleepMinutes)}.`);
    }
  }

  // Resting heart rate. Elevated is the classic sign of a body still working
  // on something: a hard session, a late meal, a cold coming on.
  if (
    restingHeartRate != null &&
    restingHeartRateBaseline != null &&
    restingHeartRateBaseline > 0
  ) {
    known++;
    const over = restingHeartRate - restingHeartRateBaseline;
    if (over >= 6) {
      score -= 2;
      reasons.push(
        `Your resting heart rate is ${Math.round(over)} beats above your normal, which usually means you're still recovering from something.`,
      );
    } else if (over >= 3) {
      score -= 1;
      reasons.push(`Your resting heart rate is a little above its usual.`);
    } else if (over <= -2) {
      score += 1;
    }
  }

  // HRV, as a proportion of baseline rather than an absolute — the absolute
  // number is meaningless between two people and the app should never imply
  // otherwise.
  if (hrv != null && hrvBaseline != null && hrvBaseline > 0) {
    known++;
    const ratio = hrv / hrvBaseline;
    if (ratio <= 0.8) {
      score -= 2;
      reasons.push(`Your heart-rate variability is well down on your baseline.`);
    } else if (ratio <= 0.9) {
      score -= 1;
    } else if (ratio >= 1.1) {
      score += 1;
    }
  }

  // Recent load. This one needs no wearable, which matters: for most members
  // it is the only signal available.
  if (hardSessionsRecently >= 3) {
    known++;
    score -= 2;
    reasons.push(`You've trained hard three times in the last few days.`);
  } else if (hardSessionsRecently === 2) {
    known++;
    score -= 1;
  } else if (daysSinceLastSession != null && daysSinceLastSession >= 3) {
    known++;
    score += 1;
    reasons.push(`It's been ${daysSinceLastSession} days since you last moved.`);
  }

  // What they said about themselves. Weighted to matter, because a member who
  // reports feeling wrecked is reporting something no sensor has.
  if (terrainLean != null) {
    known++;
    if (terrainLean <= -2) {
      score -= 2;
      reasons.push(`You checked in feeling low.`);
    } else if (terrainLean === -1) {
      score -= 1;
    } else if (terrainLean >= 2) {
      score += 2;
      reasons.push(`You checked in feeling good.`);
    } else if (terrainLean === 1) {
      score += 1;
    }
  }

  // Cycle last, clamped, and never on its own. It contributes no reason
  // string: a phase is context for a day, not an explanation of one, and
  // "you're luteal" is precisely the sentence this product should not write.
  // The reason a member reads comes from something actually measured.
  if (cycleLean != null && cycleLean !== 0) {
    score += Math.max(-1, Math.min(1, cycleLean));
    // Deliberately not counted toward `known`. A phase estimate alone is not
    // grounds to claim we can read somebody's day.
  }

  const level: Readiness = score <= -2 ? "depleted" : score >= 2 ? "primed" : "steady";
  const confidence = known === 0 ? "none" : known === 1 ? "low" : "good";

  return { level, score, reasons, confidence };
}

// ─── 2. Turning the read into things to do ─────────────────────────────────

export type Suggestion = {
  category: string;
  /** Human name for the category — what the card actually says. */
  label: string;
  orientation: Orientation;
  /** What this option is for, in one line. */
  headline: string;
  /** Why it is being offered *today*. Empty when we have no basis to say. */
  because: string;
  /** The stretch option — something they don't usually reach for. */
  isStretch: boolean;
  side: "restore" | "build";
};

export type SuggestionInput = {
  read: ReadinessRead;
  /** Categories the member has done recently, most recent first. */
  recentCategories?: readonly string[];
  /** Categories to never suggest — injuries, dislikes, no equipment. */
  excluded?: readonly string[];
};

/**
 * How demanding each slot should be, given the read.
 *
 * Every row has a restorative option and an option that asks for something.
 * That is the point of the spread — see the note at the top on why one
 * recommendation is a command.
 */
const SLOTS: Readonly<Record<Readiness, readonly { want: Orientation; headline: string }[]>> = {
  depleted: [
    { want: "yin", headline: "Give the day back to yourself" },
    { want: "yin", headline: "Move gently, nothing to prove" },
    { want: "neutral", headline: "Something small, if you want it" },
  ],
  steady: [
    { want: "yang", headline: "A solid session" },
    { want: "yin", headline: "Unwind instead" },
    { want: "both", headline: "Try something different" },
  ],
  primed: [
    { want: "yang", headline: "Push it today" },
    { want: "yang", headline: "Or take it somewhere new" },
    { want: "yin", headline: "Bank the recovery" },
  ],
};

function sideOf(orientation: Orientation): "restore" | "build" {
  return orientation === "yang" ? "build" : "restore";
}

/**
 * Three things worth doing, spread across what the day can carry.
 *
 * Candidates are ranked by fit with the slot first and novelty second, so an
 * unfamiliar option wins a tie but never beats a better-fitting one. A member
 * on three hours of sleep gets surprised with a stretch class, not a max
 * effort.
 */
export function suggestToday(input: SuggestionInput): Suggestion[] {
  const { read, recentCategories = [], excluded = [] } = input;
  const excludedSet = new Set(excluded);

  // Most recent first, so index doubles as "how long ago". Anything unseen
  // scores as maximally novel.
  const recency = new Map<string, number>();
  recentCategories.forEach((c, i) => {
    if (!recency.has(c)) recency.set(c, i);
  });
  const noveltyOf = (category: string) => {
    const seen = recency.get(category);
    if (seen === undefined) return 1;
    return Math.min(1, seen / 10);
  };

  const pool = EXERCISE_CATEGORIES.filter((c) => !excludedSet.has(c.id));
  const chosen: Suggestion[] = [];
  const taken = new Set<string>();

  for (const slot of SLOTS[read.level]) {
    let best: { category: string; label: string; score: number } | null = null;

    for (const entry of pool) {
      const category = entry.id;
      if (taken.has(category)) continue;
      const orientation = categoryOrientation(category);
      const load = categoryLoad(category);

      // Fit with what this slot is asking for.
      let fit: number;
      if (slot.want === orientation) fit = 1;
      else if (slot.want === "both" && orientation !== "neutral") fit = 0.7;
      else if (slot.want === "neutral" && orientation === "yin") fit = 0.6;
      else if (slot.want === "yang" && orientation === "both") fit = 0.6;
      else if (slot.want === "yin" && orientation === "both") fit = 0.6;
      else fit = 0.1;

      // On a depleted day, actively penalise anything demanding — the novelty
      // nudge must not be able to reach past the read of the day.
      if (read.level === "depleted" && load.stress >= 3) fit *= 0.2;

      const score = fit * 2 + noveltyOf(category);
      if (!best || score > best.score) best = { category, label: entry.label, score };
    }

    if (!best) continue;
    taken.add(best.category);
    const orientation = categoryOrientation(best.category);
    chosen.push({
      category: best.category,
      label: best.label,
      orientation,
      headline: slot.headline,
      // No signals means no claim. The headline still stands on its own.
      because: read.confidence === "none" ? "" : (read.reasons[0] ?? ""),
      /**
       * Only meaningful against a history to be new *to*.
       *
       * With no logged sessions every category is unseen, so every card was
       * badged "something new" — three identical labels that told a member
       * nothing and made the row look like a system talking to itself.
       */
      isStretch: recentCategories.length > 0 && !recency.has(best.category),
      side: sideOf(orientation),
    });
  }

  return chosen;
}

// ─── 3. The moon, said so anyone can use it ────────────────────────────────

/**
 * What the phase means in practice, for somebody who has never thought about
 * it once.
 *
 * The moon was on Today from the start and it was landing as decoration —
 * "waning gibbous", an illumination percentage, a glyph. Half the audience
 * already knows what to do with that and the other half reads it as horoscope
 * filler and stops trusting the screen it is printed on.
 *
 * The content was never the problem. Traditional practice attaches something
 * concrete and testable to each phase — when to fast, when to expect a hard
 * night, when to stop starting things and finish them — and *that* is worth a
 * card. The phase name alone is not.
 *
 * So the rule this encodes: never show the phase without the practice, and
 * lead with the practice. `title` is what a member reads first, `phaseLabel`
 * is the plain name for anyone who wants it, and nothing here needs a glossary.
 */
export type MoonGuidance = {
  phaseLabel: string;
  /** The instruction, in ordinary words. */
  title: string;
  /** One sentence on why, no jargon and no mysticism. */
  detail: string;
};

const MOON_GUIDANCE: Readonly<Record<string, { title: string; detail: string }>> = {
  new: {
    title: "A good day to eat light, or not at all",
    detail:
      "The dark of the moon is the traditional point to fast and to start things rather than finish them. If you've been meaning to try a lighter day, this is the one.",
  },
  "waxing crescent": {
    title: "Start small and keep it easy",
    detail: "Begin the thing you've been putting off, at a size you can't fail at.",
  },
  "first quarter": {
    title: "Commit to it properly",
    detail: "Whatever you started a few days ago, this is the point to add real weight to it.",
  },
  "waxing gibbous": {
    title: "Build toward your hardest effort",
    detail: "Energy tends to run high through here. Use it before it peaks.",
  },
  full: {
    title: "Go hard, and expect a bad night",
    detail:
      "Most people sleep worse on a full moon and feel strongest during the day. Take the session; protect the sleep.",
  },
  "waning gibbous": {
    title: "Finish things rather than start them",
    detail: "Ease off the intensity and close out what's already open.",
  },
  "last quarter": {
    title: "Cut back and clear out",
    detail: "A natural point to drop what isn't working — in training and everywhere else.",
  },
  "waning crescent": {
    title: "Rest, and eat lighter again",
    detail:
      "The wind-down before the next new moon. Low-intensity movement and simple food do more for you this week than pushing.",
  },
};

/** Title-cased for display: "waning gibbous" → "Waning gibbous". */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The practice for a phase, or null when we have nothing useful to say.
 *
 * Null is a real answer and callers must render nothing for it. A card that
 * appears every single day trains people to stop reading it.
 */
export function moonGuidance(phase: string): MoonGuidance | null {
  const entry = MOON_GUIDANCE[phase];
  if (!entry) return null;
  return {
    phaseLabel: phase === "new" || phase === "full" ? `${titleCase(phase)} moon` : titleCase(phase),
    ...entry,
  };
}

// ─── 4. The season, said the same way ──────────────────────────────────────

/**
 * The five-element season, translated on exactly the same terms as the moon.
 *
 * Same failure and same fix: "Late summer · Earth · spleen and stomach" is
 * three pieces of vocabulary and no instruction. What the tradition actually
 * attaches to each season is a way of eating and a pace of training, and that
 * part survives translation into ordinary words without losing anything.
 *
 * Keyed on the element rather than the calendar month so it stays in step with
 * `elementalSeason()`, which is the only thing that decides which season a
 * date is in.
 */
export type SeasonGuidance = {
  /** The plain name, for anyone who wants it: "Late summer". */
  seasonLabel: string;
  title: string;
  detail: string;
};

const SEASON_GUIDANCE: Readonly<Record<string, SeasonGuidance>> = {
  wood: {
    seasonLabel: "Spring",
    title: "Move more than you did last month",
    detail:
      "The turn of the year is the point to add volume and get outside. Lighter, greener food and longer sessions both land well now.",
  },
  fire: {
    seasonLabel: "Summer",
    title: "Take your hardest efforts now",
    detail:
      "The most capable stretch of the year for most people. Train hard, eat cooler and lighter, and don't fight the early mornings.",
  },
  earth: {
    seasonLabel: "Late summer",
    title: "Eat simply and keep digestion easy",
    detail:
      "The short season between summer and autumn. Cooked, plain food and steady rather than maximal training is the traditional read, and it holds up.",
  },
  metal: {
    seasonLabel: "Autumn",
    title: "Cut back to what's working",
    detail:
      "Drop what you've been carrying — in training and elsewhere — and protect sleep as the light goes. Warm food over raw.",
  },
  water: {
    seasonLabel: "Winter",
    title: "Build slowly and sleep more",
    detail:
      "The lowest-output season on purpose. Strength keeps well through here; long, depleting efforts don't. More sleep, warmer food.",
  },
};

/** Guidance for an elemental season, or null when it isn't one we know. */
export function seasonGuidance(element: string): SeasonGuidance | null {
  return SEASON_GUIDANCE[element] ?? null;
}

/**
 * The moon and the season in one line, practice first.
 *
 * The ordering rule the whole product runs on: what to do, then what it is.
 * "Eat lighter today · New moon · Late summer" is readable by somebody who has
 * never thought about either, and still says the thing for somebody who has.
 *
 * Returns null when there is nothing to say, and callers must render nothing
 * for it — a card that appears every day is a card people stop reading.
 */
export function skyLine(
  moon: MoonGuidance | null,
  season: SeasonGuidance | null,
): string | null {
  const names = [moon?.phaseLabel, season?.seasonLabel].filter(Boolean);
  if (!names.length) return null;
  return names.join(" · ");
}

/**
 * The one-line read shown above the options.
 *
 * Deliberately not a score. "Readiness 62" tells a member nothing they can act
 * on and invites them to optimise a number we made up.
 */
export function readLine(read: ReadinessRead): string {
  if (read.confidence === "none") {
    return "We don't know much about your day yet — here's somewhere to start.";
  }
  switch (read.level) {
    case "depleted":
      return "Today looks like a day to take something back.";
    case "primed":
      return "You've got room to push today.";
    default:
      return "Steady day. Any of these would be a good use of it.";
  }
}
