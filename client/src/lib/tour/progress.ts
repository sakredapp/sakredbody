/**
 * Where a half-finished walkthrough is kept.
 *
 * ── Why local, and why that is not the end of it ──────────────────────────
 *
 * Resume has to be instant and has to survive a force-quit, which rules out
 * waiting on a request before deciding whether to show an overlay. So
 * `localStorage` is the read path, synchronously, the same as the appearance
 * preference and for the same reason.
 *
 * The account is the right home for the *completion*, though — a member who
 * learned the app on an iPhone should not be taught it again because they
 * installed it on an Android. That half is a server record this mirrors into
 * and reads back on first load; until that route exists this degrades to
 * device-local, which is a smaller product than intended and not a broken one.
 *
 * ── Reading is total ──────────────────────────────────────────────────────
 *
 * Every failure mode here — private browsing, storage disabled, a value from a
 * future version, hand-edited JSON — returns null and starts the tour. Being
 * offered a walkthrough you have already seen is an annoyance. Throwing during
 * boot on the first screen after signup is the product not opening.
 */

import type { GuidedTour, TourProgress } from "./types";

export function progressKey(tourId: string, version: number): string {
  return `sakred.tour.${tourId}_v${version}`;
}

export function isProgress(value: unknown): value is TourProgress {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.tourId === "string" &&
    typeof p.version === "number" &&
    (typeof p.stepId === "string" || p.stepId === null) &&
    Array.isArray(p.completed) &&
    p.completed.every((s) => typeof s === "string") &&
    (typeof p.completedAt === "string" || p.completedAt === null)
  );
}

/**
 * Read this tour's progress, at this version or any earlier one.
 *
 * The earlier-version lookup is what makes a version bump non-destructive: v2
 * finds the v1 record, sees which steps were already completed, and offers only
 * what is new. Keyed by version rather than overwritten so that record survives
 * — a single key would have to be migrated in place, and a migration that goes
 * wrong replays the whole walkthrough for everybody.
 */
export function readProgress(tour: GuidedTour): TourProgress | null {
  for (let v = tour.version; v >= 1; v--) {
    try {
      const raw = window.localStorage.getItem(progressKey(tour.id, v));
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (isProgress(parsed)) return parsed;
    } catch {
      // Unreadable or unparseable. Try the next version down, then give up.
    }
  }
  return null;
}

export function writeProgress(progress: TourProgress): void {
  try {
    window.localStorage.setItem(progressKey(progress.tourId, progress.version), JSON.stringify(progress));
  } catch {
    // The tour still runs to the end this session; only resume is lost.
  }
}

/**
 * Put a completed walkthrough back to the beginning.
 *
 * QA needs this to experience first-run repeatedly without creating another
 * account, and it is the honest implementation of "replay" for a member who
 * wants the tour again *and* wants it to stick. The ordinary replay in Settings
 * does not call this — see `replay` in the engine — because a member reviewing
 * the app should not have their record of having learned it rewritten.
 */
export function clearProgress(tour: GuidedTour): void {
  for (let v = tour.version; v >= 1; v--) {
    try {
      window.localStorage.removeItem(progressKey(tour.id, v));
    } catch {
      // Nothing to do; the next read will simply find what is left.
    }
  }
}
