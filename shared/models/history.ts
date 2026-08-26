/**
 * What a window of activity amounts to, before any of it is listed.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Build shows this week unfiltered and then thirty days of training, so the
 * rows a member has just read reappear immediately underneath as the top of
 * the longer list. Neither panel is wrong — the week is everything, the
 * history is Build — but reading the same six activities twice on the way down
 * one screen is what it felt like, and it was thirty days of rows rendered
 * because the API had already returned them.
 *
 * Summary first, then as much as was asked for.
 *
 * Here rather than in the component because it is the part with judgement in
 * it, and the component cannot be imported by a test without dragging in the
 * bundler's environment.
 */

import type { WorkoutPlacement } from "./training";

/** Below this many entries, a list is not a wall and does not need folding. */
export const WALL = 4;

/** The part of an entry a summary is allowed to look at. */
export type SummarisableEntry = {
  placement: WorkoutPlacement | null;
  /**
   * How long it took, when that is recorded.
   *
   * Null for a Sakred session — nothing writes a start time — so a window
   * containing one cannot be totalled.
   */
  seconds: number | null;
};

/**
 * Whether a window of this size should be summarised rather than listed.
 *
 * A summary is worth reading in place of a wall and silly in place of two
 * rows: "2 sessions — All 2" asks somebody to press a button to see what would
 * have fit anyway. So folding has a floor as well as a preview, and a panel
 * that asked for no folding never folds.
 */
export function foldsAt(count: number, preview: number | undefined): boolean {
  return preview !== undefined && count > Math.max(preview, WALL);
}

/**
 * The window in one sentence.
 *
 * Counts and time, and nothing that grades anybody. "Four sessions · 3h 10m"
 * is a fact; a percentage of a target would be an opinion this panel has not
 * been given the standing to hold.
 */
export function summarise(entries: readonly SummarisableEntry[]): string {
  const parts: string[] = [`${entries.length} ${entries.length === 1 ? "session" : "sessions"}`];

  /* `both` is genuinely both — a long walk is movement and it is restorative —
     so it is counted on both sides rather than assigned to one. */
  const build = entries.filter((e) => e.placement === "build" || e.placement === "both").length;
  const restore = entries.filter((e) => e.placement === "restore" || e.placement === "both").length;
  if (build && restore) parts.push(`${build} Build · ${restore} Restore`);

  /*
    Only when every entry can be counted. Totalling the imported half of a
    window and presenting it as the week is the sort of number somebody plans
    around.
  */
  if (entries.every((e) => e.seconds != null)) {
    const mins = Math.round(entries.reduce((total, e) => total + (e.seconds ?? 0), 0) / 60);
    if (mins >= 1) parts.push(mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`);
  }

  return parts.join(" · ");
}
