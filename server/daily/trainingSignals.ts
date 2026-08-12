/**
 * What their body has actually been doing, reduced to a few facts.
 *
 * The daily note already knows the sky, the season, where somebody is in a
 * protocol, what their phone measured and how much of their checklist they
 * finished. It knew nothing whatsoever about training — so a member who
 * deadlifted heavy on Monday, played ninety minutes of basketball on Tuesday
 * and slept badly on Wednesday got a note that could not mention any of it.
 *
 * That is the one input where Sakred has better data than the wearable: a
 * watch can tell that the heart rate went up, and only this table knows it was
 * pulling, that it was heavy, and that nothing elastic has been done in three
 * weeks.
 *
 * ── Reduced, like healthSignals, and for the same reason ──────────────────
 *
 * Handing a model two hundred set rows produces averaging it is bad at and a
 * prompt nobody can read. These are the four facts a coach would actually
 * notice, computed here where they can be tested.
 *
 * ── Nothing free-text leaves this file ────────────────────────────────────
 *
 * Session titles and member-created movement names are typed by members, and
 * a member can type anything into them — including their own name. Only
 * catalogue *category labels* and counts are reported: those come from a
 * shared constant, so there is no path by which member-entered text reaches a
 * prompt from here at all. That is a stronger guarantee than scrubbing.
 */

import { EXERCISE_CATEGORIES } from "../../shared/schema.js";
import { addDaysToString } from "../../shared/utils/dates.js";
import { recentMovement } from "../movement/history.js";
// The shape and its prompt rendering live in voice.ts, which imports no
// database and so can be tested directly.
import type { TrainingSignals } from "./voice.js";

/** A fortnight: long enough to see a gap, short enough to still be about now. */
const WINDOW_DAYS = 14;

/** How long without a family before it is worth mentioning at all. */
const NEGLECTED_AFTER_DAYS = 10;

const GROUP_LABEL: Record<string, string> = {
  strength: "strength",
  athletic: "athletic work",
  mobility: "mobility",
  studio: "studio work",
  fascia: "fascia and recovery",
  practice: "practices",
};

const GROUP_OF = new Map(EXERCISE_CATEGORIES.map((c) => [c.id as string, c.group as string]));


export async function trainingSignals(
  userId: string,
  onDate: string,
): Promise<TrainingSignals | null> {
  const since = addDaysToString(onDate, -WINDOW_DAYS);

  /**
   * ── Both tables, through the one reader ─────────────────────────────────
   *
   * This queried `workout_sessions` alone. So did the terrain read, and so did
   * Today's readiness — three separate implementations of "what has this member
   * been doing", two of which could not see a workout the phone recorded.
   *
   * The visible result was a note telling somebody their movement was down on
   * the evening of a five-mile run, while another screen in the same app
   * correctly counted nine demanding sessions that week. Three copies is how
   * that happens; `recentMovement` is now the only one.
   */
  const rows = await recentMovement(userId, since);

  if (rows.length === 0) return null;

  const week = addDaysToString(onDate, -7);
  /**
   * Counted per day, not per session id.
   *
   * `recentMovement` returns one entry per (day, category) and imported
   * workouts have no session id at all, so a set of ids is no longer the right
   * measure — and it would have counted a day of squats and bench as two.
   */
  const sessionsThisWeek = new Set(rows.filter((r) => r.onDate >= week).map((r) => r.onDate)).size;

  // Most recent day per family, so "recent" and "neglected" fall out of one pass.
  const lastSeen = new Map<string, string>();
  let mostRecent: string | null = null;
  for (const r of rows) {
    const group = GROUP_OF.get(r.category);
    if (!group) continue;
    const seen = lastSeen.get(group);
    if (!seen || r.onDate > seen) lastSeen.set(group, r.onDate);
    if (!mostRecent || r.onDate > mostRecent) mostRecent = r.onDate;
  }

  const daysBetween = (a: string, b: string) =>
    Math.round(
      (new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000,
    );

  const recent: string[] = [];
  const neglected: string[] = [];
  for (const [group, seen] of Array.from(lastSeen.entries())) {
    const label = GROUP_LABEL[group] ?? group;
    const ago = daysBetween(onDate, seen);
    if (ago <= 7) recent.push(label);
    else if (ago >= NEGLECTED_AFTER_DAYS) neglected.push(label);
  }

  return {
    sessionsThisWeek,
    daysSinceLast: mostRecent ? daysBetween(onDate, mostRecent) : null,
    recent,
    neglected,
  };
}
