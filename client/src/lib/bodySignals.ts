/**
 * Which of a member's own answers relate to a territory of the body.
 *
 * ── This is a reading layer, not a second check-in ────────────────────────
 *
 * Sakred asks one person one set of questions, once a day: the seven canonical
 * signals in shared/models/terrainSignals.ts. Nothing here asks anything. Each
 * region declares which of those seven its territory relates to, and the screen
 * shows the member their own answer back.
 *
 * The alternative — a per-region state set by hand — is what this replaced, and
 * it was the actual problem: somebody could report clarity 2/5 on one screen
 * and "crown: open" on another, five minutes apart, about the same lived state,
 * with nothing to reconcile them. One body, one subjective history.
 *
 * ── Relevance, not measurement ───────────────────────────────────────────
 *
 * The mappings live in client/src/data/bodyMapApp.ts and are editorial. Nothing
 * in Sakred measures Flow. "Body 2/5 relates to what you might notice here" is
 * defensible to show a member; "your Flow is 2/5" is a claim we cannot make,
 * and the screen is built so it cannot be rendered that way.
 */

import { APP_REGIONS } from "@/data/bodyMapApp";
import type { BodyRegionKey } from "@shared/models/bodyMap";
import type { TerrainSignalId } from "@shared/models/terrainSignals";

export type ReportedToday = Partial<Record<TerrainSignalId, number | null>>;

export type RegionSignal = { id: TerrainSignalId; value: number };

/**
 * The member's own answers for one region — only the ones they actually gave.
 *
 * Returns an empty array rather than placeholders. A region with nothing to
 * show renders no section at all, which is the honest output and the majority
 * case: do not render dead state to explain absent state.
 */
export function signalsForRegion(key: BodyRegionKey, reported: ReportedToday | null): RegionSignal[] {
  if (!reported) return [];
  const out: RegionSignal[] = [];
  for (const id of APP_REGIONS[key].signals) {
    const value = reported[id];
    if (typeof value === "number") out.push({ id, value });
  }
  return out;
}

/** Whether anything at all is known about this region today. */
export function hasSignals(key: BodyRegionKey, reported: ReportedToday | null): boolean {
  return signalsForRegion(key, reported).length > 0;
}
