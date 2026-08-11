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

/** One thing that is true, and which way it pulls. */
export type TerrainReason = {
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
};

export type TerrainReading = {
  lean: TerrainLean;
  reasons: TerrainReason[];
  /** What the week has actually asked for and given back. */
  week: { stress: number; restoration: number; sessions: number };
  /** True when the phone has synced nothing useful — the UI says so rather than guessing. */
  hasBody: boolean;
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

export function readTerrain(input: TerrainInputs): TerrainReading {
  const reasons: TerrainReason[] = [];
  const week = weekLoad(input.trainedCategories);

  const hasBody =
    input.sleepRecent !== null || input.hrvRecent !== null || input.rhrRecent !== null;

  // ── What the body is saying ──
  if (
    input.sleepRecent !== null &&
    input.sleepBaseline !== null &&
    input.sleepBaseline - input.sleepRecent >= SLEEP_DOWN_MIN
  ) {
    const down = Math.round(input.sleepBaseline - input.sleepRecent);
    reasons.push({ text: `Sleeping ${down} minutes less than usual`, pulls: "restore" });
  }

  if (
    input.hrvRecent !== null &&
    input.hrvBaseline !== null &&
    input.hrvBaseline > 0 &&
    input.hrvRecent / input.hrvBaseline <= HRV_DOWN_RATIO
  ) {
    reasons.push({ text: "Heart rate variability below your baseline", pulls: "restore" });
  }

  if (
    input.rhrRecent !== null &&
    input.rhrBaseline !== null &&
    input.rhrRecent - input.rhrBaseline >= RHR_UP_BPM
  ) {
    reasons.push({ text: "Resting heart rate up on your baseline", pulls: "restore" });
  }

  // ── What the week has asked for ──
  if (week.stress >= HEAVY_WEEK_STRESS) {
    reasons.push({
      text: `${week.sessions} demanding session${week.sessions === 1 ? "" : "s"} this week`,
      pulls: "restore",
    });
  } else if (week.stress <= LIGHT_WEEK_STRESS && input.daysSinceLastSession !== null) {
    // Only when they have a history. Telling somebody who has never logged
    // anything that they are under-trained is a judgement about a stranger.
    if (input.daysSinceLastSession >= 3) {
      reasons.push({
        text: `Nothing demanding in ${input.daysSinceLastSession} days`,
        pulls: "build",
      });
    } else if (week.sessions > 0) {
      reasons.push({ text: "A light week so far", pulls: "build" });
    }
  }

  // Restoration that was actually done counts for something. It is the half of
  // the ledger every training app forgets, and the reason a heavy week after a
  // restorative one is not the same as a heavy week after another heavy one.
  if (week.restoration >= 6 && week.stress >= HEAVY_WEEK_STRESS) {
    reasons.push({ text: "You have been restoring alongside it", pulls: "build" });
  }

  if (!hasBody && input.daysSinceLastSession === null) {
    return { lean: "unknown", reasons: [], week, hasBody };
  }

  const toRestore = reasons.filter((r) => r.pulls === "restore").length;
  const toBuild = reasons.filter((r) => r.pulls === "build").length;

  const lean: TerrainLean =
    toRestore > toBuild ? "restore" : toBuild > toRestore ? "build" : "either";

  return { lean, reasons, week, hasBody };
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
 * One sentence, no number, and it never gives an instruction — "asking for"
 * rather than "you should", because this reads signals and knows nothing about
 * the member's actual day.
 */
export function terrainHeadline(reading: TerrainReading): string {
  switch (reading.lean) {
    case "restore":
      return "Your body is asking for rest";
    case "build":
      return "You have room for more movement";
    case "either":
      return "Rested enough for whatever today asks";
    case "unknown":
      return "Not enough yet to tell";
  }
}
