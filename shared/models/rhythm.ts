/**
 * Cycle rhythm — hers, or a partner's.
 *
 * ── One model, two audiences ──────────────────────────────────────────────
 *
 * A woman asking "what should I do today" and a man asking "how do I show up
 * tonight" are reading the same underlying thing from different sides. Building
 * those as two features would mean two phase estimators drifting apart, and the
 * moment both people are on Sakred they would disagree in front of each other.
 *
 * So the estimate lives here once, and only the guidance differs: `self` speaks
 * to the person whose body it is, `partner` speaks to somebody supporting her.
 *
 * ── Cycle-informed, not cycle-determined ──────────────────────────────────
 *
 * This is the whole design, and it is enforced by arithmetic rather than by
 * copy. `cycleLean` returns at most ±1, while sleep and resting heart rate are
 * each worth ±2 in readReadiness. A phase can therefore colour a day and can
 * never decide one: somebody in late luteal who slept nine hours and feels
 * strong reads as primed, and the app says so.
 *
 * That ordering is deliberate and load-bearing. An app that tells a woman she
 * cannot train because a calendar says day 23 has replaced her judgement with
 * an average, which is the opposite of what this product is for.
 *
 * ── Estimates are estimates ───────────────────────────────────────────────
 *
 * Cycle length varies between people and between cycles for the same person,
 * so a date-derived phase is a guess with a confidence attached — never a
 * statement of fact. `confidence` drives the language: "likely late luteal"
 * when we counted days, "late luteal" only when she confirmed it herself.
 *
 * Nothing here is contraception or fertility guidance, and the phase estimate
 * must never be presented as either. Ovulation timing is exactly the thing
 * this model is least able to pin down.
 */

export const CYCLE_PHASES = ["menstrual", "follicular", "ovulatory", "luteal"] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];

/**
 * How much we trust the phase, in the order the language should escalate.
 *
 * `confirmed` is reserved for the person whose body it is saying so. Counting
 * days from a period start never earns it, however tidy the arithmetic looks.
 */
export type RhythmConfidence = "confirmed" | "likely" | "approximate" | "uncertain";

/** Where a fact came from. Kept so nothing ever claims she said something she didn't. */
export type RhythmProvenance =
  | "self_reported"
  | "partner_shared"
  | "partner_confirmed"
  | "member_entered"
  | "estimated";

export type RhythmModel =
  /** Ordinary spontaneous cycles — the only case phase estimation applies to. */
  | "spontaneous_cycle"
  /** Hormonal contraception: bleeding is scheduled, phases are not meaningful. */
  | "hormonal_contraception"
  /** Known irregular. Education still works; date maths does not. */
  | "irregular"
  /** Opted out, or not applicable. */
  | "none";

export type RhythmEstimate = {
  phase: CyclePhase | null;
  /** 1-based day of the cycle, when it can be counted. */
  cycleDay: number | null;
  confidence: RhythmConfidence;
  provenance: RhythmProvenance;
  /** True when the information we have is too old to lean on. */
  stale: boolean;
};

const DEFAULT_CYCLE_LENGTH = 28;

/** Whole days between two ISO dates. */
function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Estimate today's phase.
 *
 * Confidence degrades on purpose as the inputs get thinner, and drops to
 * `uncertain` entirely once we are past roughly a cycle and a half without a
 * new period — at that point the count is arithmetic about a cycle that has
 * almost certainly already restarted.
 */
export function estimatePhase(input: {
  model: RhythmModel;
  /** ISO date of the last period start, if known. */
  lastPeriodStart?: string | null;
  /** Her own statement of the current phase, if given. */
  confirmedPhase?: CyclePhase | null;
  confirmedOn?: string | null;
  cycleLength?: number | null;
  periodLength?: number | null;
  regular?: boolean | null;
  today: string;
}): RhythmEstimate {
  const {
    model,
    lastPeriodStart,
    confirmedPhase,
    confirmedOn,
    cycleLength,
    periodLength,
    regular,
    today,
  } = input;

  // She said so. Nothing computed outranks that, for about a week — after
  // which the statement is about a phase she has probably moved out of.
  if (confirmedPhase) {
    const age = confirmedOn ? daysBetween(confirmedOn, today) : 0;
    const stale = Number.isFinite(age) && age > 7;
    return {
      phase: confirmedPhase,
      cycleDay: null,
      confidence: stale ? "approximate" : "confirmed",
      provenance: "self_reported",
      stale,
    };
  }

  // Phases are only meaningful for a spontaneous cycle. Counting days on
  // hormonal contraception produces a confident-looking number about a
  // physiology the model does not describe — see the note at the top.
  if (model !== "spontaneous_cycle" || !lastPeriodStart) {
    return {
      phase: null,
      cycleDay: null,
      confidence: "uncertain",
      provenance: "estimated",
      stale: false,
    };
  }

  const elapsed = daysBetween(lastPeriodStart, today);
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return { phase: null, cycleDay: null, confidence: "uncertain", provenance: "estimated", stale: false };
  }

  const length = cycleLength && cycleLength >= 20 && cycleLength <= 45 ? cycleLength : DEFAULT_CYCLE_LENGTH;
  const bleed = periodLength && periodLength >= 1 && periodLength <= 10 ? periodLength : 5;

  // Well past a full cycle means a period we were never told about.
  if (elapsed > length * 1.5) {
    return {
      phase: null,
      cycleDay: null,
      confidence: "uncertain",
      provenance: "estimated",
      stale: true,
    };
  }

  const cycleDay = (elapsed % length) + 1;
  // Ovulation is placed relative to the *next* period rather than the last,
  // because the luteal phase is the more consistent half. It is still the
  // least certain call in here, which is why nothing fertility-related may
  // ever be built on it.
  const ovulationDay = length - 14;

  let phase: CyclePhase;
  if (cycleDay <= bleed) phase = "menstrual";
  else if (cycleDay < ovulationDay - 1) phase = "follicular";
  else if (cycleDay <= ovulationDay + 1) phase = "ovulatory";
  else phase = "luteal";

  // A known-irregular cycle, an unusual length, or a second cycle counted
  // without a fresh period all mean the count is softer than it looks.
  const confidence: RhythmConfidence =
    regular === false || elapsed >= length ? "approximate" : "likely";

  return { phase, cycleDay, confidence, provenance: "estimated", stale: false };
}

/**
 * What the phase contributes to the day's read — at most ±1.
 *
 * Bounded below the weight of any measured signal, which is what makes
 * "cycle-informed, not cycle-determined" true in the arithmetic rather than
 * only in the copy. See readReadiness for the signals it competes with.
 *
 * Late luteal and the first days of bleeding lean restorative; the follicular
 * rise leans capable. Everything else is neutral, because the honest answer
 * for most of the cycle is that it does not tell us much on its own.
 */
export function cycleLean(estimate: RhythmEstimate): number {
  if (!estimate.phase || estimate.stale) return 0;
  if (estimate.confidence === "uncertain") return 0;
  switch (estimate.phase) {
    case "menstrual":
      return -1;
    case "luteal":
      return -1;
    case "follicular":
      return 1;
    default:
      return 0;
  }
}

// ─── The guide ─────────────────────────────────────────────────────────────

export type PhaseGuide = {
  phase: CyclePhase;
  /** One word for the theme. Never a personality label. */
  theme: string;
  /** Plain description. Hedged where the evidence is genuinely mixed. */
  summary: string;
  /** What to actually do, in ordinary words. */
  goodMove: string;
  /** A question rather than an assumption. */
  worthAsking: string;
};

/**
 * The same four phases, said to the person living them.
 *
 * Every summary hedges deliberately — "some women notice" rather than "you
 * will feel" — because the variation between women is larger than the pattern,
 * and telling somebody how she feels is the fastest way to be wrong in a way
 * she resents.
 */
export const SELF_GUIDE: Readonly<Record<CyclePhase, PhaseGuide>> = {
  menstrual: {
    phase: "menstrual",
    theme: "Restore",
    summary:
      "Your period has started. Some women want lower output here; others feel much as usual. Let your actual energy decide rather than the calendar.",
    goodMove: "Keep training optional and make warmth, sleep and hydration easy to reach.",
    worthAsking: "What does your body actually want today?",
  },
  follicular: {
    phase: "follicular",
    theme: "Rise",
    summary:
      "The stretch after your period and before ovulation. Energy and training tolerance often build through here.",
    goodMove: "A good window to add load if your recovery agrees.",
    worthAsking: "What would you like to push this week?",
  },
  ovulatory: {
    phase: "ovulatory",
    theme: "Express",
    summary:
      "Around ovulation. Some women notice a shift in energy, strength or social drive; plenty notice very little.",
    goodMove: "Worth noticing what is genuinely different for you here, rather than assuming.",
    worthAsking: "Does anything reliably change for you around now?",
  },
  luteal: {
    phase: "luteal",
    theme: "Consolidate",
    summary:
      "After ovulation, heading toward your next period. Appetite, sleep, recovery and patience can all shift as it goes on — more often late than early.",
    goodMove: "Keep plans flexible and protect recovery, without dropping training on principle.",
    worthAsking: "Is today asking for less, or does it just look like it should?",
  },
};

/**
 * The same four phases, said to somebody supporting her.
 *
 * The rule this encodes: offer an action and a question, never a prediction
 * about her mood. "She'll be emotional" is both frequently wrong and the exact
 * thing that makes this kind of feature insulting.
 */
export const PARTNER_GUIDE: Readonly<Record<CyclePhase, PhaseGuide>> = {
  menstrual: {
    phase: "menstrual",
    theme: "Restore",
    summary:
      "Her period has started. This is a lower-energy and physically harder stretch for some women and unremarkable for others.",
    goodMove: "Take one thing off her plate rather than assuming she wants the normal pace.",
    worthAsking: "What would make today easier?",
  },
  follicular: {
    phase: "follicular",
    theme: "Rise",
    summary:
      "The stretch after her period. Energy often builds through here, though how much varies a lot.",
    goodMove: "A reasonable week to suggest something active or social, if she's up for it.",
    worthAsking: "What sounds good this week?",
  },
  ovulatory: {
    phase: "ovulatory",
    theme: "Connect",
    summary:
      "Around ovulation. Some women notice changes in energy and connection here; others notice very little.",
    goodMove: "Treat this as a prompt to make time together, not a prediction about how she feels.",
    worthAsking: "What do you feel like doing together?",
  },
  luteal: {
    phase: "luteal",
    theme: "Simplify",
    summary:
      "The stretch before her next period. Energy, appetite and bandwidth can shift as it goes on, more often late than early.",
    goodMove: "Keep the evening uncomplicated and handle something practical without being asked.",
    worthAsking: "Do you want help, listening, company, or space?",
  },
};

/**
 * How to name the phase in the interface.
 *
 * Confidence is carried in the words rather than in a percentage nobody can
 * interpret. `confirmed` earns the bare name; everything else is hedged, and
 * an uncertain estimate is not named at all.
 */
export function phaseLabel(estimate: RhythmEstimate): string | null {
  if (!estimate.phase) return null;
  const name = `${estimate.phase.charAt(0).toUpperCase()}${estimate.phase.slice(1)}`;
  if (estimate.stale) return `${name} · out of date`;
  switch (estimate.confidence) {
    case "confirmed":
      return name;
    case "likely":
      return `Likely ${estimate.phase}`;
    case "approximate":
      return `${name} · estimated`;
    default:
      return null;
  }
}
