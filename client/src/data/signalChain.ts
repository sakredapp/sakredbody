/**
 * How the reading is assembled — four sources, one terrain, three leans.
 *
 * ── The rule this file exists to keep ─────────────────────────────────────
 *
 * The lean is **computed** from what the four sources say, never written down
 * beside them. A diagram that states both the inputs and the conclusion as
 * separate prose can drift: someone edits a source note, the conclusion stays,
 * and the page quietly starts claiming something its own evidence doesn't
 * support. Here the conclusion cannot disagree with the columns, because it is
 * derived from them.
 *
 * ── Disagreement is never averaged ────────────────────────────────────────
 *
 * `resolveReading` checks for opposing pulls *before* it does any arithmetic.
 * Summing would let a wearable saying "fine" cancel a person saying "flat" and
 * land on neutral — the same answer, arrived at by erasing both statements
 * instead of holding them. Two sources pulling opposite ways is a finding, and
 * the finding is: keep today adjustable.
 *
 * This mirrors the app. TerrainToday states a lean with its reasons attached
 * rather than a score, and a member's own report is allowed to outvote a
 * wearable — see shared/models for the product-side version of the same rule.
 */

/** Which way a source is pulling today. -1 clear and restore, +1 load and build. */
export type Pull = -1 | 0 | 1;

export interface ChainSource {
  key: string;
  label: string;
  /** Why this column exists at all, in one line. */
  kind: string;
  items: string[];
  /**
   * How this source moves in the diagram.
   *
   * Each is drawn differently on purpose. Four columns pulsing identically
   * would say the four are the same kind of knowledge, and the entire argument
   * of this section is that they are not.
   */
  motion: "instrument" | "human" | "orbit" | "pattern";
}

export const CHAIN_SOURCES: ChainSource[] = [
  {
    key: "measured",
    label: "Measured",
    kind: "What an instrument can observe",
    items: ["Sleep", "HRV", "Resting heart rate", "Movement", "Training load"],
    motion: "instrument",
  },
  {
    key: "reported",
    label: "Reported",
    kind: "What only you can know",
    items: ["Energy", "Recovery", "Nervous system", "Digestion", "Clarity", "Drive"],
    motion: "human",
  },
  {
    key: "rhythm",
    label: "Rhythm",
    kind: "What today is, regardless of you",
    items: ["The day you're on", "Season", "Moon", "Cycle"],
    motion: "orbit",
  },
  {
    key: "practice",
    label: "Practice",
    kind: "What you're actually running",
    items: ["Habits", "Routines", "Coach's plan", "Sessions logged"],
    motion: "pattern",
  },
];

export interface Scenario {
  key: string;
  /** Keyed by source key. Every source speaks in every scenario. */
  says: Record<string, { note: string; pull: Pull }>;
}

/**
 * Three days, not three moods.
 *
 * The middle one is the point of the whole section: the instruments are
 * satisfied and the person is not. It is left in the rotation between two
 * unambiguous days so that the unambiguous days don't read as the normal case.
 */
export const SCENARIOS: Scenario[] = [
  {
    key: "after-a-hard-week",
    says: {
      measured: { note: "Sleep short three nights. HRV down and staying down.", pull: -1 },
      reported: { note: "Low energy. Digestion sluggish. Nothing sounds appealing.", pull: -1 },
      rhythm: { note: "Late in the cycle, late in the week.", pull: -1 },
      practice: { note: "Four hard sessions already logged.", pull: -1 },
    },
  },
  {
    key: "instruments-say-fine",
    says: {
      measured: { note: "Sleep 7h20. HRV steady. Resting heart rate normal.", pull: 1 },
      reported: { note: "Flat. Low drive. Recovery hasn't landed.", pull: -1 },
      rhythm: { note: "An ordinary Tuesday. Nothing seasonal.", pull: 0 },
      practice: { note: "The plan says a heavy lower session.", pull: 1 },
    },
  },
  {
    key: "rested-and-willing",
    says: {
      measured: { note: "Sleep long. HRV up. Load light for ten days.", pull: 1 },
      reported: { note: "Strong. Clear. Actively wanting work.", pull: 1 },
      rhythm: { note: "Early in the week, early in the cycle.", pull: 1 },
      practice: { note: "Two easy sessions logged. Room to add.", pull: 1 },
    },
  },
];

/** The scenario shown when there is no rotation to show one. */
export const REPRESENTATIVE_SCENARIO = SCENARIOS.findIndex(
  (s) => s.key === "instruments-say-fine",
);

export type Lean = "Restore" | "Keep today adjustable" | "Build";

export interface Reading {
  lean: Lean;
  /** Why, naming the columns. Derived, so it cannot contradict them. */
  because: string;
  /** Source keys that are pulling against another source. */
  contested: string[];
}

export function resolveReading(scenario: Scenario, sources = CHAIN_SOURCES): Reading {
  const spoken = sources
    .map((s) => ({ source: s, ...scenario.says[s.key] }))
    .filter((s) => s.pull !== undefined);

  const up = spoken.filter((s) => s.pull === 1);
  const down = spoken.filter((s) => s.pull === -1);

  // Checked before any arithmetic. See the header.
  if (up.length && down.length) {
    const label = (list: typeof up) => list.map((s) => s.source.label).join(" and ");
    return {
      lean: "Keep today adjustable",
      because: `${label(down)} say clear the terrain. ${label(up)} say load it. Neither is overruled, and the day is planned around the disagreement.`,
      contested: [...up, ...down].map((s) => s.source.key),
    };
  }

  if (down.length >= 2) {
    return {
      lean: "Restore",
      because: "Every source is pointing the same way, and nothing is arguing for load.",
      contested: [],
    };
  }
  if (up.length >= 2) {
    return {
      lean: "Build",
      because: "Nothing is asking to be cleared first, so the capacity is there to spend.",
      contested: [],
    };
  }

  return {
    lean: "Keep today adjustable",
    because: "Not enough is pointing anywhere to justify committing the day.",
    contested: [],
  };
}

/** The three leans, in the order they are shown. */
export const LEANS: { lean: Lean; body: string }[] = [
  { lean: "Restore", body: "Clear, drain, regulate, rebuild." },
  { lean: "Keep today adjustable", body: "Start it, and decide at the warm-up." },
  { lean: "Build", body: "Load, challenge, adapt, repeat." },
];
