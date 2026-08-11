/**
 * What a habit does to the body — as distinct from which way it runs.
 *
 * ── Why this is not `emphasis` ────────────────────────────────────────────
 *
 * Emphasis is Yin or Yang: the half of a member's life a thing belongs to, and
 * the language they see. Load class is physiological role: what it costs and
 * what it gives back. They correlate and they are not the same column, and
 * collapsing them is how a model ends up believing a sauna is restful.
 *
 * Heavy squats are Yang and `building`. A cold plunge is Yang and an
 * `adaptive-stressor`. Magnesium is Yin and `supportive`. A late night out is
 * neither Yin nor Yang and is squarely `depleting`. Two axes, because the
 * catalogue has items in every quadrant.
 *
 * ── One primary, plus tags ────────────────────────────────────────────────
 *
 * Hard strength training is genuinely both `building` and an
 * `adaptive-stressor`, and the tempting fix is a text column holding
 * "building,adaptive-stressor" — which no query can filter on, no constraint
 * can validate, and one typo turns into a category nothing matches.
 *
 * So: one primary class, constrained; plus a `loadTags` array for the other
 * true things about it. The primary answers "what is this for", the tags
 * answer "what else does it do". A future engine reading "this member's week
 * already has four adaptive stressors and their sleep is down" needs the tags;
 * a member's card needs the primary.
 */

export const LOAD_CLASSES = [
  "restorative",
  "supportive",
  "building",
  "adaptive-stressor",
  "depleting",
  "neutral",
] as const;
export type LoadClass = (typeof LOAD_CLASSES)[number];

export const LOAD_CLASS_META: Readonly<
  Record<LoadClass, { label: string; blurb: string; costs: number; gives: number }>
> = {
  restorative: {
    label: "Restorative",
    blurb: "Gives capacity back. Sleep, downshifting, gentle movement.",
    costs: 0,
    gives: 3,
  },
  supportive: {
    label: "Supportive",
    blurb: "Helps the body do its own work. Minerals, hydration, light.",
    costs: 0,
    gives: 2,
  },
  building: {
    label: "Building",
    blurb: "Asks for capacity in order to make more of it. Strength, protein.",
    costs: 2,
    gives: 1,
  },
  "adaptive-stressor": {
    label: "Adaptive stressor",
    blurb: "A deliberate stress you recover from. Heat, cold, fasting, intervals.",
    costs: 3,
    gives: 1,
  },
  depleting: {
    label: "Depleting",
    blurb: "Takes and returns nothing. Named so it can be seen, not prescribed.",
    costs: 3,
    gives: 0,
  },
  neutral: {
    label: "Neutral",
    blurb: "Carries no physiological load either way.",
    costs: 0,
    gives: 0,
  },
};

export function isLoadClass(v: unknown): v is LoadClass {
  return typeof v === "string" && (LOAD_CLASSES as readonly string[]).includes(v);
}

export function loadClassMeta(v: string | null | undefined) {
  return isLoadClass(v) ? LOAD_CLASS_META[v] : LOAD_CLASS_META.neutral;
}

/**
 * How much stress a day's worth of habits is carrying.
 *
 * Not a score shown to anybody — a number the reasoning layer uses to notice
 * "four stressors and sleep is down" before it suggests a fifth. The moment
 * this reaches a screen it becomes a character sheet, which is the thing this
 * product is deliberately not.
 */
export function stressLoadOf(classes: readonly (string | null | undefined)[]): number {
  return classes.reduce<number>((t, c) => t + loadClassMeta(c).costs, 0);
}

export function restorationOf(classes: readonly (string | null | undefined)[]): number {
  return classes.reduce<number>((t, c) => t + loadClassMeta(c).gives, 0);
}

// ─── Priority ──────────────────────────────────────────────────────────────

/**
 * What order things are worth doing in.
 *
 * A member who sleeps five hours does not need a cold plunge, and a catalogue
 * with no way to say so will happily recommend one. Foundational items are the
 * ones everything else assumes; advanced items are the ones that only pay off
 * once the foundation holds.
 */
export const PRIORITY_LEVELS = ["foundational", "supportive", "advanced"] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

// ─── Relationships ─────────────────────────────────────────────────────────

/**
 * How two habits relate.
 *
 * The recommendation engine is not being built today. The ability to *express*
 * these is, because a 200-row catalogue with no way to say "this needs that
 * first" is a searchable library, and the thing we are building is supposed to
 * reason. Adding the vocabulary later means revisiting 200 rows by hand.
 *
 *   requires      don't offer this until that one is established
 *   conflicts     these two together are a bad week — extended fasting and a
 *                 heavy strength block, two stressors competing for the same
 *                 recovery
 *   pairs         these are better together — creatine and resistance work
 *   replaces      this is the same job done another way; don't run both
 *   increases     doing this raises the need for that — sauna and electrolytes
 */
export const HABIT_RELATIONS = [
  "requires",
  "conflicts",
  "pairs",
  "replaces",
  "increases",
] as const;
export type HabitRelation = (typeof HABIT_RELATIONS)[number];

export const RELATION_LABEL: Readonly<Record<HabitRelation, string>> = {
  requires: "Needs first",
  conflicts: "Don't run together",
  pairs: "Better together",
  replaces: "Another way to do the same thing",
  increases: "Raises the need for",
};

/**
 * Which terrain reading a habit suits.
 *
 * Not a filter the member sees — an input for the day something suggests
 * rather than lists. A member whose terrain leans restore should not be handed
 * an adaptive stressor because it happened to be next in the catalogue.
 */
export const TERRAIN_FITS = ["restore", "build", "either"] as const;
export type TerrainFit = (typeof TERRAIN_FITS)[number];
