/**
 * Which decision system produced this.
 *
 * ── Why a version string is usually a lie ─────────────────────────────────
 *
 * Every product that records `algorithm_version` alongside its output starts
 * with somebody typing "1.0.0" and ends, about four months later, with a table
 * full of rows that all say "1.0.0" and describe six different algorithms. The
 * version is never wrong at the moment it is written; it goes wrong every time
 * the logic changes and nobody remembers the constant exists.
 *
 * That failure is silent and it destroys the only question the field was added
 * to answer — *reconstruct exactly which decision system produced this* — and
 * it destroys it retroactively, for data already collected.
 *
 * So the versions here are pinned to a digest of the modules they name, and
 * `script/test-brain.ts` recomputes those digests on every run. Change how
 * Today ranks a suggestion and the suite fails until the version is bumped and
 * the digest updated in the same edit. The constant cannot drift away from the
 * code, because the code is what defines it.
 *
 * ── The smallest useful version model ─────────────────────────────────────
 *
 * The temptation is one version per engine per concern: a terrain version, a
 * today version, a copy version, a safety version, a weighting version. Six
 * columns that always move together are six ways to be inconsistent and no
 * extra information.
 *
 * What actually moves independently today is one level coarser:
 *
 *   BRAIN_VERSION       the release of the intelligence engine as a whole.
 *                       Every recommendation carries it, so "what was Sakred
 *                       in August" is one predicate.
 *   DECISION_LOGIC      per engine, because Today's ranking and the habit
 *                       decision genuinely do change without each other.
 *   GUIDANCE_VERSION    the member-facing wording of a recommendation.
 *
 * Guidance is recorded separately even though it is not yet *separable* —
 * every headline and every because-sentence still lives inside the decision
 * module that chose it. Rather than pretend otherwise, the test asserts the
 * two move together, and that assertion is what will fail on the day somebody
 * lifts the copy out into its own file. At that point guidance gets its own
 * digest and the recorded history stays readable across the change.
 *
 * ── What is deliberately absent ───────────────────────────────────────────
 *
 * `prompt_version`, `model_provider`, `model_id`. No member-facing
 * recommendation in this repository is produced by a language model — see
 * docs/intelligence-map.md, which is asserted rather than believed. Those
 * fields exist on the record and are NULL, and forcing a value into them to
 * make the schema look modern would be the single most expensive lie in the
 * table: it would make deterministic output indistinguishable from generated
 * output the first time either one is wrong.
 */

/**
 * The release of the whole intelligence engine.
 *
 * Bumped when any decision version below is bumped — it is the coarse handle
 * ("the August brain") and it is what a published/rolled-back Brain Version
 * will eventually name.
 */
export const BRAIN_VERSION = "2026.08.1";

/** Every engine that decides something a member is shown. */
export const DECISION_ENGINES = ["today", "terrain", "build", "habit", "rhythm"] as const;
export type DecisionEngine = (typeof DECISION_ENGINES)[number];

export type EngineVersion = {
  version: string;
  /**
   * The files whose contents *are* this version.
   *
   * Repo-relative. Listing a file here is the commitment that changing it
   * changes the decision — so a module that only formats a date does not
   * belong, and one that picks a threshold does.
   */
  modules: readonly string[];
  /**
   * sha256 of those files, concatenated in the order listed, hex, first 16.
   *
   * Not a hash anybody should read. It exists so the test can tell "the logic
   * changed" from "the logic did not", which is the one thing a human reviewer
   * reliably gets wrong about their own diff.
   */
  digest: string;
};

export const DECISION_LOGIC: Readonly<Record<DecisionEngine, EngineVersion>> = {
  /** Reading the day, and the three options that come out of it. */
  today: {
    /**
     * 1.1.0 — goals participate in the ranking.
     *
     * Minor rather than major: nothing about the existing decision changed for
     * a member with no goals, and the twin-winner comparison in `suggestToday`
     * is what proves it. A member who acquires a goal gets a different ordering
     * from this version onward, which is exactly what a version is for.
     */
    version: "1.1.0",
    modules: ["shared/models/recommend.ts"],
    digest: "d2ea4b39420218e8",
  },
  /** Restore or build, composed from measured and reported evidence. */
  terrain: {
    version: "1.0.0",
    modules: ["shared/models/terrain.ts"],
    digest: "a88744b93d8714b8",
  },
  /** Whether today's session is gated, and what the gate says. */
  build: {
    version: "1.0.0",
    modules: ["shared/models/buildToday.ts"],
    digest: "d18b5eb55519e38e",
  },
  /** Which habits are proposed, in what order, and when they are due. */
  habit: {
    version: "1.0.0",
    modules: ["shared/models/habitResolve.ts", "shared/models/habitSchedule.ts"],
    digest: "a0ddcb555571e02f",
  },
  /** Phase estimation, and what a phase is allowed to contribute. */
  rhythm: {
    version: "1.0.0",
    modules: ["shared/models/rhythm.ts"],
    digest: "421f269dd2d791a8",
  },
};

/**
 * The wording a member reads.
 *
 * One version for all of it, and today it is pinned to the union of the
 * decision modules because that is where the copy still lives. See the header:
 * the day that stops being true, this gets its own module list, and the test
 * that currently asserts they are identical is what will say so.
 */
export const GUIDANCE_VERSION = "1.0.0";

/**
 * The version of the personal-pattern algorithm, when one influenced the
 * recommendation. Null on the record otherwise — a recommendation that no
 * learned pattern touched must not claim one did.
 */
export const PATTERN_ALGORITHM_VERSION = "1.0.0";

/** The engine that produced each kind of recommendation. */
export function engineFor(engine: DecisionEngine): EngineVersion {
  return DECISION_LOGIC[engine];
}

// ─── The vocabulary of grounds ─────────────────────────────────────────────

/**
 * Every ground a recommendation is allowed to cite.
 *
 * Closed for the same reason event names are closed: an open string becomes
 * `sleep_low`, `low_sleep` and `sleepDeficit` inside a quarter, and no query
 * can tell they are one thing. Adding a code is a line here and a line at the
 * site that decides.
 *
 * None of these carries a value. `sleep_deficit_large` is a fact about the
 * decision; the hours are a fact about the member's body and never leave the
 * request that computed them.
 */
export const REASON_CODES = [
  // Measured, from the phone's health store.
  "sleep_deficit_large",
  "sleep_deficit_mild",
  "sleep_surplus",
  "rhr_elevated_strong",
  "rhr_elevated_mild",
  "rhr_low",
  "hrv_down_strong",
  "hrv_down_mild",
  "hrv_up",
  // Reported, by the member, about themselves.
  "reported_low",
  "reported_mild_low",
  "reported_good",
  "reported_mild_good",
  // Behaviour the app has recorded.
  "recent_hard_load",
  "recent_moderate_load",
  "rest_gap",
  "week_heavy",
  "week_light",
  // The rhythm estimate, which colours and never decides.
  "cycle_lean",
  // Selection grounds, rather than evidence about the day.
  "slot_fit",
  "novelty_nudge",
  "category_excluded",
  "no_signals",
  /** A learned personal pattern moved this up or down the list. */
  "personal_pattern",
  /**
   * One of the member's own goals is about this, and it changed the order.
   *
   * Recorded only where goal relevance actually moved the choice — see
   * `suggestToday`. A member who has a running goal and was shown a mobility
   * session for reasons entirely unrelated to it does not get this code, and
   * `Why this?` therefore cannot claim their running goal was involved.
   *
   * It is a selection ground and never evidence about the day. What the goal
   * is, and how close they are to it, stays in member_goals.
   */
  "goal_relevant",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
