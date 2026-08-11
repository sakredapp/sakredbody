/**
 * The spine of the whole site: two directions and the room they happen in.
 *
 * It's a sequence, not a menu — you can't load a body that can't yet drain.
 *
 * ── Why there are three and not four ──────────────────────────────────────
 *
 * There was a fourth, Embody, sitting between Restore and Build with the
 * force "Where the two forces meet". That is the one entry that was never a
 * force at all: it described the *relationship* between the other two, which
 * makes it a bad sibling and a good idea. Listed alongside them it asked a
 * visitor to hold four categories when the actual model has two directions
 * and the judgement of which one you currently need.
 *
 * So the relationship keeps its name — balance — and moves to the pages whose
 * job is teaching it: /the-terrain explains why either direction can be right
 * or wrong depending on state, and /body-literacy teaches you to tell which
 * one you're in. Embody's own material went to Body Literacy rather than to
 * the bin; see EMBODIED_PRACTICE below.
 */

export interface Territory {
  key: string;
  name: string;
  href: string;
  /** One-word imperative used in the four-beat summary. */
  verb: string;
  force: string;
  color: string;
  promise: string;
  body: string;
  domains: string[];
}

export const TERRITORIES: Territory[] = [
  {
    key: "restore",
    name: "Restore",
    href: "/restore",
    verb: "Clear the terrain.",
    force: "Yin — the receding force",
    color: "var(--element-wood)",
    promise: "Reduce what obstructs the organism, and rebuild the conditions under which it works well.",
    body: "Healing is not endlessly adding things. Most people are carrying a load they've never put down — poor drainage, a gut that can't extract, a nervous system that never downshifts. Restoration begins by removing what's in the way.",
    domains: [
      "Digestion and gut function",
      "Liver and bile flow",
      "Drainage, lymph, fascia",
      "Hydration and minerals",
      "Sleep and circadian rhythm",
      "Nervous-system regulation",
      "Food quality",
      "Cleansing and resets",
    ],
  },
  {
    key: "build",
    name: "Build",
    href: "/build",
    verb: "Build its capacity.",
    force: "Yang — the advancing force",
    color: "var(--element-water)",
    promise: "Once the terrain can receive demand, give it demand worth adapting to.",
    body: "Health should eventually become capacity. Not a body that merely avoids illness — a body that can carry weight, produce force, move through space, withstand adversity, recover quickly, and serve the life inside it.",
    domains: [
      "Strength and muscle",
      "Cardiovascular capacity",
      "Mobility and athleticism",
      "Work capacity and posture",
      "Breathing mechanics",
      "Heat, cold, hormetic stress",
      "Energy production",
      "Nutrition for performance",
    ],
  },
  {
    key: "gather",
    name: "Gather",
    href: "/retreats",
    verb: "Put it in an environment that holds.",
    force: "The social terrain",
    color: "var(--element-fire)",
    promise: "The terrain isn't only biological. Who you're around is an input like any other.",
    body: "You are affected by the conversations that surround you, the standards your people hold, whether your life contains real challenge, and whether you ever spend uninterrupted days in nature. Retreats and the mastermind are the social expression of the same philosophy.",
    domains: [
      "Small-group masterminds",
      "Retreats somewhere quiet",
      "Uninterrupted time in nature",
      "Shared standards",
      "Real challenge",
      "Time away from stimulation",
      "People actually building something",
      "Accountability without pressure",
    ],
  },
];

/**
 * What Embody used to carry, rehoused.
 *
 * Embodiment is the outcome of living the system, not a fourth thing to buy
 * into — so this is no longer a destination in the nav. The material itself
 * was never the problem, and Body Literacy is where it belongs: that page's
 * job is teaching somebody to read their own state and pick a direction, and
 * this is the practice half of exactly that.
 */
export const EMBODIED_PRACTICE = {
  promise: "Information is not enough. Health has to become perception, practice, and relationship.",
  body: "The body you inhabit becomes the life you are capable of living. This is the part almost nobody teaches: attention, standards, rhythm, and the judgment to know when to push and when to yield.",
  domains: [
    "Habits and discipline",
    "Body awareness and literacy",
    "Personal standards",
    "Morning and evening rhythms",
    "Attention and digital hygiene",
    "Environment design",
    "Stress capacity",
    "Seasonal rhythms",
  ],
};

/** Health → Resilience → Capacity → Expression. */
export const CAPACITY_MODEL = [
  { stage: "Health", body: "A functioning base. Systems doing their job without constant intervention." },
  { stage: "Resilience", body: "The ability to absorb disruption — a bad night, a hard week, a missed meal — and return." },
  { stage: "Capacity", body: "Room to handle greater demand than your life currently asks of you." },
  { stage: "Expression", body: "What you actually do with it. Work, build, create, lead, compete, parent, travel, train." },
];

/** The operating loop that applies to health, training, and work alike. */
export const OPERATING_LOOP = [
  { step: "Clear", body: "Remove burden. Restore elimination. Create space for anything else to work." },
  { step: "Nourish", body: "Minerals, water, food, light, sleep, breath. The raw inputs, in adequate amounts." },
  { step: "Challenge", body: "Lift, run, work, think, create, compete. Demand is the signal to adapt." },
  { step: "Recover", body: "Rest, restore, integrate. Adaptation happens here, not during the challenge." },
];
