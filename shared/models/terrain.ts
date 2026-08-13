/**
 * Terrain — what condition the body is in, and what it can receive next.
 *
 * ── The one decision this file exists to hold ─────────────────────────────
 *
 * The brief asked for a gauge: "YIN 62 / 38 YANG". This deliberately does not
 * produce one, and the reason is written into the app already — PillarHome's
 * own header says it out loud:
 *
 *     "No composite here — no readiness, no capacity, no points. A number
 *      invented out of other numbers is a character sheet, and this is a
 *      practice."
 *
 * A 62 is arithmetic on things measured in different units, by different
 * devices, with different reliability, and it hides all of that behind two
 * digits that look like a measurement. Worse, it invites the member to
 * optimise the number, and the number is not the thing.
 *
 * So this returns a *lean* and the reasons for it. Same information, and every
 * part of it is checkable: "leaning restore — three high-output days, sleep
 * down 40 minutes" can be argued with. "38 Yang" cannot.
 *
 * ── Balance is not a third state ──────────────────────────────────────────
 *
 * The brief is explicit and it is right: balance is the intelligent movement
 * between the two, not a midpoint to sit at. So `lean` is never "balanced".
 * When nothing argues either way it is "either" — the terrain can take what
 * the day asks of it, which is a different and much more useful statement than
 * "you are 50/50".
 *
 * ── Pure ──────────────────────────────────────────────────────────────────
 *
 * No database, no clock, no network. The server assembles the inputs; this
 * decides what they mean, so the deciding can be tested directly.
 */

import { categoryLoad, type MovementLoad } from "./training.js";
import {
  TERRAIN_SIGNALS,
  signalPulls,
  terrainLeanFrom,
  type ReportedSignals,
} from "./terrainSignals.js";

// ─── The direction a thing runs ────────────────────────────────────────────

/**
 * Yin or Yang, and nothing else.
 *
 * One vocabulary for every table that carries a direction — habits, retreats
 * and cohorts — so the three cannot drift into three slightly different
 * spellings of the same idea.
 *
 * There is no `balanced` member on purpose. That is what `null` is, and two
 * ways to say the same thing is how a filter starts missing rows. Null also
 * means the honest thing for every row that predates the idea: nobody has
 * said.
 */
export const EMPHASES = ["yin", "yang"] as const;
export type Emphasis = (typeof EMPHASES)[number];

/**
 * What each direction is called, and what it means, in one place.
 *
 * Two labels because the app and the site are talking to people at different
 * moments. The site is teaching a philosophy and says Yin and Yang. The app is
 * a screen somebody uses before breakfast, and says Restore and Build — which
 * are the same two things, named for what you would do rather than what the
 * tradition calls it.
 */
export const EMPHASIS_META: Readonly<
  Record<Emphasis, { label: string; appLabel: string; blurb: string }>
> = {
  yin: { label: "Yin", appLabel: "Restore", blurb: "Clears and rebuilds" },
  yang: { label: "Yang", appLabel: "Build", blurb: "Loads and challenges" },
};

export function isEmphasis(v: unknown): v is Emphasis {
  return v === "yin" || v === "yang";
}

/**
 * Which direction today's inputs argue for.
 *
 *   restore  the terrain has been drawn down, or is asking to be
 *   build    it is carrying capacity it has not been asked to use
 *   either   nothing argues strongly; the day's own intention decides
 *   unknown  not enough to say — said plainly rather than defaulted to "either"
 */
export type TerrainLean = "restore" | "build" | "either" | "unknown";

/**
 * One thing that is true, which way it pulls, and where it came from.
 *
 * ── Where a reason came from ──────────────────────────────────────────────
 *
 * Required, not optional, so a reason cannot be added without saying. The whole
 * point of composing two kinds of evidence is that the member and the coach can
 * still tell them apart: "your resting heart rate is up" and "you said you feel
 * wrecked" are both true and are not the same claim, and a screen that blends
 * them into one voice has invented a biometric out of a slider.
 */
export type ReasonSource = "measured" | "reported";

export type TerrainReason = {
  source: ReasonSource;
  /** Shown to the member, in their own terms. Never a metric name. */
  text: string;
  pulls: "restore" | "build";
};

export type TerrainInputs = {
  /** Sleep, last 7 days and the 28-day baseline, in minutes. Null if unsynced. */
  sleepRecent: number | null;
  sleepBaseline: number | null;
  /** Heart rate variability, same windows, in ms. */
  hrvRecent: number | null;
  hrvBaseline: number | null;
  /** Resting heart rate, same windows, in bpm. */
  rhrRecent: number | null;
  rhrBaseline: number | null;
  /** Categories trained in the last 7 days, one entry per session-category. */
  trainedCategories: string[];
  /** Whole days since the last finished session. Null if nothing was ever logged. */
  daysSinceLastSession: number | null;
  /**
   * The windows the two averages above were actually taken over.
   *
   * Passed in rather than assumed, because the reasons name them out loud now
   * and a sentence that states the wrong window is worse than one that states
   * none. The server owns these numbers (`RECENT_DAYS` / `BASELINE_DAYS` in
   * server/terrain/routes.ts); this only reports them.
   */
  recentDays?: number;
  baselineDays?: number;
};

export type TerrainReading = {
  lean: TerrainLean;
  reasons: TerrainReason[];
  /** What the week has actually asked for and given back. */
  week: { stress: number; restoration: number; sessions: number };
  /** True when the phone has synced something useful — the UI says so rather than guessing. */
  hasBody: boolean;
  /**
   * True when the person has said how they are today, in enough detail to mean
   * something. Separate from `hasBody` because a member with no wearable who
   * checks in is not an empty reading — they are the reading.
   */
  hasReport: boolean;
};

/**
 * How far from baseline is worth remarking on.
 *
 * Below this everything is noise, and a reading that reacts to noise trains a
 * member to ignore it. These match the thresholds healthSignals already uses,
 * because two parts of the app disagreeing about what counts as a change is
 * how a member ends up told they are recovered on one screen and depleted on
 * the next.
 */
const SLEEP_DOWN_MIN = 25;
const HRV_DOWN_RATIO = 0.9;
const RHR_UP_BPM = 3;

/** A week that has genuinely asked something of somebody. */
const HEAVY_WEEK_STRESS = 9;
/** A week that has not. */
const LIGHT_WEEK_STRESS = 3;

export function weekLoad(categories: string[]): MovementLoad & { sessions: number } {
  let stress = 0;
  let restoration = 0;
  for (const c of categories) {
    const l = categoryLoad(c);
    stress += l.stress;
    restoration += l.restoration;
  }
  return { stress, restoration, sessions: categories.length } as MovementLoad & {
    sessions: number;
  };
}

/** 192 → "3h 12m". Nobody reads a three-figure minute count as a duration. */
function hm(minutes: number): string {
  const t = Math.round(minutes);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function readTerrain(input: TerrainInputs): TerrainReading {
  const reasons: TerrainReason[] = [];
  const week = weekLoad(input.trainedCategories);

  /**
   * Both windows, named in every sentence that compares them.
   *
   * "Sleeping 192 minutes less than usual" was the whole complaint: it does
   * not say what is being averaged, over what, against what — so it cannot be
   * checked, argued with, or acted on. Worse, "usual" turned out to be a
   * 28-day average poisoned by six double-counted nights, and nothing on the
   * card gave the member any way to notice that.
   *
   * Naming the windows is what makes the number falsifiable. A member who
   * reads "your last 7 nights against your 28-day average" and knows he slept
   * fine all week has somewhere to point.
   */
  const recentDays = input.recentDays ?? 7;
  const baselineDays = input.baselineDays ?? 28;
  const against = `your ${baselineDays}-day average`;

  const hasBody =
    input.sleepRecent !== null || input.hrvRecent !== null || input.rhrRecent !== null;

  // ── What the body is saying ──
  if (
    input.sleepRecent !== null &&
    input.sleepBaseline !== null &&
    input.sleepBaseline - input.sleepRecent >= SLEEP_DOWN_MIN
  ) {
    const down = input.sleepBaseline - input.sleepRecent;
    reasons.push({
      source: "measured",
      text: `Last ${recentDays} nights: ${hm(down)} less sleep than ${against}`,
      pulls: "restore",
    });
  }

  if (
    input.hrvRecent !== null &&
    input.hrvBaseline !== null &&
    input.hrvBaseline > 0 &&
    input.hrvRecent / input.hrvBaseline <= HRV_DOWN_RATIO
  ) {
    reasons.push({
      source: "measured",
      text: `Last ${recentDays} days: heart rate variability below ${against}`,
      pulls: "restore",
    });
  }

  if (
    input.rhrRecent !== null &&
    input.rhrBaseline !== null &&
    input.rhrRecent - input.rhrBaseline >= RHR_UP_BPM
  ) {
    reasons.push({
      source: "measured",
      text: `Last ${recentDays} days: resting heart rate up on ${against}`,
      pulls: "restore",
    });
  }

  // ── What the week has asked for ──
  if (week.stress >= HEAVY_WEEK_STRESS) {
    reasons.push({
      source: "measured",
      text: `${week.sessions} demanding session${week.sessions === 1 ? "" : "s"} this week`,
      pulls: "restore",
    });
  } else if (week.stress <= LIGHT_WEEK_STRESS && input.daysSinceLastSession !== null) {
    // Only when they have a history. Telling somebody who has never logged
    // anything that they are under-trained is a judgement about a stranger.
    if (input.daysSinceLastSession >= 3) {
      reasons.push({
        source: "measured",
        text: `Nothing demanding in ${input.daysSinceLastSession} days`,
        pulls: "build",
      });
    } else if (week.sessions > 0) {
      reasons.push({ source: "measured", text: "A light week so far", pulls: "build" });
    }
  }

  // Restoration that was actually done counts for something. It is the half of
  // the ledger every training app forgets, and the reason a heavy week after a
  // restorative one is not the same as a heavy week after another heavy one.
  if (week.restoration >= 6 && week.stress >= HEAVY_WEEK_STRESS) {
    reasons.push({ source: "measured", text: "You have been restoring alongside it", pulls: "build" });
  }

  if (!hasBody && input.daysSinceLastSession === null) {
    return { lean: "unknown", reasons: [], week, hasBody, hasReport: false };
  }

  const toRestore = reasons.filter((r) => r.pulls === "restore").length;
  const toBuild = reasons.filter((r) => r.pulls === "build").length;

  const lean: TerrainLean =
    toRestore > toBuild ? "restore" : toBuild > toRestore ? "build" : "either";

  return { lean, reasons, week, hasBody, hasReport: false };
}

// ─── Terrain Now: the measurement and the person, together ─────────────────

/**
 * The canonical reading — what devices measured, plus what the person said.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * `readTerrain` above reads instruments. For a long time that *was* Terrain
 * Now, which produced a product that asked "how are you actually doing?", stored
 * the answer, showed it to a coach, fed it to the recommendations — and then
 * printed "You're well recovered" on the biggest card on the screen, because
 * the watch looked fine. A member telling us they feel wrecked is first-party
 * evidence about a body; a sensor is a proxy for one. Neither outranks the
 * other absolutely, and the one that is easier to quantify does not get to win
 * by default.
 *
 * ── Why it is a layer and not seven more lines inside readTerrain ─────────
 *
 * Not for architectural tidiness — so the two kinds of evidence stay
 * distinguishable all the way to the screen. Every reason carries its source,
 * and the composition never rewrites one as the other. "Your resting heart rate
 * is up" must never appear because somebody moved a slider.
 *
 * There is still one Terrain Now. This is the only composition, `terrainFor` is
 * the only caller, and every consumer — the member's Today, the coach's client
 * view, the plan review, the plan/terrain tension — reads its result. No
 * `coachTerrain`, no `todayTerrain`.
 *
 * ── Bounded, in both directions ───────────────────────────────────────────
 *
 * The report is worth at most `REPORT_MAX_WEIGHT` against the measured reasons.
 * That number is the whole design:
 *
 *   · It always beats a single measured reason. Sleep looks fine and they say
 *     they are wrecked — the card cannot answer "you have room for more
 *     movement". They told us something the sensor has no access to.
 *
 *   · It never beats an accumulated one. Three nights short, HRV down, resting
 *     heart rate up, and they report feeling great: the debt is real and stays.
 *     Feeling good is not the same as being recovered, and a product that let
 *     enthusiasm clear a deficit would be actively dangerous.
 *
 * The disagreements are the valuable cases, not the awkward ones, and both
 * sides stay on screen in every one of them.
 */
const REPORT_MAX_WEIGHT = 2;

export function composeTerrainNow(input: {
  measured: TerrainReading;
  /**
   * Today's check-in, in the member's own local date, or null.
   *
   * Freshness is the caller's job and the rule is deliberately strict: only
   * today's. Yesterday's "energy 1/5" is history — it belongs in a trend, and
   * letting it stand in for the present would have the app insisting somebody
   * is depleted on a morning they woke up fine. Because it is read live, an
   * edit at 6pm simply replaces the 8am answer; there is one current report per
   * day, not two observations.
   */
  reported: ReportedSignals | null;
}): TerrainReading {
  const { measured } = input;
  const lean = terrainLeanFrom(input.reported ?? null);

  // Answered too little to mean anything — the measured reading stands, exactly
  // as it did before any of this existed.
  if (lean === null) return { ...measured, hasReport: false };

  // Answered, and nothing pulls either way. That is a report, and it is not a
  // reason for anything.
  if (lean === 0) return { ...measured, hasReport: true };

  const pulls: "restore" | "build" = lean < 0 ? "restore" : "build";
  const weight = Math.min(REPORT_MAX_WEIGHT, Math.abs(lean));
  const reasons: TerrainReason[] = [
    ...measured.reasons,
    { source: "reported", text: reportedReason(input.reported!, pulls), pulls },
  ];

  const toRestore =
    measured.reasons.filter((r) => r.pulls === "restore").length +
    (pulls === "restore" ? weight : 0);
  const toBuild =
    measured.reasons.filter((r) => r.pulls === "build").length + (pulls === "build" ? weight : 0);

  return {
    lean: toRestore > toBuild ? "restore" : toBuild > toRestore ? "build" : "either",
    reasons,
    week: measured.week,
    hasBody: measured.hasBody,
    hasReport: true,
  };
}

/**
 * The reported reason, in their own numbers.
 *
 * Names the signals that actually pulled, so the sentence is checkable the way
 * the measured ones are — someone who reads "Recovery 2/5" and knows they put 4
 * has somewhere to point. The signals come from `signalPulls`, the same
 * judgement the lean itself used, rather than a second opinion about which
 * answers were the low ones.
 *
 * Third person, deliberately. The same sentence is read by the member and by
 * their coach, and "you reported" is wrong on one of those two screens.
 */
function reportedReason(reported: ReportedSignals, pulls: "restore" | "build"): string {
  const want = pulls === "restore" ? -1 : 1;
  const named = signalPulls(reported)
    .filter((p) => p.pull === want)
    .map((p) => {
      const meta = TERRAIN_SIGNALS.find((s) => s.id === p.id)!;
      return `${meta.label} ${reported[p.id]}/5`;
    });
  return named.length ? `Reported today: ${named.join(", ")}` : "Reported today";
}

/**
 * The line the app shows.
 *
 * ── The word "terrain" does not appear here, on purpose ───────────────────
 *
 * It used to: "Your terrain is asking to be restored." The first two people to
 * read that asked what terrain meant, and guessed diet, then protocols. When
 * the person who owns the brand cannot resolve a word on his own home screen,
 * no member is going to.
 *
 * Terrain stays as the concept — it is the name of this file, the endpoint and
 * the model, and the marketing site has the room to teach it properly. What it
 * cannot be is a label doing work in four words on a phone.
 *
 * So the sentences say the plain thing instead, and they are close to how the
 * product's own author described the two halves out loud: Restore is "is the
 * body well rested", Build is "are you getting enough movement in".
 *
 * One sentence, no number, and it never gives an instruction, because this
 * reads signals and knows nothing about the member's actual day. It states a
 * condition and stops.
 *
 * ── Why it no longer says "your body is asking" ───────────────────────────
 *
 * That was the original way of avoiding an instruction, and it bought the
 * avoidance with the wrong voice — the register of a wellness retreat, where
 * the body is a party to be consulted rather than a thing you are. Read cold
 * by the founder it is written for, "your body is asking for rest" is the line
 * that makes a man close the app.
 *
 * Stating the condition flatly avoids the instruction just as well and costs
 * nothing: "you're short on recovery" tells him what is true and leaves the
 * decision where it belongs, with him and his coach.
 */
export function terrainHeadline(reading: TerrainReading): string {
  switch (reading.lean) {
    case "restore":
      return "You're short on recovery";
    case "build":
      return "You have room for more movement";
    case "either":
      return "You're well recovered";
    case "unknown":
      return "Not enough yet to tell";
  }
}
