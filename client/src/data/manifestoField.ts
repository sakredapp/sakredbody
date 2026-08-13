/**
 * The pieces the argument is made of, and the five states it passes through.
 *
 * Held as data so the animation and the prose cannot drift apart, and so the
 * words exist in the DOM for a screen reader even though the field draws them
 * on a canvas.
 *
 * ── What these are not ────────────────────────────────────────────────────
 *
 * Not warnings, and not a list of things Sakred is against. Sleep, HRV and
 * protein are all real and worth knowing; the argument is not that measuring
 * is bad, it is that measurement without relationship leaves you with more
 * information and less understanding. Nothing in the field is ever deleted —
 * see the header of ManifestoField.tsx, where integration deliberately keeps
 * every piece on screen.
 */

export interface Piece {
  word: string;
  /** The ConstellationBody region this belongs with once it finds a home. */
  region: string;
  /** Where it starts, in the scattered state. Radians, and a far radius. */
  angle: number;
  spread: number;
}

/**
 * Metrics, not verdicts. Deliberately the ordinary vocabulary of a modern
 * health app rather than anything exotic — the point is that this list is
 * familiar and that nobody is holding it together.
 */
export const PIECES: Piece[] = [
  { word: "Sleep", region: "crown", angle: 4.9, spread: 1.0 },
  { word: "Productivity", region: "crown", angle: 5.6, spread: 0.86 },
  { word: "Symptoms", region: "throat", angle: 0.35, spread: 0.94 },
  { word: "HRV", region: "heart", angle: 1.05, spread: 0.78 },
  { word: "Supplements", region: "heart", angle: 2.5, spread: 0.98 },
  { word: "Calories", region: "gut", angle: 3.35, spread: 0.82 },
  { word: "Protein", region: "gut", angle: 2.05, spread: 0.9 },
  { word: "Digestion", region: "gut", angle: 3.95, spread: 1.02 },
  { word: "Stress", region: "root", angle: 0.75, spread: 1.06 },
  { word: "Recovery", region: "root", angle: 4.4, spread: 0.74 },
  { word: "Workout", region: "arms", angle: 1.65, spread: 1.08 },
  { word: "Steps", region: "legs", angle: 2.95, spread: 0.7 },
];

/**
 * The verbs, for the compression only.
 *
 * Used sparingly and never as an accusation. The observation is narrower and
 * harder to argue with: when every signal arrives as an instruction, health
 * turns into one more thing to be performed well.
 */
export const COMMANDS = ["Track", "Fix", "Push", "Restrict", "Optimise", "Repeat"];

export type BeatKey = "fragmented" | "compressed" | "integrated" | "directions" | "whole";

export interface Beat {
  key: BeatKey;
  eyebrow: string;
  /** The line that carries the beat. Rendered large. */
  line: string;
  /** Emphasised tail of the line, or empty. */
  gold?: string;
  body?: string;
}

/**
 * Five states, and the argument survives entirely inside them.
 *
 * Nothing important is allowed to exist only in the motion — under reduced
 * motion these are shown as composed stills, and they still make the case in
 * order. The arc is fragmentation → compression → recognition → integration →
 * capacity, and it deliberately never runs disease → cure. What changes across
 * the five is understanding, not health.
 */
export const BEATS: Beat[] = [
  {
    key: "fragmented",
    eyebrow: "Where we are",
    line: "You know what your watch says.",
    gold: "You don't know what you feel.",
    body: "A specialist for each part. An app for each metric. A protocol for each complaint. More information than any generation has ever had, and nobody holding the whole picture — least of all the person living inside it.",
  },
  {
    key: "compressed",
    eyebrow: "What that does",
    line: "Every signal becomes another instruction.",
    body: "None of these numbers is wrong. But measured without relationship, they stop being information about a life and start being a standard to be met. Health becomes one more thing to perform, and there is no score at which you are allowed to stop.",
  },
  {
    key: "integrated",
    eyebrow: "The turn",
    line: "The body was never a collection of",
    gold: "separate problems.",
    body: "Nothing here gets deleted. Sleep is still sleep, digestion is still digestion, strength is still strength. What changes is that they stop being twelve unrelated verdicts and start being one system you can actually see.",
  },
  {
    key: "directions",
    eyebrow: "What it asks for",
    line: "One body.",
    gold: "Two directions.",
    body: "Restoration without rebuilding produces someone relaxed and fragile. Building without restoration produces someone impressive who breaks. Neither is the good half. The skill is entering one, taking what it offers, and being able to leave.",
  },
  {
    key: "whole",
    eyebrow: "What you're left with",
    line: "The pieces are all still here.",
    gold: "Now they have somewhere to belong.",
    body: "Not a cure, and not a claim about your health. A different relationship with the thing you live in — and enough room in it to adapt.",
  },
];
