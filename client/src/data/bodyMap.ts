/**
 * The Body Map — what each region governs, and who taught us to read it.
 *
 * ── The content layer is not the animation layer ──────────────────────────
 *
 * `key` matches a region in ConstellationBody, and that is the only thing the
 * two share. The canvas regions are named crown / throat / heart / gut / root /
 * arms / legs because that is where the stars are; those names describe
 * geometry, and they were never meant to become the taxonomy of the worldview.
 * `BODY_REGIONS.name` and `.reads` are dead metadata — nothing renders them —
 * so the vocabulary a visitor actually reads is defined here, and is free to
 * be the conceptual model rather than the anatomical one.
 *
 * Frame and Build are one region rather than two. The figure has a single
 * limb region and splitting it would mean two entries lighting the same stars,
 * with no way for a pointer to choose between them.
 *
 * ── The rule this file is written under ───────────────────────────────────
 *
 * A tradition and a measurement are kept as two separate sentences, always.
 * `lens` is what a tradition observed and the language it used. `measured` is
 * what an instrument can show. They are never merged into one confident
 * claim — the merge is what turns a long, useful tradition into a modern
 * assertion it never made, and this page is public with no coach in the room
 * to put the distinction back.
 *
 * That constraint comes from two places. docs/VISION.md sets the filter for
 * what may be said without a coach present, and shared/models/apothecary.ts
 * already enforces the same separation in code, with a test asserting that a
 * traditional entry never borrows the verbs reserved for a demonstrated one.
 * This is the marketing-side version of that rule.
 */

export interface MapRegion {
  /** Matches a BODY_REGIONS key in ConstellationBody. Geometry, not taxonomy. */
  key: string;
  name: string;
  /**
   * One word, for the selector under the figure.
   *
   * The full name is the panel's job. Seven of "Structure & Strength" wrapped
   * across a phone is a paragraph of controls, and the row exists to hand over
   * the vocabulary at a glance — Mind · Breath · Axis · Organs · Middle · Flow
   * · Structure — not to restate the headings.
   */
  short: string;
  /** The anatomy this region covers, so the concept lands on a body part. */
  covers: string;
  /** What it governs, in one line. */
  governs: string;
  /**
   * The traditions that studied it, named rather than blended.
   *
   * Two lists, not one string. A single line reading "Pranayama · Qi Gong ·
   * respiratory physiology" quietly implies those are the same kind of claim,
   * and the whole discipline of this file is that they are not. Kept plural
   * per region on purpose: this page shows convergence, never ownership —
   * nobody gets assigned a body part, and the regions where four traditions
   * arrived at the same observation are the interesting ones.
   */
  traditional: string[];
  modern: string[];
  /** What those traditions observed, in their own terms. */
  lens: string;
  /** What can be measured — kept deliberately apart from `lens`. */
  measured: string;
  /** Where it turns into practice. Becomes Library links later. */
  practice: string[];
}

export const MAP_REGIONS: MapRegion[] = [
  {
    key: "crown",
    name: "Mind & Awareness",
    short: "Mind",
    covers: "Brain · attention · perception · state",
    governs: "Light, sleep, and the clock everything downstream runs on.",
    traditional: ["Contemplative and meditative systems", "Yoga", "Vedic and Buddhist attention practice"],
    modern: ["Chronobiology", "Circadian science", "Sleep research"],
    lens:
      "Contemplative traditions spent centuries on attention itself — what the mind is doing, and what that does to the body underneath it.",
    measured:
      "Chronobiology reached the same lever from the other side: morning light sets the circadian clock, and sleep, hormones, digestion and mood are all downstream of it.",
    practice: ["Sleep", "Morning light", "Attention"],
  },
  {
    key: "throat",
    name: "Breath & Pressure",
    short: "Breath",
    covers: "Face · jaw · throat · ribcage · diaphragm",
    governs: "The switch between states — the one autonomic function you can take by hand.",
    traditional: ["Pranayama", "Qi Gong", "Traditional breath disciplines"],
    modern: ["Respiratory physiology", "Diaphragm mechanics", "Autonomic regulation"],
    lens:
      "Indian and Chinese breath disciplines treated the breath as the handle on everything involuntary, and built long, specific practices around it.",
    measured:
      "Two different things sit here. The face, jaw and throat are the upper airway and where tension is held; the diaphragm is the actual engine — an internal pump moving pressure, circulation and lymph on every cycle.",
    practice: ["Breathwork", "Nervous system", "Airway"],
  },
  {
    key: "root",
    name: "The Central Axis",
    short: "Axis",
    covers: "Spine · posture · nervous system",
    governs: "The line everything else hangs from, and the state it sets.",
    traditional: ["Yoga", "Kundalini and energetic anatomy", "Daoist spinal practice"],
    modern: ["Biomechanics", "Nervous-system physiology", "Osteopathic and fascial thinking"],
    lens:
      "Indian movement and contemplative traditions read the spine as more than scaffolding: an axis of posture, breath, attention and state.",
    measured:
      "Modern work describes a spine, a nervous system and a continuous fascial line doing much of the same job. Repair, digestion and sleep are all downstream of whether the body believes it is safe.",
    practice: ["Posture", "Regulation", "Mobility"],
  },
  {
    key: "heart",
    name: "The Organ Network",
    short: "Organs",
    covers: "Heart · lungs · liver · kidneys",
    governs: "Circulation, filtration, and whether the day's charge settles at night.",
    traditional: ["Traditional Chinese Medicine", "Daoist organ theory", "Ayurvedic organ relationships"],
    modern: ["Heart-rate variability", "Hepatic and renal physiology", "Recovery and sleep science"],
    lens:
      "Chinese medicine reads organs relationally — through rhythm, function and what they do to each other — rather than as parts in isolation.",
    measured:
      "Traditional organ systems and modern anatomical organs can be put in conversation without pretending they are the same model. What the app records is narrower and checkable: heart-rate variability, resting heart rate, sleep.",
    practice: ["HRV", "Resting heart rate", "The downshift"],
  },
  {
    key: "gut",
    name: "The Middle",
    short: "Middle",
    covers: "Gut · digestion · microbiome · absorption",
    governs: "Where what you take in becomes what you're made of — or doesn't.",
    traditional: ["Ayurveda — agni", "TCM — spleen and stomach", "European herbalism and bitters", "Fermentation traditions"],
    modern: ["Digestive physiology", "Microbiome research", "Enzyme and absorption science"],
    lens:
      "This is where the traditions converge rather than divide. Agni in Ayurveda, spleen and stomach in Chinese medicine, bitters and fermentation in Europe — different vocabularies, the same recurring observation.",
    measured:
      "What enters has to be received, transformed, absorbed and cleared. Enzymes, bile, the gut lining and the microbiome are where that gets specific, and nutrition turns out to be what you absorb rather than what you eat.",
    practice: ["Digestion", "Drainage", "Food"],
  },
  {
    key: "legs",
    name: "Flow",
    short: "Flow",
    covers: "Blood · lymph · hydration · fluids",
    governs: "Drainage and transport. It moves when you move, and stalls when you don't.",
    traditional: ["Walking and natural-movement traditions", "Martial and standing forms", "European nature cure"],
    modern: ["Lymphatic physiology", "Circulatory science", "Hydration and mineral balance"],
    lens:
      "Traditions that never used the word lymph arrived at the practice anyway — daily walking, standing forms, sweat, cold water, time on the ground and in weather.",
    measured:
      "The lymphatic system has no pump of its own. It moves on muscle contraction and breath, which makes sitting still a drainage problem before it is a fitness one. Hydration and minerals are the medium the rest runs in.",
    practice: ["Movement", "Lymph", "Minerals"],
  },
  {
    key: "arms",
    name: "Structure & Strength",
    short: "Structure",
    covers: "Fascia · joints · muscle · bone · force",
    governs: "What carries load, and what happens when nothing asks it to.",
    traditional: ["Physical culture and strength traditions", "Osteopathic and fascial thinking", "Load-bearing work in every culture"],
    modern: ["Strength and hypertrophy science", "Bone-density research", "Fascia research"],
    lens:
      "Strength is not a modern module bolted onto an older system. Every culture that carried, built or fought developed one, and treated capacity as something owed to the body rather than displayed by it.",
    measured:
      "Muscle is the organ of longevity: it decides glucose handling, bone density and whether you can still do things at eighty. Fascia is the continuity — tension in one place is rarely a local event.",
    practice: ["Strength", "Fascia", "Structure"],
  },
];
