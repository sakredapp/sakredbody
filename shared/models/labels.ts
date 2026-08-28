/**
 * The boundary between what the database calls a thing and what a person does.
 *
 * ── The defect this exists because of ─────────────────────────────────────
 *
 * A member confirming an imported Apple Health workout read:
 *
 *     Sakred reads this as full_body.
 *
 * `full_body` is a canonical identifier. It is correct in the column, correct
 * in the API, correct in the load model — and it is not English. The component
 * that printed it even had a label map three lines above the render; it just
 * interpolated the raw field instead.
 *
 * That is the whole class of bug: a canonical value is a *string*, so nothing
 * stops it being rendered, and it reads as almost-right in review. Nobody
 * notices `full_body` in a diff. Everybody notices it on a phone.
 *
 * ── Why this file rather than a fix at each site ──────────────────────────
 *
 * Because there were already three copies of the same map — one in
 * ConfirmActivity, one in LogPractice, one canonical registry in training.ts —
 * and the two copies were both partial and both drifting. A fourth copy at
 * each new call site is the same bug with more places to forget.
 *
 * So: one module, and it *derives* from the registries that already exist
 * rather than restating them. `EXERCISE_CATEGORIES` carries its own labels and
 * remains the source of truth for them; this exposes the lookup. Only the
 * enums that genuinely had no label anywhere get one defined here.
 *
 * ── Why `satisfies Record<T, string>` everywhere ──────────────────────────
 *
 * So that adding a value to an enum without adding its public wording fails
 * the build rather than shipping. A registry that silently returns undefined
 * for a new case is how the next `full_body` reaches a phone — it would render
 * as blank or as the raw id depending on the fallback, and both are wrong in a
 * way no test written today would catch.
 *
 * ── Why some of these are not just title-cased ────────────────────────────
 *
 * Prettifying the identifier is the tempting general solution and it is wrong
 * often enough to be dangerous. `measured` title-cased is "Measured", which
 * tells a member nothing; what they need to know is that it came from their
 * watch. `adaptive-stressor` becomes "Adaptive stressor", which is Sakred's
 * own vocabulary and correct — but only because somebody decided so, not
 * because a regex did. See `terrainSourceLabel` for the case where one
 * internal value needs different words on different screens.
 */

import {
  EXERCISE_CATEGORIES,
  SET_STYLES,
  OBSERVATION_QUALITIES,
  OBSERVATION_SIDES,
  type SetStyle,
  type ObservationQuality,
  type ObservationSide,
} from "./training.js";
import { WORKOUT_FOCUSES, type WorkoutFocus } from "./health.js";
import { TERRAIN_SIGNALS, type TerrainSignalId } from "./terrainSignals.js";
import type { ReasonSource, TerrainLean } from "./terrain.js";

// ─── Movement categories ───────────────────────────────────────────────────

/**
 * Derived, not restated.
 *
 * `EXERCISE_CATEGORIES` already pairs every id with the wording the product
 * uses, and it is where a new category is added. Copying those pairs here
 * would recreate the exact drift this module exists to end.
 */
const CATEGORY_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  EXERCISE_CATEGORIES.map((c) => [c.id, c.label]),
);

/**
 * What to call a movement category on screen.
 *
 * Returns null rather than the id for something unrecognised. A caller that
 * wants to render regardless must say so — `categoryLabel(x) ?? "Movement"` is
 * a decision somebody made, where a silent fallback to the raw id is the
 * original bug wearing a helper's clothes.
 */
export function categoryLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return CATEGORY_LABEL[id] ?? null;
}

// ─── What the member said they trained ─────────────────────────────────────

export const WORKOUT_FOCUS_LABEL = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
  full_body: "Full body",
  conditioning: "Conditioning",
  other: "Other",
} satisfies Record<WorkoutFocus, string>;

export const focusLabel = (f: WorkoutFocus): string => WORKOUT_FOCUS_LABEL[f];

// ─── How a set was performed ───────────────────────────────────────────────

/**
 * Hyphenation is the reason these cannot be generated.
 *
 * "Warm-up" and "Back-off set" are how the words are written in English;
 * `warmup` and `backoff` are how they are written in a column. A title-casing
 * helper produces "Warmup" and "Backoff", which look like typos to the only
 * people who read them.
 */
export const SET_STYLE_LABEL = {
  normal: "Working set",
  warmup: "Warm-up",
  dropset: "Drop set",
  backoff: "Back-off set",
} satisfies Record<SetStyle, string>;

export const setStyleLabel = (s: SetStyle): string => SET_STYLE_LABEL[s];

// ─── What a member noticed ─────────────────────────────────────────────────

/*
  The wording is the component's, not a rewrite of it.

  `Observation.tsx` had carried these for as long as the feature has existed —
  "Tight or restricted", "Weak connection" — and they are better than anything
  a registry would have invented, because somebody chose them while looking at
  the screen a member chooses on. Centralising a label must not quietly restyle
  it; the copy moves across unchanged and the duplicate goes away.
*/
export const OBSERVATION_QUALITY_LABEL = {
  good: "Felt good",
  tight: "Tight or restricted",
  weak: "Weak connection",
  discomfort: "Discomfort",
  unstable: "Unstable",
  other: "Something else",
} satisfies Record<ObservationQuality, string>;

export const OBSERVATION_SIDE_LABEL = {
  left: "Left",
  right: "Right",
  both: "Both",
} satisfies Record<ObservationSide, string>;

// ─── The signals a member reports about themselves ────────────────────────

/**
 * Derived from `TERRAIN_SIGNALS`, which already pairs each id with its label
 * and is where a new signal is added.
 */
const SIGNAL_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  TERRAIN_SIGNALS.map((s) => [s.id, s.label]),
);

export function terrainSignalLabel(id: TerrainSignalId): string {
  return SIGNAL_LABEL[id];
}

// ─── Where a reading came from ─────────────────────────────────────────────

/**
 * The case that proves labels are not a formatting problem.
 *
 * `measured` and `reported` are the two kinds of evidence Terrain composes,
 * and keeping them distinguishable all the way to the screen is the point of
 * the whole design — "your resting heart rate is up" and "you said you feel
 * wrecked" are different claims and must never blur.
 *
 * But "Measured" is not what a member needs to read. They need to know it came
 * from their watch. And the right words differ by who is reading: a coach
 * looking at somebody else's terrain cannot be told it came from "your"
 * devices.
 *
 * So this takes a voice. One internal value, three legitimate renderings, and
 * no way to get the wrong one by accident.
 */
export function terrainSourceLabel(
  source: ReasonSource,
  voice: "member" | "coach" = "member",
): string {
  if (voice === "coach") {
    return source === "measured" ? "From their devices" : "From their check-in";
  }
  return source === "measured" ? "From your devices" : "From today's check-in";
}

// ─── Which way the day leans ───────────────────────────────────────────────

/**
 * Deliberately not "Unknown".
 *
 * `unknown` is the engine saying it cannot read this body yet, and printing
 * the word at somebody is both cold and uninformative. Every surface that can
 * reach this state already has copy for it; this exists so that a surface
 * which forgets renders something a person can read rather than a database
 * value.
 */
export const TERRAIN_LEAN_LABEL = {
  restore: "Restore",
  build: "Build",
  either: "Either",
  unknown: "Not enough to read yet",
} satisfies Record<TerrainLean, string>;

export const terrainLeanLabel = (l: TerrainLean): string => TERRAIN_LEAN_LABEL[l];

// ─── Where an imported workout came from ───────────────────────────────────

/**
 * Platform identifiers, as the companies write them.
 *
 * `health_connect` is Google's key; "Health Connect" is Google's product. The
 * member has the second one on their phone and has never seen the first.
 */
export const PLATFORM_LABEL: Readonly<Record<string, string>> = {
  ios: "Apple Health",
  apple_health: "Apple Health",
  healthkit: "Apple Health",
  android: "Health Connect",
  health_connect: "Health Connect",
  sakred: "Sakred",
  imported: "Imported",
};

export function platformLabel(p: string | null | undefined): string | null {
  if (!p) return null;
  return PLATFORM_LABEL[p] ?? null;
}

// ─── Imported activities ───────────────────────────────────────────────────

/**
 * What a member calls an activity their phone recorded.
 *
 * ── The defect this is built from ─────────────────────────────────────────
 *
 * A real phone showed:
 *
 *     Functionalstrengthtraining
 *
 * `HKWorkoutActivityType` has no name at runtime, so every reader of Apple
 * Health invents one. Ours maps `.functionalStrengthTraining` to "strength" —
 * but rows exist that carry the enum case itself, lowercased with its word
 * boundaries gone: `functionalstrengthtraining`. The old lookup was keyed on
 * `functional_strength`, which never matched, and the fallback title-cased
 * what was left.
 *
 * The lesson is not "add that key". It is that the previous code's stated
 * assumption — "the stored workout_type is already normalized to a plain
 * lowercase word" — was simply untrue of data already in the database, and
 * nothing checked. A presentation layer has to survive the values that exist,
 * not the values the writer intended.
 *
 * ── Why the collapsed forms are listed explicitly ─────────────────────────
 *
 * Because a word boundary cannot be recovered from `functionalstrengthtraining`
 * by any rule that does not also mangle `pickleball` and `kickboxing`. There
 * is no algorithm here, only knowledge, so the knowledge is written down.
 */
const HEALTH_ACTIVITY_LABEL: Readonly<Record<string, string>> = {
  // Our own normalized words, as the plugin currently sends them.
  running: "Running", walking: "Walking", cycling: "Cycling",
  swimming: "Swimming", hiking: "Hiking", yoga: "Yoga", pilates: "Pilates",
  strength: "Strength", hiit: "HIIT", rowing: "Rowing",
  elliptical: "Elliptical", stairs: "Stairs", core: "Core training",
  flexibility: "Flexibility", dance: "Dance", boxing: "Boxing",
  tennis: "Tennis", golf: "Golf", cooldown: "Cool-down",
  "mind and body": "Mind and body", "martial arts": "Martial arts",

  // HealthKit enum cases, collapsed and lowercased — the shape that leaked.
  functionalstrengthtraining: "Strength",
  traditionalstrengthtraining: "Strength",
  highintensityintervaltraining: "HIIT",
  coretraining: "Core training",
  mindandbody: "Mind and body",
  martialarts: "Martial arts",
  stairclimbing: "Stairs",
  crosstraining: "Cross-training",
  preparationandrecovery: "Recovery",
  waterfitness: "Water fitness",
  wheelchairwalkpace: "Wheelchair",
  wheelchairrunpace: "Wheelchair",
  mixedcardio: "Mixed cardio",
  handcycling: "Hand cycling",
  trackandfield: "Track and field",
  americanfootball: "American football",
  australianfootball: "Australian football",
  tabletennis: "Table tennis",
  waterpolo: "Water polo",
  crosscountryskiing: "Cross-country skiing",
  downhillskiing: "Downhill skiing",
  snowsports: "Snow sports",
  paddlesports: "Paddle sports",
  surfingsports: "Surfing",
  fitnessgaming: "Fitness gaming",
  cardiodance: "Cardio dance",
  socialdance: "Social dance",
  barre: "Barre", pickleball: "Pickleball", kickboxing: "Kickboxing",
  climbing: "Climbing", rockclimbing: "Climbing",
  jumprope: "Jump rope", jump_rope: "Jump rope",
  taichi: "Tai chi", tai_chi: "Tai chi",
  strengthtraining: "Strength", strength_training: "Strength",
  functional_strength: "Strength", cross_training: "Cross-training",
  high_intensity: "HIIT",

  // Health Connect, which uses SCREAMING_SNAKE and arrives lowercased.
  strength_training_hc: "Strength",
  exercise_class: "Class",
  guided_breathing: "Breathing",
  high_intensity_interval_training: "HIIT",
  strength_training_functional: "Strength",
  weightlifting: "Weightlifting",
  calisthenics: "Calisthenics",
};

/**
 * A label, or null when we genuinely do not know.
 *
 * Null rather than a guess, and that is the change. Title-casing an unknown
 * identifier is what produced "Functionalstrengthtraining" — it turns a value
 * we failed to recognise into a confident-looking piece of copy, which is
 * worse than an honest gap, because a gap is visibly a gap.
 *
 * A single word with no separators is still passed through: "pickleball" from
 * some third-party app is a real word a member recognises. A run-together
 * identifier is not, and the length rule is where the two part company.
 */
export function healthActivityLabel(workoutType: string | null | undefined): string | null {
  if (!workoutType) return null;
  const key = workoutType.trim().toLowerCase();
  if (!key || key === "other") return null;

  const known = HEALTH_ACTIVITY_LABEL[key];
  if (known) return known;

  /* Separators mean the writer kept the word boundaries — safe to title-case. */
  if (/[_\s-]/.test(key)) {
    const words = key.replace(/[_-]+/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /*
    One plausible word. Fourteen characters is longer than almost every English
    activity name and shorter than every collapsed identifier that has bitten
    us, so it separates "pickleball" from "functionalstrengthtraining" without
    pretending to be a parser.
  */
  if (key.length <= 14) return key.charAt(0).toUpperCase() + key.slice(1);
  return null;
}

// ─── The catch-all, used deliberately and rarely ───────────────────────────

/**
 * A last resort for values that are genuinely open sets.
 *
 * `sourceApp` is whatever third-party app wrote a sample into Health — there
 * is no enum to be exhaustive over, and it arrives already human ("Strava",
 * "Oura"). This tidies a machine-shaped one without pretending to know it.
 *
 * Not for enums. If a value has a finite type, it gets a registry above, and
 * the compiler enforces that every member of it has been thought about. This
 * function cannot enforce anything, which is exactly why it must not become
 * the general answer.
 */
export function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * What a failed request says to the member.
 *
 * ── The leak this closes ──────────────────────────────────────────────────
 *
 * A phone showed this, in a red banner, over Build:
 *
 *     {"message":"Unauthorized"}
 *
 * `throwIfResNotOk` threw `new Error(\`${status}: ${body}\`)`, so the raw
 * response body *was* the error message, and every `toast({ title: e.message })`
 * in the product — there are many — printed it. Exactly the failure this
 * module exists for: a machine value with nothing between it and a member.
 *
 * ── Why the server's own words are sometimes kept ─────────────────────────
 *
 * Some of them are written for people — "Could not save health data." —
 * and throwing those away for a generic sentence would lose real information.
 * Some of them are HTTP vocabulary: "Unauthorized", "Forbidden", "Not Found".
 * The test is whether it reads as a sentence somebody wrote: more than one
 * word, and not one of the status names. Everything else falls back to the
 * wording for its status, and the raw text stays in the logs.
 */
const STATUS_SAYS: Record<number, string> = {
  400: "That didn't look right. Check it and try again.",
  401: "Your session needs to be refreshed. Sign in again.",
  403: "You don't have access to that.",
  404: "That's no longer here.",
  409: "That's already been done.",
  413: "That file is too large.",
  429: "That's a lot at once. Give it a moment.",
  /* Said rather than left to the 5xx catch-all, because this one is worth
     retrying and the generic sentence does not say so. `bearerAuth` answers
     with it when it cannot reach the table that says who is signed in — which
     is a fact about the server, never about the member. */
  503: "Sakred couldn't reach the server just then. Try that again.",
};

/** HTTP's own vocabulary, which is never member-facing however it arrives. */
const MACHINE_WORDS = new Set([
  "unauthorized",
  "forbidden",
  "not found",
  "bad request",
  "conflict",
  "internal server error",
  "service unavailable",
  "unprocessable entity",
  "too many requests",
]);

export function statusSays(status: number): string {
  if (STATUS_SAYS[status]) return STATUS_SAYS[status];
  if (status >= 500) return "Something went wrong on our end. Try again.";
  return "That didn't work. Try again.";
}

/** Whether a server's `message` is prose a member can be shown. */
export function readsAsSentence(text: string): boolean {
  const t = text.trim();
  if (!t || MACHINE_WORDS.has(t.toLowerCase())) return false;
  /* One word is a token, not a sentence — and JSON or a stack never is. */
  if (!/\s/.test(t)) return false;
  if (/^[[{]/.test(t) || /^\d{3}:/.test(t)) return false;
  return /^[A-Z]/.test(t);
}

/**
 * The member-facing sentence for a thrown request failure.
 *
 * `fallback` is what to say when nothing better can be worked out — pass the
 * one that fits the action, so "That didn't post." beats a general apology.
 */
export function humanError(err: unknown, fallback = "That didn't work. Try again."): string {
  const status =
    err && typeof err === "object" && "status" in err && typeof err.status === "number"
      ? err.status
      : null;
  const raw =
    err && typeof err === "object" && "serverMessage" in err && typeof err.serverMessage === "string"
      ? err.serverMessage
      : err instanceof Error
        ? err.message
        : "";

  /* `401: {"message":"Unauthorized"}` — the shape thrown before this existed. */
  const stripped = raw.replace(/^\d{3}:\s*/, "").trim();
  let said = stripped;
  if (/^[[{]/.test(stripped)) {
    try {
      const parsed: unknown = JSON.parse(stripped);
      said =
        parsed && typeof parsed === "object" && "message" in parsed &&
        typeof (parsed as { message: unknown }).message === "string"
          ? (parsed as { message: string }).message
          : "";
    } catch {
      said = "";
    }
  }

  if (readsAsSentence(said)) return said;
  if (status !== null) return statusSays(status);
  return fallback;
}

/**
 * Every finite enum this module is responsible for, for the test that proves
 * none of them can grow a value without wording.
 */
export const LABELLED_ENUMS = {
  exerciseCategory: { values: EXERCISE_CATEGORIES.map((c) => c.id), label: (v: string) => categoryLabel(v) },
  workoutFocus: { values: [...WORKOUT_FOCUSES], label: (v: string) => WORKOUT_FOCUS_LABEL[v as WorkoutFocus] },
  setStyle: { values: [...SET_STYLES], label: (v: string) => SET_STYLE_LABEL[v as SetStyle] },
  observationQuality: {
    values: [...OBSERVATION_QUALITIES],
    label: (v: string) => OBSERVATION_QUALITY_LABEL[v as ObservationQuality],
  },
  observationSide: {
    values: [...OBSERVATION_SIDES],
    label: (v: string) => OBSERVATION_SIDE_LABEL[v as ObservationSide],
  },
  terrainLean: {
    values: ["restore", "build", "either", "unknown"],
    label: (v: string) => TERRAIN_LEAN_LABEL[v as TerrainLean],
  },
} as const;
