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
 * A window reduced to the four numbers a sentence about it needs.
 *
 * ── Why this is a type and not a loop inside the component ────────────────
 *
 * Because it now arrives two ways. A collapsed panel gets it from the server,
 * counted in SQL over a window it never downloads; an expanded one derives it
 * from the rows it already has. Those must produce the same sentence — a
 * summary that says "9 sessions" above a list of eleven is worse than no
 * summary, and that is exactly what two implementations drift into.
 *
 * So there is one sentence-builder, and both paths hand it one of these.
 */
export type Tally = {
  count: number;
  /** `both` counts on both sides — a long walk is movement and it is rest. */
  build: number;
  restore: number;
  /**
   * Total duration, or null when any entry in the window has none.
   *
   * Null rather than a partial sum. A Sakred session records no start time, so
   * a window holding one cannot be totalled — and totalling the imported half
   * and presenting it as the week is the sort of number somebody plans around.
   */
  seconds: number | null;
};

export function tally(entries: readonly SummarisableEntry[]): Tally {
  return {
    count: entries.length,
    build: entries.filter((e) => e.placement === "build" || e.placement === "both").length,
    restore: entries.filter((e) => e.placement === "restore" || e.placement === "both").length,
    seconds: entries.every((e) => e.seconds != null)
      ? entries.reduce((total, e) => total + (e.seconds ?? 0), 0)
      : null,
  };
}

/** Two windows of the same period — the logged half and the imported half. */
export function mergeTallies(a: Tally, b: Tally): Tally {
  return {
    count: a.count + b.count,
    build: a.build + b.build,
    restore: a.restore + b.restore,
    /* One uncountable half makes the whole uncountable, and an empty half
       cannot make a countable one uncountable. */
    seconds:
      (a.seconds === null && a.count > 0) || (b.seconds === null && b.count > 0)
        ? null
        : (a.seconds ?? 0) + (b.seconds ?? 0),
  };
}

/**
 * The window in one sentence.
 *
 * Counts and time, and nothing that grades anybody. "Four sessions · 3h 10m"
 * is a fact; a percentage of a target would be an opinion this panel has not
 * been given the standing to hold.
 */
export function summariseTally(t: Tally): string {
  const parts: string[] = [`${t.count} ${t.count === 1 ? "session" : "sessions"}`];
  if (t.build && t.restore) parts.push(`${t.build} Build · ${t.restore} Restore`);
  if (t.seconds !== null && t.count > 0) {
    const mins = Math.round(t.seconds / 60);
    if (mins >= 1) parts.push(mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`);
  }
  return parts.join(" · ");
}

export function summarise(entries: readonly SummarisableEntry[]): string {
  return summariseTally(tally(entries));
}

/**
 * Which side of the product a logged session belongs to, from its categories.
 *
 * An imported workout carries a placement already. A Sakred session does not,
 * deliberately: one session can span several categories and a single badge
 * would be a claim the data does not support. So it is judged by its sets —
 * all practice categories means Restore, anything with load means Build, and a
 * session with both appears in both, because it genuinely was both.
 *
 * Shared because the server counts a collapsed window and the client lists an
 * expanded one, and they have to agree about what a Restore session is.
 */
export function sakredLens(
  categories: readonly string[],
  isPractice: (category: string) => boolean,
): { restore: boolean; build: boolean } {
  let restore = false;
  let build = false;
  for (const category of categories) {
    if (isPractice(category)) restore = true;
    else build = true;
  }
  return { restore, build };
}
