/**
 * The Apothecary, brought to the member instead of waiting to be found.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * A metric screen that says "Sleep: 6h 04m" and "try to get more sleep" is a
 * wearable. Every platform in this category can already tell somebody they
 * slept badly; none of them can tell them what to *do* about it tonight, drawn
 * from anything deeper than a tip list.
 *
 * Sakred has that depth sitting in the product already — herbal, mineral,
 * breath, environment, nutrition, traditional practice — and it was on a
 * separate tab nobody thinks to open after a bad night. Nobody wakes up
 * wondering whether the Apothecary contains something for sleep. So the
 * intelligence reads the terrain and brings the relevant part of it forward.
 *
 * ── The loop this exists to close ─────────────────────────────────────────
 *
 *   see what happened  →  understand why it matters today  →  see what Sakred
 *   would do about it  →  start it  →  learn the physiology or the tradition
 *
 * A metric is not finished when the number renders. It is finished when a
 * member can act on it.
 *
 * ── Why these are written down and not generated ──────────────────────────
 *
 * A model asked for sleep advice will produce something fluent and unbounded,
 * and the failure mode is a health app inventing a protocol — with a dose, or
 * a claim, or a herb that interacts with somebody's medication. These are
 * curated primitives with explicit conditions and explicit cautions, and the
 * only thing the intelligence does is *choose among them*.
 *
 * ── The rule that makes it safe rather than merely rich ───────────────────
 *
 * `loadClass` is the important field. Sauna, cold exposure and fasting are all
 * genuinely restorative practices and all genuinely stressors, and the failure
 * that matters is recommending one to somebody who is already depleted because
 * it happens to be in the library and sounds healthy. Anything marked
 * `stressor` is withheld when the day is already asking for less. That is
 * enforced in `selectSupport` and asserted in tests, not left to copy.
 *
 * ── The layering rule ─────────────────────────────────────────────────────
 *
 *   action   what to do, in a sentence somebody can follow tonight
 *   why      why it fits *this* reading — practical, present tense
 *   deeper   the physiology and the tradition, for whoever taps
 *
 * Never "according to Ayurveda your Vata is disturbed" as the opening line.
 * The traditions speak to each other underneath; the member gets the useful
 * consequence first and the lineage only if they want it.
 *
 * ── The line this must not cross ──────────────────────────────────────────
 *
 * Named preparations and how they are traditionally used. Never a dose, never
 * a claim to treat or cure, never a substitute for care. "Long used for" is
 * honest. "Will fix your sleep" is a medical claim this app cannot make.
 */

/** What a primitive is trying to support. A primitive may serve several. */
export const SUPPORT_NEEDS = [
  "sleep",
  "nervous_system",
  "recovery",
  "movement",
  "digestion",
  "fuel",
] as const;
export type SupportNeed = (typeof SUPPORT_NEEDS)[number];

/** Which shelf it comes off. Used to spread the offer across kinds. */
export const SUPPORT_TYPES = [
  "herbal",
  "mineral",
  "breath",
  "movement",
  "environment",
  "nutrition",
  "practice",
] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

/**
 * What this asks of a body.
 *
 * `restorative` gives capacity back. `neutral` costs nothing either way.
 * `stressor` is a genuine adaptive load — useful, and exactly what must not be
 * offered to somebody already short. See the note at the top.
 */
export type SupportLoad = "restorative" | "neutral" | "stressor";

/** The states a reading can put somebody in. Primitives declare which they fit. */
export const SUPPORT_CONDITIONS = [
  "low_sleep",
  "trouble_winding_down",
  "low_recovery",
  "high_training_load",
  "low_movement",
  "digestive_heaviness",
  "wired",
] as const;
export type SupportCondition = (typeof SUPPORT_CONDITIONS)[number];

/**
 * How much is actually known, and therefore how strongly we may speak.
 *
 * ── Why this is a field and not a matter of careful writing ───────────────
 *
 * The first version of the sleep tea said "they don't sedate, so they help you
 * fall asleep without costing you the morning" and stated apigenin's action at
 * the benzodiazepine receptor as fact. Both are more confident than what is
 * known: the human evidence for chamomile in insomnia is limited, and the
 * preclinical receptor work is real but not consistent about whether the
 * behavioural effect runs through that pathway at all.
 *
 * Nothing about that requires watering down traditional medicine. It requires
 * separating three different things that are easy to blur:
 *
 *   traditional   long and specific use, which is a real reason to try
 *                 something and not a claim about mechanism
 *   mechanistic   a plausible pathway, usually preclinical
 *   preliminary   some human evidence, mixed or small
 *   established   consistent human evidence
 *
 * Holding it as a field means the constraint is checkable. A test asserts that
 * a `traditional` entry never uses the verbs reserved for `established` ones,
 * so an ancient use cannot quietly become a modern mechanistic fact the next
 * time somebody adds to this library.
 */
export const EVIDENCE_LEVELS = ["traditional", "mechanistic", "preliminary", "established"] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

/**
 * The strongest verb each level is allowed.
 *
 * Given to whoever writes the copy — human or model — as the ceiling on how
 * confident the language may be, rather than as text to print.
 */
export const EVIDENCE_LANGUAGE: Readonly<Record<EvidenceLevel, string>> = {
  traditional: "Long used for — a tradition of use, not a demonstrated effect.",
  mechanistic: "There is a plausible pathway, mostly studied outside people.",
  preliminary: "Some human research suggests it may help; findings are mixed.",
  established: "Consistently shown in people.",
};

export type SupportPrimitive = {
  id: string;
  title: string;
  type: SupportType;
  supportFor: readonly SupportNeed[];
  loadClass: SupportLoad;
  conditions: readonly SupportCondition[];
  /** What to do, tonight, in one followable sentence. */
  action: string;
  /** Why it fits this reading. Practical and present tense. */
  why: string;
  /** Physiology and lineage, for whoever taps. Never the opening line. */
  deeper: string;
  /** Where the practice comes from, named plainly. */
  tradition?: string;
  /** How much is known. Bounds how strongly the copy may be written. */
  evidence: EvidenceLevel;
  /** Who should not, or should ask first. Rendered whenever present. */
  cautions?: string;
};

/**
 * The library.
 *
 * Small on purpose. Every entry earns its place by being something a member
 * could actually do this evening, and the list is meant to grow by addition
 * rather than by an LLM filling gaps.
 */
export const SUPPORT_LIBRARY: readonly SupportPrimitive[] = [
  // ── Sleep ───────────────────────────────────────────────────────────────
  {
    id: "evening_tea",
    title: "Build a sleep tea",
    type: "herbal",
    supportFor: ["sleep", "nervous_system"],
    loadClass: "restorative",
    conditions: ["low_sleep", "trouble_winding_down", "wired"],
    action:
      "Steep chamomile, tulsi or passionflower strong — ten minutes, covered — and drink it an hour before bed rather than at bedtime.",
    why: "All three have long traditions of use for settling the evening. Some people find them useful when the body is tired but the nervous system is still carrying the day.",
    deeper:
      "Chamomile contains apigenin, a flavonoid studied for effects on nervous-system signalling including benzodiazepine-receptor binding — though that work is largely preclinical and not consistent about whether the calming effect runs through that pathway. Human evidence for sleep specifically is limited, so this is a traditional support rather than a sleep aid. Tulsi is Ayurveda's central calming herb; passionflower entered European herbalism for a mind that will not stop turning over. Covering the cup is worth doing either way: the volatile oils leave with the steam.",
    tradition: "Ayurveda and European herbalism",
    evidence: "traditional",
    cautions:
      "Chamomile is in the daisy family — skip it if you react to those. Check with whoever prescribes for you if you take sedatives or blood thinners.",
  },
  {
    id: "magnesium_glycinate",
    title: "Magnesium glycinate",
    type: "mineral",
    supportFor: ["sleep", "nervous_system", "recovery"],
    loadClass: "restorative",
    conditions: ["low_sleep", "trouble_winding_down", "high_training_load"],
    action: "Take it with your evening meal rather than at bedtime.",
    why: "The form is the part worth getting right. Glycinate is better absorbed; oxide is poorly absorbed and mostly reaches the gut.",
    evidence: "preliminary",
    deeper:
      "Magnesium is a cofactor in hundreds of enzymatic reactions and is depleted by both sweat and sustained stress — which is why hard training weeks and stressful ones both tend to show up as worse sleep. Glycine, the carrier, is itself mildly calming and lowers core temperature slightly, which is one of the physiological triggers for sleep onset.",
    cautions: "Ask first if you have kidney disease. Start low if your gut is sensitive.",
  },
  {
    id: "downshift",
    title: "A ten-minute downshift",
    type: "breath",
    supportFor: ["sleep", "nervous_system"],
    loadClass: "restorative",
    conditions: ["low_sleep", "trouble_winding_down", "wired", "low_recovery"],
    action:
      "Lights low, no screen, ten minutes of breathing with the exhale twice as long as the inhale. Then bed.",
    why: "A long exhale is the most direct lever you have on your own nervous system, and it works whether or not you feel like doing it.",
    evidence: "established",
    deeper:
      "Exhaling slows the heart via the vagus nerve — the same mechanism heart-rate variability measures. Pranayama built practices around this centuries before anyone could measure it, and the measurement has since agreed with the practice.",
    tradition: "Pranayama",
  },
  {
    id: "light_and_wake_time",
    title: "Fix tomorrow, not tonight",
    type: "environment",
    supportFor: ["sleep"],
    loadClass: "neutral",
    conditions: ["low_sleep"],
    action:
      "Get outside within an hour of waking, and keep your wake time where it normally is even though you're short.",
    why: "Going to bed earlier after a bad night usually fails. Holding the wake time and getting morning light is what stops one short night becoming a week of them.",
    evidence: "established",
    deeper:
      "Morning light sets the timing of the circadian system for the following night — the effect is on tomorrow, not today. Sleeping in to catch up shifts that timing later and is the most common way a single bad night turns into a drifting pattern.",
  },

  // ── Recovery and load ───────────────────────────────────────────────────
  {
    id: "adaptogens",
    title: "Adaptogens, taken properly",
    type: "herbal",
    supportFor: ["nervous_system", "recovery"],
    loadClass: "restorative",
    conditions: ["low_recovery", "wired", "high_training_load"],
    action: "Ashwagandha or tulsi daily for several weeks — not as a rescue on a bad day.",
    why: "This class does nothing noticeable in a single evening. It is taken across a demanding stretch, not on a bad day.",
    evidence: "preliminary",
    deeper:
      "Ashwagandha is a rasayana in Ayurveda — a class taken over long periods to build resilience rather than to fix a symptom. Trials showing effects on cortisol and perceived stress run for weeks, which matches how it has always been used.",
    tradition: "Ayurveda",
    cautions:
      "Ashwagandha is nightshade family and affects thyroid hormone. Avoid in pregnancy and check first if you have a thyroid condition or take thyroid medication.",
  },
  {
    id: "warm_simple_food",
    title: "Warm, simple food",
    type: "nutrition",
    supportFor: ["digestion", "recovery", "fuel"],
    loadClass: "restorative",
    conditions: ["low_recovery", "digestive_heaviness", "high_training_load"],
    action: "Something cooked, warm and plain tonight. Salt it properly and drink water with it.",
    why: "A body already working on something usually has less to spare for a difficult meal.",
    evidence: "traditional",
    deeper:
      "Both Ayurveda and Chinese medicine regard cooked warm food as easier to extract from than raw or cold — the modern framing is gastric emptying and the energetic cost of digestion. They agree here, which is not always the case.",
    tradition: "Ayurveda and Chinese medicine",
  },
  {
    id: "easy_movement",
    title: "Move easy, not hard",
    type: "movement",
    supportFor: ["recovery", "movement"],
    loadClass: "restorative",
    conditions: ["low_recovery", "high_training_load", "low_sleep"],
    action: "Twenty to forty minutes walking, breathing through your nose the whole way.",
    why: "This clears more than sitting still does, and unlike a session it costs you nothing you'll need tomorrow.",
    evidence: "established",
    deeper:
      "Easy aerobic work moves blood without adding meaningful stress. Nasal breathing keeps the intensity honest — if you have to open your mouth, you have left the range this is for.",
  },

  // ── Movement and digestion ──────────────────────────────────────────────
  {
    id: "walk_after_meal",
    title: "Walk after your largest meal",
    type: "movement",
    supportFor: ["digestion", "movement"],
    loadClass: "restorative",
    conditions: ["low_movement", "digestive_heaviness"],
    action: "Ten to fifteen minutes on your feet after the biggest meal of the day.",
    why: "The same walk does more for you after eating than at any other time.",
    evidence: "established",
    deeper:
      "Contracting muscle takes up glucose without needing insulin, so a short walk blunts the post-meal rise more than a longer one taken hours later. The traditional advice to walk after eating predates the mechanism by a long way.",
  },
  {
    id: "bitters",
    title: "Bitters before eating",
    type: "herbal",
    supportFor: ["digestion"],
    loadClass: "neutral",
    conditions: ["digestive_heaviness"],
    action: "Something bitter — rocket, chicory, a bitter tincture — ten minutes before the meal.",
    why: "Bitterness is traditionally the signal that a meal is coming, and it tends to work best a little before you eat.",
    evidence: "mechanistic",
    deeper:
      "Bitter receptors on the tongue trigger saliva, stomach acid and bile release before food arrives. European herbalism built an entire category around this, and it is one of the clearer cases where the traditional practice and the physiology describe the same thing.",
    tradition: "European herbalism",
    cautions: "Skip if you have reflux or an active ulcer.",
  },
  {
    id: "morning_light_walk",
    title: "Daylight, early",
    type: "environment",
    supportFor: ["movement", "sleep", "nervous_system"],
    loadClass: "restorative",
    conditions: ["low_movement", "low_sleep", "wired"],
    action: "Ten minutes outside within an hour of waking. Overcast still counts.",
    why: "It is the cheapest thing on this list and it moves both today's mood and tonight's sleep.",
    evidence: "established",
    deeper:
      "Outdoor light is many times brighter than indoor lighting even under cloud, and morning exposure is the strongest signal for setting circadian timing.",
  },

  // ── Genuine stressors. Useful, and withheld when the day is short. ──────
  {
    id: "sauna",
    title: "Heat",
    type: "practice",
    supportFor: ["recovery", "nervous_system"],
    loadClass: "stressor",
    conditions: ["high_training_load"],
    action: "Sauna or a long hot bath, finishing at least ninety minutes before bed.",
    why: "Genuinely restorative and genuinely demanding — worth it on a day with room for it.",
    evidence: "preliminary",
    deeper:
      "Heat exposure raises heart rate and fluid loss much as easy cardio does, then triggers a compensatory drop in core temperature afterwards, which is why the timing before bed matters more than the heat itself.",
    cautions: "Hydrate and salt afterwards. Not a good idea on a day you are already wrung out.",
  },
  {
    id: "cold",
    title: "Cold exposure",
    type: "practice",
    supportFor: ["nervous_system"],
    loadClass: "stressor",
    conditions: ["high_training_load"],
    action: "Two or three minutes cold, in the morning rather than the evening.",
    why: "A sharp stimulus that tends to raise alertness for hours. It is a stressor, so it belongs on a day that can carry one.",
    evidence: "mechanistic",
    deeper:
      "Cold drives a large and long-lasting catecholamine rise — which is the point, and also why it is a poor idea at night or on top of accumulated fatigue. Done immediately after lifting it can blunt some of the adaptation you just trained for.",
    cautions: "Not if you have a heart condition. Never alone in open water.",
  },
];

// ── Selection ──────────────────────────────────────────────────────────────

export type SupportRequest = {
  conditions: readonly SupportCondition[];
  /**
   * True when the day is already asking for less.
   *
   * Withholds everything marked `stressor` — the rule that stops a depleted
   * member being offered a cold plunge because it happens to be in the library
   * and sounds healthy. See the note at the top of this file.
   */
  depleted?: boolean;
  /** Ids the member has turned off, or already has in their routine. */
  exclude?: readonly string[];
  limit?: number;
};

/**
 * The right tools for this state, spread across kinds.
 *
 * Spread rather than ranked: three herbal suggestions is a shop, and the point
 * is that a member sees genuinely different *classes* of answer — something to
 * drink, something to take, something to do. So the first pass takes the best
 * of each type before any type gets a second slot.
 */
export function selectSupport(req: SupportRequest): SupportPrimitive[] {
  const { conditions, depleted = false, exclude = [], limit = 3 } = req;
  if (!conditions.length) return [];

  const excluded = new Set(exclude);
  const wanted = new Set(conditions);

  const matches = SUPPORT_LIBRARY.filter((p) => {
    if (excluded.has(p.id)) return false;
    // Never add an adaptive stressor to a body that is already short.
    if (depleted && p.loadClass === "stressor") return false;
    return p.conditions.some((c) => wanted.has(c));
  });

  // How many of the asked-for conditions each one answers. A primitive that
  // covers both the bad night and the wired evening is the better offer.
  const score = (p: SupportPrimitive) => p.conditions.filter((c) => wanted.has(c)).length;
  const ranked = [...matches].sort((a, b) => score(b) - score(a));

  const chosen: SupportPrimitive[] = [];
  const usedTypes = new Set<SupportType>();

  for (const p of ranked) {
    if (chosen.length >= limit) break;
    if (usedTypes.has(p.type)) continue;
    chosen.push(p);
    usedTypes.add(p.type);
  }
  // Then backfill, if spreading left us short.
  for (const p of ranked) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(p)) chosen.push(p);
  }

  return chosen;
}

/**
 * What state a set of readings puts somebody in.
 *
 * Kept here so the metric screen, the day's read and anything later all derive
 * conditions the same way rather than each inventing thresholds.
 */
export function conditionsFrom(input: {
  sleepDeficit?: number | null;
  recoveryDown?: boolean;
  hardSessionsRecently?: number;
  stepsDeficit?: number | null;
  nervousSystem?: number | null;
}): SupportCondition[] {
  const out: SupportCondition[] = [];
  if (input.sleepDeficit != null && input.sleepDeficit >= 45) out.push("low_sleep");
  if (input.recoveryDown) out.push("low_recovery");
  if ((input.hardSessionsRecently ?? 0) >= 3) out.push("high_training_load");
  if (input.stepsDeficit != null && input.stepsDeficit >= 2000) out.push("low_movement");
  if (input.nervousSystem != null && input.nervousSystem <= 2) {
    out.push("wired", "trouble_winding_down");
  }
  return out;
}
