/**
 * What Build is allowed to say, given the state Terrain has already decided.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Sakred has two readers of the same signals and they do not agree, by
 * construction rather than by accident:
 *
 *     composeTerrainNow   counts reasons by direction, and lets the member's
 *                         own report outweigh the measured side
 *     readReadiness       sums magnitudes, where that report is one ±2 term
 *                         among five
 *
 * Swept across a fixture grid, one case contradicts outright: excellent
 * wearables and a member who checked in saying they feel wrecked gives
 * terrain `restore` and readiness `primed`. That is not a tuning error. It is
 * two models answering two different questions, and the shipped bug was
 * letting the second one talk.
 *
 *     Home:  Keep today adjustable
 *     Build: You've got room to push today
 *
 * Both sentences came out of the same database, and `readLine` produced the
 * second from a readiness level with no idea what Terrain had concluded.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 *
 *     Terrain Now      decides how much capacity is available   (visible)
 *     readReadiness    is an ingredient of the suggestion       (internal)
 *     suggestToday     chooses which kind, inside that gate     (visible)
 *
 * So no readiness level, score or sentence reaches a member through this file.
 * Terrain owns the capacity claim; everything here either agrees with it or
 * says nothing.
 *
 * ── And it does not become a third engine ────────────────────────────────
 *
 * Nothing here scores anything. There is no `buildReadinessScore`, no second
 * weighting of sleep, no opinion about load. It reads a lean that has already
 * been decided, filters a list that has already been generated, and picks the
 * sentence that matches. Adding judgement to this file would recreate exactly
 * the disagreement it exists to prevent.
 */

import type { Suggestion, ReadinessRead } from "./recommend.js";
import type { TerrainLean, TerrainReason } from "./terrain.js";

export type BuildGate = {
  /**
   * The capacity sentence, consistent with Terrain by construction.
   *
   * Names the modality when one is available, because "strength looks useful"
   * is a more useful sentence than "you have capacity" — but the *permission*
   * in it always comes from the lean, never from the suggestion.
   */
  headline: string;
  /**
   * Why, in the member's own measured terms.
   *
   * Taken from Terrain's own reasons rather than composed here. They are
   * already plain sentences, already carry their provenance, and are already
   * the ones Home is showing — so the two screens explain themselves the same
   * way instead of inventing a second account of the same day.
   */
  rationale: string[];
  /** What may actually be offered. Filtered by the gate, ordered by the engine. */
  options: Suggestion[];
  /**
   * True when a demanding option may be presented at all.
   *
   * Presentation reads this rather than re-deriving it from the lean, so a new
   * surface cannot accidentally disagree about what restore means.
   */
  allowsBuild: boolean;
  /**
   * True when the measured picture stands alone and the member could correct it.
   *
   * The one thing sensors cannot supply is how somebody actually feels, and a
   * terrain built only from wearables is precisely the case where asking is
   * worth something. Deliberately an invitation and never a nag — Build offers
   * the canonical check-in, and has none of its own.
   */
  invitesReport: boolean;
  /**
   * True when there is not enough to say anything at all.
   *
   * An empty Build screen is a bad screen, but an invented recommendation is a
   * worse one. Callers render the invitation and nothing else.
   */
  insufficient: boolean;
};

/**
 * Does this option ask something of the body?
 *
 * `side` is the engine's own answer, already used to split Restore from Build,
 * so the gate does not get a second opinion about which shelf a category sits
 * on.
 */
function isDemanding(s: Suggestion): boolean {
  return s.side === "build";
}

export function buildGate(input: {
  /** Canonical, from `composeTerrainNow` — never recomputed here. */
  lean: TerrainLean;
  reasons: readonly TerrainReason[];
  /** Whether the member has said how they are today. */
  hasReport: boolean;
  /**
   * The readiness read, used only to know whether anything is known at all.
   *
   * Its `level` is deliberately not read. Confidence is a statement about how
   * much evidence exists, which Terrain does not express and which cannot
   * contradict a lean — the two are about different things.
   */
  read: Pick<ReadinessRead, "confidence">;
  suggestions: readonly Suggestion[];
}): BuildGate {
  const { lean, reasons, hasReport, read, suggestions } = input;

  /**
   * Terrain's reasons are written as standalone clauses and carry no terminal
   * punctuation, because Home renders them as separate rows. Joined into one
   * paragraph they ran together on a phone:
   *
   *     12 demanding sessions this week You have been restoring alongside it
   *
   * So they are terminated here rather than at the point of display, and every
   * surface that reads `rationale` gets sentences instead of fragments.
   */
  const rationale = reasons.map((r) => (/[.!?]$/.test(r.text.trim()) ? r.text.trim() : `${r.text.trim()}.`));

  /**
   * Nothing measured and nothing reported. `unknown` is Terrain's own word for
   * it, and confidence `none` is readiness agreeing — when both say they cannot
   * see anything, the honest screen says so and offers the way to fix it.
   */
  if (lean === "unknown" || read.confidence === "none") {
    return {
      headline: "Start where you are.",
      rationale: [],
      options: [],
      allowsBuild: false,
      invitesReport: !hasReport,
      insufficient: true,
    };
  }

  if (lean === "restore") {
    /**
     * No demanding option, at all, whatever readiness thinks. This is the
     * branch the whole file exists for: it is reachable with excellent
     * wearables, and it must not soften because the sensors look good.
     */
    const options = suggestions.filter((s) => !isDemanding(s));
    return {
      headline: "Today isn't asking for hard output.",
      rationale,
      options,
      allowsBuild: false,
      invitesReport: !hasReport,
      insufficient: false,
    };
  }

  /**
   * Available, conditionally. The most common honest state, and the one the
   * product is worst at when it rounds to either "rest" or "go".
   *
   * The condition is carried in the sentence rather than in a badge, because
   * "if the warm-up agrees" is an instruction somebody can actually follow and
   * a coloured pill is not.
   */
  if (lean === "either") {
    const pick = suggestions.find(isDemanding);
    return {
      headline: pick
        ? `${pick.label} is available if the warm-up agrees.`
        : "There's room today, if the warm-up agrees.",
      rationale,
      options: [...suggestions],
      allowsBuild: true,
      invitesReport: !hasReport,
      insufficient: false,
    };
  }

  const pick = suggestions.find(isDemanding);
  return {
    headline: pick ? `Good capacity to build — ${pick.label.toLowerCase()} today.` : "Good capacity to build today.",
    rationale,
    options: [...suggestions],
    allowsBuild: true,
    invitesReport: !hasReport,
    insufficient: false,
  };
}

/**
 * `readLine`, with Terrain given the final say.
 *
 * The headline on Today is generated from a readiness level, and on the
 * contradiction case that sentence is "You've got room to push today" on a day
 * Terrain has called restore. It reaches Restore and Build both, so the fix
 * belongs here rather than in either screen: a caller that forgets to gate is
 * the bug, and there is now only one function to call.
 *
 * Only the direction is overridden, never the wording of an agreeing line —
 * this is a guard, not a second copy deck.
 */
export function gatedLine(lean: TerrainLean, line: string, read: Pick<ReadinessRead, "level">): string {
  if (lean === "restore" && read.level === "primed") {
    return "Your body's asking for something back today.";
  }
  if (lean === "build" && read.level === "depleted") {
    return "There's room today — start easy and see what you find.";
  }
  return line;
}

/**
 * The invitation shown when the measured picture is standing alone.
 *
 * Separate from the headline so it can never be mistaken for the capacity
 * claim: this asks a question, and the sentence above it makes an assertion.
 */
/**
 * Says why the question exists, not what to press.
 *
 * `terrain_checkins` is empty product-wide: the subjective layer shipped and
 * nobody has ever used it. That is very unlikely to mean it is unwanted —
 * "Complete terrain check-in" is an instruction to perform a chore, and it
 * never says what the member gets back. The contradiction this whole file
 * guards against is precisely the case that cannot be read correctly until
 * somebody supplies the one signal no sensor holds, so the invitation has to
 * earn the tap rather than demand it.
 */
export const REPORT_INVITE = {
  title: "How are you actually feeling?",
  body: "Your health data tells us part of the picture. A quick check-in helps Sakred understand what the sensors can't.",
  action: "Check in",
} as const;
