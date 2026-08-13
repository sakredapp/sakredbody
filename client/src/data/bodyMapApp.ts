/**
 * The Body Map, as the app teaches it.
 *
 * The website's version of this file explains the philosophy to a stranger.
 * This one is for somebody who is already inside, already tracking, and wants
 * to know what to notice in their own body today. Same seven territories — the
 * canon in shared/models/bodyMap.ts — different job, different length.
 *
 * They are separate on purpose. When the app read the website's content object
 * directly, a copy edit on a marketing page changed what a member's health
 * screen said about their body, with no review and no test in between.
 *
 * ── The rule this file is written under ──────────────────────────────────
 *
 * A tradition and a measurement are two sentences, never one. `traditional` is
 * what a lineage observed and the words it used; `modern` is what can be shown.
 * Merging them is how a long, careful tradition gets turned into a modern claim
 * it never made — and this screen is read without a coach in the room.
 *
 * ── And `signals` is relevance, not measurement ──────────────────────────
 *
 * These are the canonical check-in signals whose answers plausibly *relate* to
 * this territory. Not signals that measure it. Nothing in Sakred measures Flow.
 * The screen labels the section "Related today" for that reason, and must never
 * render anything of the shape "Your Flow: 2/5".
 */

import type { BodyRegionKey } from "@shared/models/bodyMap";
import type { TerrainSignalId } from "@shared/models/terrainSignals";

export interface AppRegion {
  /** The anatomy, so the concept lands somewhere on a body. */
  covers: string;
  /** What it does, in one line. */
  governs: string;
  /**
   * What a person might notice there, in their own words.
   *
   * The point of the screen. Body literacy is learning to perceive and name a
   * signal, not to assign a state to a centre — somebody who can say "I
   * couldn't take a full breath today" has learned something a five-point
   * scale cannot hold. Deliberately ordinary phrasing: what you would say to a
   * friend, not to a practitioner.
   *
   * Pleasant and neutral entries are included on purpose. A list made only of
   * complaints teaches people to scan themselves for what is wrong.
   */
  notice: string[];
  /** Canonical signals that relate to this territory. Editorial, not measured. */
  signals: TerrainSignalId[];
  /** One sentence on what traditions observed here. */
  traditional: string;
  /** One sentence on what can actually be shown. Kept apart from the above. */
  modern: string;
  /** Where it turns into something to do. */
  practice: string[];
}

export const APP_REGIONS: Record<BodyRegionKey, AppRegion> = {
  crown: {
    covers: "Brain · attention · perception · state",
    governs: "Attention, clarity, and the state you perceive the day from.",
    notice: [
      "Clear attention",
      "Mental noise",
      "Difficulty choosing",
      "Sensory overload",
      "Feeling mentally flat",
    ],
    signals: ["mentalClarity", "energy"],
    traditional:
      "Contemplative traditions spent centuries on attention itself — what the mind is doing, and what that does to the body underneath it.",
    modern:
      "Morning light sets the circadian clock, and sleep, hormones, digestion and mood all run downstream of it.",
    practice: ["Sleep", "Morning light", "Attention"],
  },
  throat: {
    covers: "Face · jaw · throat · ribcage · diaphragm",
    governs: "How breathing, pressure and state move through you.",
    notice: [
      "Shallow breathing",
      "Jaw or throat tension",
      "Difficulty taking a full breath",
      "Holding your breath without noticing",
      "Ease and expansion",
    ],
    signals: ["nervousSystem", "recovery"],
    traditional:
      "Indian and Chinese breath disciplines treated the breath as the handle on everything involuntary, and built long, specific practices around it.",
    modern:
      "The diaphragm is an internal pump: it moves pressure, circulation and lymph on every cycle, and it is the one autonomic function you can take by hand.",
    practice: ["Breathwork", "Downshift", "Mobility"],
  },
  root: {
    covers: "Spine · posture · nervous system",
    governs: "The line everything hangs from, and the state it sets.",
    notice: [
      "Wired but tired",
      "Settling quickly, or not at all",
      "Standing taller without trying",
      "Bracing through the low back",
      "Startling easily",
    ],
    signals: ["nervousSystem", "bodyTension"],
    traditional:
      "Yogic and contemplative traditions read the spine as more than scaffolding — an axis of posture, breath, attention and state.",
    modern:
      "Repair, digestion and sleep are all downstream of whether the body currently believes it is safe.",
    practice: ["Posture", "Regulation", "Mobility"],
  },
  heart: {
    covers: "Heart · lungs · liver · kidneys",
    governs: "Circulation, filtration, and whether the day's charge settles at night.",
    notice: [
      "Racing or pounding at rest",
      "Waking at the same hour each night",
      "Warmth in the hands and feet",
      "Breath catching on stairs",
      "Settling well in the evening",
    ],
    signals: ["recovery", "energy"],
    traditional:
      "Chinese medicine reads organs relationally — through rhythm and what they do to each other — rather than as parts in isolation.",
    modern:
      "What Sakred records here is narrower and checkable: heart-rate variability, resting heart rate, and sleep.",
    practice: ["HRV", "Resting heart rate", "The downshift"],
  },
  gut: {
    covers: "Gut · digestion · microbiome · absorption",
    governs: "Digestion, absorption, and the internal environment around the gut.",
    notice: [
      "Appetite",
      "Bloating",
      "Heaviness after eating",
      "Bowel rhythm",
      "Digestive ease",
      "Cravings",
    ],
    signals: ["digestion"],
    traditional:
      "Agni in Ayurveda, spleen and stomach in Chinese medicine, bitters and fermentation in Europe — four vocabularies, one recurring observation.",
    modern:
      "Nutrition turns out to be what you absorb rather than what you eat: enzymes, bile, the gut lining and the microbiome are where it gets specific.",
    practice: ["Digestion", "Drainage", "Food"],
  },
  legs: {
    covers: "Blood · lymph · hydration · fluids",
    governs: "Drainage and transport. It moves when you move, and stalls when you don't.",
    notice: [
      "Puffiness or swelling",
      "Heaviness in the legs",
      "Stiffness after sitting",
      "Cold hands and feet",
      "Feeling lighter after moving",
    ],
    signals: ["bodyTension"],
    traditional:
      "Traditions that never used the word lymph arrived at the practice anyway — daily walking, standing forms, sweat, cold water, time on the ground.",
    modern:
      "The lymphatic system has no pump of its own. It moves on muscle contraction and breath, which makes sitting still a drainage problem before it is a fitness one.",
    practice: ["Movement", "Lymph", "Minerals"],
  },
  arms: {
    covers: "Fascia · joints · muscle · bone · force",
    governs: "What carries load, and what happens when nothing asks it to.",
    notice: [
      "Strength you can call on",
      "Aching a day or two after effort",
      "Joints that need longer to warm up",
      "Grip giving out first",
      "Moving without thinking about it",
    ],
    signals: ["bodyTension", "drive"],
    traditional:
      "Every culture that carried, built or fought developed a strength practice, and treated capacity as something owed to the body rather than displayed by it.",
    modern:
      "Muscle decides glucose handling and bone density, and fascia is the continuity — tension in one place is rarely a local event.",
    practice: ["Strength", "Fascia", "Structure"],
  },
};
