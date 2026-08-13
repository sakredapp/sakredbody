/**
 * How a reading forms — two stages, because the inputs are not the same kind.
 *
 * ── The invariant this file exists to hold ────────────────────────────────
 *
 *     Measured + Reported            → Terrain now      (what state you are in)
 *     Terrain + Rhythm + Practice    → Today's direction (what to do about it)
 *
 * This was one stage and four equal inputs, and it was wrong in a way that
 * mattered. Levelled together, a plan asking for a hard session counted toward
 * the reading — which says a coach's intention can make a body more recovered.
 * It cannot. A plan saying Build does not make poor recovery disappear, and a
 * restorative week does not make somebody physiologically depleted.
 *
 * So terrain is **state**, and only the two sources that can observe state
 * contribute to it. Rhythm and Practice are **context and intention**: they
 * join afterwards, when the question changes from "what is true" to "what
 * should today be". All four stay on screen the whole time; what changed is
 * that their roles are now truthful.
 *
 * The app carries the same invariant — Terrain Now is assembled from measured
 * physiology and the member's own report, and the coaching relationship
 * contributes nothing to it.
 *
 * ── The lean is computed, never written down beside the evidence ──────────
 *
 * A diagram that states both the inputs and the conclusion as separate prose
 * can drift: someone edits a source note, the conclusion stays, and the page
 * quietly starts claiming something its own columns don't support. Everything
 * below is derived.
 *
 * ── Disagreement is never averaged ───────────────────────────────────────
 *
 * `resolveTerrain` checks for opposing pulls before any arithmetic. Summing
 * would let a wearable saying "fine" cancel a person saying "flat" and land on
 * neutral by erasing both statements. Two sources pulling opposite ways is a
 * finding, and the finding is that the terrain is unsettled.
 */

/** Which way a source points today. -1 toward recovery, +1 toward load. */
export type Pull = -1 | 0 | 1;

export interface ChainSource {
  key: string;
  label: string;
  /** Why this column exists at all, in one line. */
  kind: string;
  items: string[];
  /**
   * `state` sources describe the body as it currently is, and only these two
   * assemble the terrain. `context` sources describe the day around it and
   * what you intend for it — they inform the direction, never the state.
   */
  role: "state" | "context";
  /**
   * How this source moves in the diagram.
   *
   * Each is drawn differently on purpose. Four columns pulsing identically
   * would say the four are the same kind of knowledge, which is the belief
   * this whole section argues against.
   */
  motion: "instrument" | "human" | "orbit" | "pattern";
}

export const CHAIN_SOURCES: ChainSource[] = [
  {
    key: "measured",
    label: "Measured",
    kind: "What an instrument can observe",
    items: ["Sleep", "HRV", "Resting heart rate", "Movement", "Training load"],
    role: "state",
    motion: "instrument",
  },
  {
    key: "reported",
    label: "Reported",
    kind: "What only you can know",
    items: ["Energy", "Recovery", "Nervous system", "Digestion", "Clarity", "Drive"],
    role: "state",
    motion: "human",
  },
  {
    key: "rhythm",
    label: "Rhythm",
    kind: "The context around today",
    items: ["The day you're on", "Season", "Moon", "Cycle"],
    role: "context",
    motion: "orbit",
  },
  {
    key: "practice",
    label: "Practice",
    kind: "What you intend to do",
    items: ["Habits", "Routines", "Coach's plan", "Sessions logged"],
    role: "context",
    motion: "pattern",
  },
];

export const STATE_SOURCES = CHAIN_SOURCES.filter((s) => s.role === "state");
export const CONTEXT_SOURCES = CHAIN_SOURCES.filter((s) => s.role === "context");

export interface Scenario {
  key: string;
  /** Keyed by source key. Every source speaks on every day. */
  says: Record<string, { note: string; pull: Pull }>;
}

/**
 * Four days, not four moods.
 *
 * Two of them exist to teach the invariant rather than to vary the answer.
 * `instruments-say-fine` has the device satisfied and the person flat, so the
 * terrain itself is unsettled. `the-plan-says-otherwise` has a clearly
 * under-recovered body and a plan asking for intervals — the case where a
 * levelled diagram would have let the plan vote the body into readiness.
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
      practice: { note: "The plan has a heavy lower session.", pull: 1 },
    },
  },
  {
    key: "the-plan-says-otherwise",
    says: {
      measured: { note: "HRV low four days running. Sleep down.", pull: -1 },
      reported: { note: "Heavy legs. Low drive. Slow to warm up.", pull: -1 },
      rhythm: { note: "Mid-week. Nothing unusual about today.", pull: 0 },
      practice: { note: "The plan has hard intervals today.", pull: 1 },
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

/** The day held when there is no rotation to show one. */
export const REPRESENTATIVE_SCENARIO = SCENARIOS.findIndex(
  (s) => s.key === "the-plan-says-otherwise",
);

/**
 * Whole clauses, not labels slotted into a template.
 *
 * The generated line read "Measured leave room to work. Reported asks for
 * less." — which is both ungrammatical and internal engine vocabulary showing
 * through on a public page. A source names a column; it is not a noun a
 * sentence can be built around.
 */
const CONTESTED_PHRASE: Record<string, { up: string; down: string }> = {
  measured: {
    up: "Your measured signals leave room to work",
    down: "Your measured signals ask for less",
  },
  reported: {
    up: "Your own read says there is more available",
    down: "Your own read asks for less",
  },
};

/* ── Stage one: the state ─────────────────────────────────────────────── */

export type TerrainState = "Under-recovered" | "Unsettled" | "Resourced";

export interface Terrain {
  state: TerrainState;
  because: string;
  /** Source keys pulling against each other. Both stay lit when they do. */
  contested: string[];
}

export function resolveTerrain(scenario: Scenario): Terrain {
  const spoken = STATE_SOURCES.map((s) => ({ source: s, ...scenario.says[s.key] }));
  const up = spoken.filter((s) => s.pull === 1);
  const down = spoken.filter((s) => s.pull === -1);

  // Checked before any arithmetic. See the header.
  if (up.length && down.length) {
    const clause = (list: typeof up, dir: "up" | "down") =>
      list.map((s) => CONTESTED_PHRASE[s.source.key]?.[dir] ?? s.source.label).join(", and ");
    return {
      state: "Unsettled",
      because: `${clause(up, "up")}. ${clause(down, "down")}. Neither is overruled.`,
      contested: [...up, ...down].map((s) => s.source.key),
    };
  }
  if (down.length) {
    return {
      state: "Under-recovered",
      because: "What was measured and what you reported point the same way.",
      contested: [],
    };
  }
  if (up.length) {
    return {
      state: "Resourced",
      because: "Measured and reported agree there is capacity here.",
      contested: [],
    };
  }
  return {
    state: "Unsettled",
    because: "Not enough has been observed today to say much either way.",
    contested: [],
  };
}

/* ── Stage two: the direction ─────────────────────────────────────────── */

export type Lean = "Restore" | "Keep today adjustable" | "Build";

export interface Direction {
  lean: Lean;
  because: string;
}

/**
 * Terrain first, then what the day and the plan are asking of it.
 *
 * The one rule with teeth: an under-recovered terrain can never resolve to
 * Build, however much the plan wants it. Intention can ask for less than the
 * state allows; it can never ask for more and get it.
 */
export function resolveDirection(terrain: Terrain, scenario: Scenario): Direction {
  const context = CONTEXT_SOURCES.reduce((n, s) => n + (scenario.says[s.key]?.pull ?? 0), 0);

  if (terrain.state === "Under-recovered") {
    return context >= 1
      ? {
          lean: "Keep today adjustable",
          because:
            "Your body is still recovering and the plan is asking for load. The plan doesn't get to decide that, so today starts gently and the session is chosen at the warm-up.",
        }
      : {
          lean: "Restore",
          because: "Nothing today is asking for load, and the state agrees.",
        };
  }

  if (terrain.state === "Unsettled") {
    return {
      lean: "Keep today adjustable",
      because:
        "Sakred keeps both readings in view rather than picking one. Today starts, and how far it goes is decided once you're moving.",
    };
  }

  if (context <= -1) {
    return {
      lean: "Restore",
      because: "There is capacity, and the day and the plan both call for a lighter one.",
    };
  }
  if (context >= 1) {
    return {
      lean: "Build",
      because: "The state supports it and the plan is ready for it.",
    };
  }
  return {
    lean: "Keep today adjustable",
    because: "There is capacity, but nothing in particular is asking for it today.",
  };
}

/** The three leans, in the order they are shown. */
export const LEANS: { lean: Lean; body: string }[] = [
  { lean: "Restore", body: "Clear, drain, regulate, rebuild." },
  { lean: "Keep today adjustable", body: "Start it, and decide at the warm-up." },
  { lean: "Build", body: "Load, challenge, adapt, repeat." },
];
