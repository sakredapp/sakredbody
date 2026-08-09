/**
 * What a member's numbers actually are.
 *
 * Nobody assigns a one-rep max here. A coach writing "top set at 85%" would
 * otherwise need a maintained 1RM per lift per member, and that number is
 * stale the week after it is entered — so the reference is computed from what
 * the member has actually lifted, and moves on its own as they get stronger.
 *
 * ── Best estimate, not last estimate ──────────────────────────────────────
 *
 * The reference is the *best* estimate inside a recent window, not the most
 * recent one. A deload week or one bad session would otherwise drop every
 * prescribed weight for the following block, which is exactly backwards: the
 * programme should not get easier because you had a poor Tuesday.
 *
 * The window exists for the opposite reason. An all-time best from two years
 * and one shoulder injury ago is not a number to programme against today.
 */

import { estimateOneRepMax, totalLoadKg } from "../../shared/models/training.js";

/** How far back a max still counts as current. */
export const REFERENCE_WINDOW_DAYS = 180;

export interface SetRow {
  exerciseId: string;
  reps: number | null;
  weightKg: number;
  isWarmup: boolean;
  onDate: string;
  bodyweightFactor: number;
}

export interface StrengthPoint {
  onDate: string;
  e1rmKg: number;
  reps: number;
  weightKg: number;
}

/**
 * The best estimated max per exercise, from a member's own sets.
 *
 * Warm-ups are excluded — counting a ramp toward a max would let a light day
 * raise the reference. Sets above the rep cap are excluded by
 * `estimateOneRepMax` returning null, so a set of thirty never "proves" a
 * heavy single.
 */
export function bestEstimates(
  sets: SetRow[],
  bodyweightByDate: (onDate: string) => number | null,
): Map<string, StrengthPoint> {
  const best = new Map<string, StrengthPoint>();

  for (const s of sets) {
    if (s.isWarmup || s.reps == null) continue;

    const load = totalLoadKg(s.weightKg, s.bodyweightFactor, bodyweightByDate(s.onDate));
    const e1rm = estimateOneRepMax(load, s.reps);
    if (e1rm == null) continue;

    const current = best.get(s.exerciseId);
    if (!current || e1rm > current.e1rmKg) {
      best.set(s.exerciseId, {
        onDate: s.onDate,
        e1rmKg: e1rm,
        reps: s.reps,
        weightKg: load,
      });
    }
  }

  return best;
}

/**
 * One point per day for a single exercise — the shape the Sparkline wants.
 *
 * A day's point is that day's *best* set, not its average: the average moves
 * with how many back-off sets somebody did, which has nothing to do with
 * whether they are getting stronger.
 */
export function progressionSeries(
  sets: SetRow[],
  bodyweightByDate: (onDate: string) => number | null,
): StrengthPoint[] {
  const byDate = new Map<string, StrengthPoint>();

  for (const s of sets) {
    if (s.isWarmup || s.reps == null) continue;

    const load = totalLoadKg(s.weightKg, s.bodyweightFactor, bodyweightByDate(s.onDate));
    const e1rm = estimateOneRepMax(load, s.reps);
    if (e1rm == null) continue;

    const current = byDate.get(s.onDate);
    if (!current || e1rm > current.e1rmKg) {
      byDate.set(s.onDate, { onDate: s.onDate, e1rmKg: e1rm, reps: s.reps, weightKg: load });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.onDate.localeCompare(b.onDate));
}

/**
 * Turn "85%" into a weight this member should actually put on the bar.
 *
 * Returns null when there is nothing to compute from — a member's first
 * session with a lift has no history, and inventing a number for them would be
 * worse than showing the percentage and letting them choose. The UI says so
 * rather than printing a confident zero.
 */
export function prescribedWeightKg(
  percent: number | null | undefined,
  reference: StrengthPoint | undefined,
): number | null {
  if (percent == null || !reference) return null;
  return (reference.e1rmKg * percent) / 100;
}

/**
 * Strength relative to bodyweight — a 1.5× squat.
 *
 * The honest comparison across body sizes, and the reason it is worth
 * computing at all: "225 on the bar" means something completely different at
 * 150lb and at 250lb, and members compare themselves to each other regardless
 * of whether the app helps them do it well.
 */
export function relativeStrength(
  e1rmKg: number,
  bodyweightKg: number | null,
): number | null {
  if (!bodyweightKg || bodyweightKg <= 0) return null;
  return e1rmKg / bodyweightKg;
}
