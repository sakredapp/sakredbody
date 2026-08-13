/**
 * What the app can honestly say about a region of the body today.
 *
 * ── This is a reading layer, not a second check-in ────────────────────────
 *
 * Sakred already asks one person one set of questions, once a day: the seven
 * canonical signals in shared/models/terrainSignals.ts. Nothing here asks
 * anything. Each region names which of those seven its territory plausibly
 * speaks to, and the screen shows the member's own answer back to them.
 *
 * The alternative — a per-region state a member sets by hand — is what this
 * replaces, and it was the actual problem. Somebody would tell Sakred their
 * clarity was 2/5 on one screen and that their crown was "blocked" on another,
 * about substantially the same lived state, and the two could disagree with
 * nothing to reconcile them. One body, one subjective history.
 *
 * ── What these mappings are, and are not ─────────────────────────────────
 *
 * They are editorial, not physiological. "Digestion speaks to The Middle" is a
 * defensible thing to show a member; it is not a claim that the signal measures
 * the region. Where no honest mapping exists the list is short, and where the
 * member has not answered, the screen says nothing rather than inventing a
 * reading. An empty section is the correct output for most people most days.
 *
 * Region keys match MAP_REGIONS in client/src/data/bodyMap.ts, which is the
 * public Body Map's content and belongs to the site. The app consumes it so
 * both surfaces teach the same seven territories rather than drifting into two
 * vocabularies for one body.
 */

import type { TerrainSignalId } from "@shared/models/terrainSignals";

export type RegionKey = "crown" | "throat" | "root" | "heart" | "gut" | "legs" | "arms";

/**
 * Which canonical signals a region can speak to.
 *
 * Ordered by how directly — the first is the one a member would most expect to
 * see there. Kept deliberately short: three signals under every region would
 * mean the same answer appearing seven times, which teaches nothing and makes
 * the whole map feel like one number wearing different hats.
 */
export const REGION_SIGNALS: Record<RegionKey, TerrainSignalId[]> = {
  // Attention and the state you perceive the day from.
  crown: ["mentalClarity", "energy"],
  // The one autonomic function you can take by hand, and what it costs to.
  throat: ["nervousSystem", "recovery"],
  // Posture, spine, and whether the body currently believes it is safe.
  root: ["nervousSystem", "bodyTension"],
  // Circulation and whether the day's charge settles at night.
  heart: ["recovery", "energy"],
  // The one unambiguous mapping in the whole file.
  gut: ["digestion"],
  // Drainage and transport: it moves when you move. Heaviness is the signal a
  // member actually reports here, and it is a stretch to claim more than that.
  legs: ["bodyTension"],
  // What carries load, and whether there is any appetite to load it.
  arms: ["bodyTension", "drive"],
};

/**
 * What a person might notice there, in their own words.
 *
 * The point of the screen: body literacy is learning to perceive and name a
 * signal, not to assign a mystical state to a centre. These are deliberately
 * ordinary — the kind of thing somebody would say to a friend, not to a
 * practitioner — because a member who can say "I couldn't take a full breath
 * today" has learned something a five-point scale cannot hold.
 *
 * Neutral and pleasant experiences are included on purpose. A list made only of
 * complaints teaches people to scan themselves for what is wrong.
 */
export const REGION_NOTICE: Record<RegionKey, string[]> = {
  crown: [
    "Clear attention",
    "Mental noise",
    "Difficulty choosing",
    "Sensory overload",
    "Feeling mentally flat",
  ],
  throat: [
    "Shallow breathing",
    "Jaw or throat tension",
    "Difficulty taking a full breath",
    "Holding your breath without noticing",
    "Ease and expansion",
  ],
  root: [
    "Wired but tired",
    "Settling quickly, or not at all",
    "Standing taller without trying",
    "Bracing through the low back",
    "Startling easily",
  ],
  heart: [
    "Racing or pounding at rest",
    "Waking at the same hour each night",
    "Warmth in the hands and feet",
    "Breath catching on stairs",
    "Settling well in the evening",
  ],
  gut: [
    "Appetite",
    "Bloating",
    "Heaviness after eating",
    "Bowel rhythm",
    "Digestive ease",
    "Cravings",
  ],
  legs: [
    "Puffiness or swelling",
    "Heaviness in the legs",
    "Stiffness after sitting",
    "Cold hands and feet",
    "Feeling lighter after moving",
  ],
  arms: [
    "Strength you can call on",
    "Aching a day or two after effort",
    "Joints that need longer to warm up",
    "Grip giving out first",
    "Moving without thinking about it",
  ],
};

/** The order the regions are read in, head to ground. */
export const REGION_ORDER: RegionKey[] = [
  "crown",
  "throat",
  "root",
  "heart",
  "gut",
  "legs",
  "arms",
];

export type ReportedToday = Partial<Record<TerrainSignalId, number | null>>;

export type RegionSignal = { id: TerrainSignalId; value: number };

/**
 * The member's own answers for one region — only the ones they actually gave.
 *
 * Returns an empty array rather than placeholders. A region with nothing to
 * show renders no "Today" section at all, which is the honest output and the
 * one the deterministic-UI rule asks for: do not render dead state to explain
 * absent state.
 */
export function signalsForRegion(key: RegionKey, reported: ReportedToday | null): RegionSignal[] {
  if (!reported) return [];
  const out: RegionSignal[] = [];
  for (const id of REGION_SIGNALS[key]) {
    const value = reported[id];
    if (typeof value === "number") out.push({ id, value });
  }
  return out;
}

/** Whether anything at all is known about this region today. */
export function hasSignals(key: RegionKey, reported: ReportedToday | null): boolean {
  return signalsForRegion(key, reported).length > 0;
}
