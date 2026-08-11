/**
 * How you're showing up, and what they might need.
 *
 * ── The two corrections this file exists to hold ──────────────────────────
 *
 * **1. A generic model must not produce generic content.**
 *
 * `SELF_GUIDE` / `PARTNER_GUIDE` in rhythm.ts are role views, which was the
 * right call for the *schema* — it is what lets one person hold both their own
 * rhythm and somebody else's without two parallel implementations. But roles
 * alone flatten the product. "Ask your partner what they need" is true of
 * everybody and useful to nobody.
 *
 * So the role says what the guidance is *for*; the subject's actual context —
 * their sex, their physiology, what kind of week they are having — says what
 * knowledge is *relevant*. Generic infrastructure, specific guidance.
 *
 * **2. Sakred has no telepathy about anyone it has not measured.**
 *
 * This is the harder rule and the one most easily broken by good copy. A line
 * like "he's coming off several high-output days and short sleep" reads
 * wonderfully and, for almost every member, is fiction: the app holds *their*
 * sleep and *their* training, and knows nothing whatever about their partner's.
 *
 * There are exactly three honest sources for a claim about another person:
 *
 *   estimated          derived from dates the member entered — the cycle, and
 *                      only the cycle, because it is periodic and countable
 *   entered_by_member  the member wrote it down: a brutal work week, a bad
 *                      night, travel. Specific, and labelled as theirs
 *   shared_by_them     they said so themselves through a connected account.
 *                      Not reachable yet; the branch exists so the copy for it
 *                      is written once rather than improvised later
 *
 * With none of those, the guidance drops to `general` — relationship literacy
 * that helps somebody ask a better question, which is genuinely useful and
 * makes no claim about a person we have never met.
 *
 * `authority` and `basis` travel with every line so the interface can say
 * where it got this, and so nothing derived from a guess is ever presented in
 * the voice reserved for something a person actually said.
 *
 * ── Connected accounts are a future capability, not a dependency ──────────
 *
 * Nothing here requires the other person to have an account. A member writes
 * down what they know, and the guidance works. If that person later joins and
 * deliberately connects, the same subject gains a stronger source — the
 * `shared_by_them` branch below — without any of the recorded history being
 * thrown away or silently re-attributed to them.
 */

import type { CyclePhase, RhythmConfidence } from "./rhythm.js";
import type { RhythmContextKind } from "./rhythmTracking.js";
import type { Readiness, ReadinessRead } from "./recommend.js";

/** Whose behaviour the guidance is about. */
export type Audience = "self" | "relationship";

/** Asked, never inferred. Null is a real answer and selects general guidance. */
export type SubjectSex = "male" | "female" | null;

/**
 * What gives a line the right to be stated, strongest first.
 *
 * This is the authority hierarchy the whole product runs on, narrowed to the
 * relationship layer. Note that `first_party` is only ever available for the
 * member themselves — that asymmetry is the entire point.
 */
export const AUTHORITIES = [
  "first_party",
  "shared_by_them",
  "entered_by_member",
  "estimated",
  "general",
] as const;
export type Authority = (typeof AUTHORITIES)[number];

const AUTHORITY_RANK: Readonly<Record<Authority, number>> = {
  first_party: 0,
  shared_by_them: 1,
  entered_by_member: 2,
  estimated: 3,
  general: 4,
};

export type RelationalGuidance = {
  audience: Audience;
  /** The practical consequence. Always first, always plain. */
  title: string;
  /** One sentence on why. Hedged wherever the source is not first-party. */
  detail: string;
  goodMove: string;
  /** A question rather than an assumption. */
  worthAsking: string;
  /** The wrong conclusion this guidance is most likely to invite. */
  dontAssume: string;
  /** The deeper explanation, shown only if somebody taps for it. */
  physiology: string | null;
  authority: Authority;
  /** Named on the card: "Based on what you told us", "Estimated from dates you entered". */
  basis: string;
};

const BASIS: Readonly<Record<Authority, string>> = {
  first_party: "From your own data",
  shared_by_them: "Shared by them",
  entered_by_member: "Based on context you added",
  estimated: "Estimated from dates you entered",
  general: "General guidance",
};

// ─── What kind of week they're having ──────────────────────────────────────

/**
 * Guidance for a context the member entered about somebody else.
 *
 * Written to be true of a person under that load regardless of sex, because
 * that is where the honest difference actually is: a hard work week is a hard
 * work week. The sex-specific knowledge in this product is physiological — the
 * cycle — and it lives in its own branch below rather than being smeared
 * across these as personality claims about men and women.
 *
 * Every `detail` refers back to what the member told us, in those words, so
 * the card can never be mistaken for something the app worked out on its own.
 */
const CONTEXT_GUIDANCE: Readonly<
  Record<RhythmContextKind, Omit<RelationalGuidance, "audience" | "authority" | "basis">>
> = {
  work_stress: {
    title: "Keep tonight low-friction",
    detail: "You mentioned they're under heavier work pressure at the moment.",
    goodMove: "Take one decision off them rather than adding a plan they have to respond to.",
    worthAsking: "Do you want food, quiet, or company?",
    dontAssume:
      "Quiet under pressure usually means depleted, not distant. Reading it as distance is how a hard week becomes an argument.",
    physiology:
      "Sustained mental load keeps the stress response partly switched on through the evening. Appetite, patience and sleep onset are the first things it costs.",
  },
  short_sleep: {
    title: "Expect a shorter fuse, including yours",
    detail: "You mentioned they slept badly.",
    goodMove: "Make the evening simple and early. Don't save a difficult conversation for tonight.",
    worthAsking: "Do you want to make it an early one?",
    dontAssume: "One bad night is a bad night. It isn't a mood, and it isn't about you.",
    physiology:
      "A single short night measurably reduces emotional regulation and raises reactivity the following evening. It resolves with one good night's sleep.",
  },
  training_hard: {
    title: "Give them some runway",
    detail: "You mentioned they've been training hard.",
    goodMove: "Food and an early night do more here than anything else you could offer.",
    worthAsking: "Do you want to eat properly tonight?",
    dontAssume: "Low energy after a hard block is recovery working, not something being wrong.",
    physiology:
      "Heavy training keeps resting heart rate up and appetite unpredictable for a day or two afterwards. Being flat is the repair, not a setback.",
  },
  travel: {
    title: "Let the day land before you plan anything",
    detail: "You mentioned they're travelling or just back.",
    goodMove: "Keep the first evening back unscheduled.",
    worthAsking: "Do you want to do anything, or just be home?",
    dontAssume: "Wanting nothing on the first evening back isn't a lack of interest.",
    physiology:
      "Sleep timing takes roughly a day per hour of time difference to resettle, and appetite lags behind that.",
  },
  illness: {
    title: "Take things off the list, don't add to it",
    detail: "You mentioned they're unwell.",
    goodMove: "Handle the practical things without being asked, and don't make it a project.",
    worthAsking: "What would actually help right now?",
    dontAssume: "Being looked after and being fussed over aren't the same thing to everyone.",
    physiology: null,
  },
  big_event: {
    title: "Protect the run-up, not just the day",
    detail: "You mentioned they've got something big coming.",
    goodMove: "Reduce what else is on them this week rather than offering encouragement.",
    worthAsking: "What's the one thing I could take off you this week?",
    dontAssume: "Pre-event quiet is usually focus. It rarely needs fixing.",
    physiology: null,
  },
  wants_space: {
    title: "Give it, and say you're around",
    detail: "You mentioned they've asked for some space.",
    goodMove: "Take it at face value once, and say plainly that you're there when they want you.",
    worthAsking: "Do you want me to leave you to it tonight?",
    dontAssume:
      "Asking for space is usually about capacity, not about the relationship. Testing whether they meant it is the thing that makes it about the relationship.",
    physiology: null,
  },
};

// ─── The cycle, for somebody supporting her ────────────────────────────────

/**
 * The one place a specific claim about another person is derivable.
 *
 * A period start the member entered plus a count of days gives an estimate,
 * which is why this feature can be dynamic for a female partner without her
 * having an account — and why there is no equivalent for anybody else. There
 * is no honest way to derive "he's had a hard week at work" from nothing, so
 * this file does not pretend there is.
 *
 * Everything here is hedged twice over: the estimate is labelled as estimated,
 * and the copy offers an action and a question rather than a prediction about
 * how she feels. See PARTNER_GUIDE in rhythm.ts for the same rule stated at
 * the level of the phase.
 */
const CYCLE_PARTNER_GUIDANCE: Readonly<
  Record<CyclePhase, Omit<RelationalGuidance, "audience" | "authority" | "basis">>
> = {
  menstrual: {
    title: "Make today easier, without making it a thing",
    detail:
      "By the dates you entered, her period is likely started. Some women want a much lower-output day here; plenty carry on as normal.",
    goodMove: "Take one thing off her plate. Warmth, food and an early night are the reliable ones.",
    worthAsking: "What would make today easier?",
    dontAssume:
      "How much this affects someone varies enormously. Treating it as automatically a bad day is its own kind of wrong.",
    physiology:
      "Both main hormones are at their lowest at the start of a cycle, and cramping is caused by the uterus contracting. Iron loss over the days of a period is real and is part of why energy can drop.",
  },
  follicular: {
    title: "Good week to suggest something",
    detail: "By the dates you entered, she's in the stretch after her period.",
    goodMove: "This is usually the easiest week to plan something active or social into.",
    worthAsking: "What sounds good this week?",
    dontAssume: "Rising energy is a tendency, not a schedule. Ask before you book anything.",
    physiology:
      "Oestrogen climbs through this stretch toward ovulation, and training tolerance and mood tend to climb with it.",
  },
  ovulatory: {
    title: "Make the time, don't predict the mood",
    detail:
      "By the dates you entered, she's around the middle of her cycle. This is the least certain estimate in the whole model.",
    goodMove: "Treat it as a prompt to make time together rather than a forecast.",
    worthAsking: "What do you feel like doing together?",
    dontAssume:
      "Ovulation timing is genuinely hard to pin down from dates alone, and nothing here is fertility guidance.",
    physiology: null,
  },
  luteal: {
    title: "Keep tonight uncomplicated",
    detail:
      "By the dates you entered, she's in the stretch before her next period. Energy, appetite and bandwidth can shift as it goes on — more often late than early.",
    goodMove:
      "Handle something practical without being asked. Adding another plan usually lands worse than removing one.",
    worthAsking: "Do you want help, listening, company, or space?",
    dontAssume:
      "\"She's premenstrual\" as an explanation for a disagreement is the fastest way to make this feature something she resents. If she's annoyed, she may simply be right.",
    physiology:
      "Progesterone rises after ovulation and falls sharply if there's no pregnancy. It raises core temperature slightly, which is why sleep can get worse, and appetite commonly rises with it.",
  },
};

// ─── Selection ─────────────────────────────────────────────────────────────

export type RelationshipInput = {
  subjectSex: SubjectSex;
  /** Fresh entered contexts, most recent first. Stale ones must be dropped first. */
  contexts?: readonly RhythmContextKind[];
  /** Only meaningful for a female subject, and only when it was estimable. */
  phase?: CyclePhase | null;
  phaseConfidence?: RhythmConfidence;
  /** Reserved for connected accounts — no caller can set this yet. */
  sharedByThem?: readonly RhythmContextKind[];
};

/**
 * What to say about somebody else, in order of how much we actually know.
 *
 * At most two cards. Three is a briefing about a person, which is a different
 * and much creepier product than a nudge about tonight.
 *
 * The order is the authority hierarchy: what they said themselves, then what
 * the member wrote down, then what was counted from dates, then education. A
 * lower source can add to a card and can never displace a higher one.
 */
export function relationshipGuidance(input: RelationshipInput): RelationalGuidance[] {
  const { subjectSex, contexts = [], phase, phaseConfidence, sharedByThem = [] } = input;
  const out: RelationalGuidance[] = [];

  // Strongest: they said so themselves. Unreachable until accounts connect,
  // and written now so the copy is not improvised on the day it becomes so.
  for (const kind of sharedByThem.slice(0, 1)) {
    const g = CONTEXT_GUIDANCE[kind];
    if (!g) continue;
    out.push({
      ...g,
      audience: "relationship",
      detail: g.detail.replace(/^You mentioned they're/, "They've shared that they're")
        .replace(/^You mentioned they/, "They've shared that they"),
      authority: "shared_by_them",
      basis: BASIS.shared_by_them,
    });
  }

  // Then what the member wrote down. One only — the most recent.
  for (const kind of contexts.slice(0, 1)) {
    const g = CONTEXT_GUIDANCE[kind];
    if (!g || out.length >= 2) continue;
    out.push({ ...g, audience: "relationship", authority: "entered_by_member", basis: BASIS.entered_by_member });
  }

  /**
   * Then the cycle — female subjects only, and never on an uncertain estimate.
   *
   * The sex check is not squeamishness about which bodies have cycles. It is
   * that `subjectSex` is the only thing in the model that was *asked*, and
   * showing cycle guidance to somebody about their husband because the app
   * guessed is the exact failure the explicit-inputs rule exists to prevent.
   */
  if (subjectSex === "female" && phase && phaseConfidence && phaseConfidence !== "uncertain" && out.length < 2) {
    const g = CYCLE_PARTNER_GUIDANCE[phase];
    if (g) {
      // Her own statement, relayed by him, is still not first-party to us —
      // but it is stronger than a count, and the copy says so.
      const confirmed = phaseConfidence === "confirmed";
      out.push({
        ...g,
        audience: "relationship",
        detail: confirmed ? g.detail.replace(/^By the dates you entered, /, "") : g.detail,
        authority: confirmed ? "entered_by_member" : "estimated",
        basis: confirmed ? BASIS.entered_by_member : BASIS.estimated,
      });
    }
  }

  // And if we know nothing, say something useful that claims nothing.
  if (!out.length) out.push(generalRelationshipGuidance());

  return out.sort((a, b) => AUTHORITY_RANK[a.authority] - AUTHORITY_RANK[b.authority]);
}

/**
 * The zero-data card.
 *
 * Deliberately good rather than a placeholder. Most members will sit here for
 * a long time, and "we don't know anything about them" is not a reason to show
 * an empty box — asking a better question is a real skill and this is the one
 * piece of relationship advice that is true of everybody.
 */
export function generalRelationshipGuidance(): RelationalGuidance {
  return {
    audience: "relationship",
    title: "Check instead of guessing",
    detail:
      "Sakred doesn't know anything about their day — it only knows what you tell it. That makes asking better than assuming.",
    goodMove: "Ask one specific question instead of \"are you okay\", which is easy to deflect.",
    worthAsking: "Do you want food, quiet, company, or a hand with something?",
    dontAssume: "Quiet is not the same as annoyed, and neither of those is the same as about you.",
    physiology: null,
    authority: "general",
    basis: BASIS.general,
  };
}

// ─── The other direction: how you're showing up ────────────────────────────

/**
 * The member's own terrain, translated into how it lands on other people.
 *
 * This one is legitimate at full strength, because it is built entirely from
 * their own measured data — the asymmetry that runs through this whole file.
 * Sakred can interpret the person whose data it holds; for everybody else it
 * can only relay what has been entered or shared.
 *
 * Returns null on a steady day with nothing to say. A card that appears every
 * morning telling somebody to communicate better is a nag.
 */
export function selfRelationalNote(
  read: ReadinessRead,
  options: { phase?: CyclePhase | null; phaseConfidence?: RhythmConfidence } = {},
): RelationalGuidance | null {
  // No signals, no claim. The same rule the readiness copy follows.
  if (read.confidence === "none") return null;

  const { phase, phaseConfidence } = options;
  const cycleAdds =
    phase === "luteal" || phase === "menstrual"
      ? phaseConfidence && phaseConfidence !== "uncertain"
      : false;

  if (read.level === "depleted") {
    return {
      audience: "self",
      title: "You're running low on bandwidth",
      detail: cycleAdds
        ? "Your own numbers are down, and this part of your cycle is often where that lands hardest."
        : "Your own numbers are down today, and that tends to show up in how you are with people before you notice it yourself.",
      goodMove:
        "Eat, decompress, and say out loud that you're cooked — rather than going quiet and letting somebody else work out why.",
      worthAsking: "What do I actually need tonight, and have I said it?",
      dontAssume:
        "Depletion is not a licence, and it isn't the other person's fault. It is worth naming precisely so it doesn't get expressed sideways.",
      physiology: null,
      // Their own measurements. The strongest thing in the model.
      authority: "first_party",
      basis: BASIS.first_party,
    };
  }

  if (read.level === "primed") {
    return {
      audience: "self",
      title: "You've got some to give today",
      detail: "You're reading well-recovered, which is worth spending on somebody as well as on training.",
      goodMove: "Do the thing you've been meaning to do for someone. It costs you least on a day like this.",
      worthAsking: "Who's had a harder week than me?",
      dontAssume: "Feeling good yourself says nothing about how anybody else's day is going.",
      physiology: null,
      authority: "first_party",
      basis: BASIS.first_party,
    };
  }

  return null;
}

/** For a card header: "Emma", or a fallback that names the relationship. */
export function subjectName(label: string | null | undefined, relation: string): string {
  const trimmed = label?.trim();
  if (trimmed) return trimmed;
  return relation === "self" ? "You" : "Them";
}

/** The strongest authority in a set — what a card's badge should show. */
export function strongestAuthority(items: readonly RelationalGuidance[]): Authority | null {
  if (!items.length) return null;
  return items.reduce((best, g) => (AUTHORITY_RANK[g.authority] < AUTHORITY_RANK[best] ? g.authority : best), items[0].authority);
}

const READINESS_ORDER: Readonly<Record<Readiness, number>> = { depleted: 0, steady: 1, primed: 2 };
/** Exported so a caller can sort reads without restating the order. */
export function readinessRank(level: Readiness): number {
  return READINESS_ORDER[level];
}
