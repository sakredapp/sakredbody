/**
 * What "How to Use Sakred" knows about the walkthrough.
 *
 * ── Why this is not in the component ──────────────────────────────────────
 *
 * Because the help portal has three doors — More, Settings and the Library —
 * and three copies of "are they part way through" is three chances to say
 * something different about the same record. The screen renders; this decides.
 *
 * It also means the state can be tested without a browser, which matters:
 * telling somebody they have completed a walkthrough they have not, or
 * offering to resume one that is finished, is the kind of small lie that makes
 * a product feel like it is not paying attention.
 */

import type { GuidedTour, TourProgress } from "./types";
import { objectives } from "./engine";
import { REQUIRED_TOUR_VERSION } from "./rollout";

/** One conceptual part of the walkthrough, as the portal lists it. */
export type Chapter = {
  /** The objective, which is already the chapter name in the step list. */
  name: string;
  /** The lessons inside it, in the order they are taught. */
  lessons: { id: string; title: string }[];
  /** Where a replay of this chapter begins. */
  fromStepId: string;
  done: boolean;
};

/**
 * Chapters, from the tour's own objectives.
 *
 * Nothing here is a second list of what the walkthrough contains. A lesson
 * added next month appears in the portal because it declared an objective,
 * which is the same fact the progress ring on the overlay is drawn from.
 */
export function chapters(tour: GuidedTour, completed: ReadonlySet<string>): Chapter[] {
  return objectives(tour, completed).map(({ name, done }) => {
    const lessons = tour.steps
      .filter((s) => s.objective === name)
      .map((s) => ({ id: s.id, title: s.title }));
    return { name, lessons, fromStepId: lessons[0].id, done };
  });
}

export type WalkthroughState =
  /** Never opened it. */
  | { kind: "new" }
  /** Part way through, and the lesson to come back to. */
  | { kind: "paused"; stepId: string; chapter: string | null; completedCount: number }
  /** Finished this version. */
  | { kind: "complete"; at: string }
  /**
   * Finished an older version that has since been rewritten enough to be
   * required again. Distinct from `complete` because telling somebody they are
   * done while the app intends to teach them again is the version of this that
   * gets caught by a member rather than by a test.
   */
  | { kind: "superseded"; at: string | null };

export function walkthroughState(
  progress: TourProgress | null,
  tour: GuidedTour,
): WalkthroughState {
  if (!progress) return { kind: "new" };
  if (progress.version < REQUIRED_TOUR_VERSION) {
    return { kind: "superseded", at: progress.completedAt };
  }
  if (progress.completedAt && !progress.stepId) {
    return { kind: "complete", at: progress.completedAt };
  }
  if (!progress.stepId) return { kind: "new" };
  const step = tour.steps.find((s) => s.id === progress.stepId);
  return {
    kind: "paused",
    stepId: progress.stepId,
    chapter: step?.objective ?? null,
    completedCount: progress.completed.length,
  };
}

/** One sentence, for the card at the top of the portal. */
export function stateSentence(state: WalkthroughState, tour: GuidedTour): string {
  switch (state.kind) {
    case "new":
      return `${tour.steps.length} short lessons. You can stop anywhere and come back.`;
    case "paused":
      return state.chapter
        ? `Paused in ${state.chapter} — ${state.completedCount} of ${tour.steps.length} done.`
        : `Paused — ${state.completedCount} of ${tour.steps.length} done.`;
    case "complete":
      return "You've been through the whole walkthrough. It's here whenever you want it again.";
    case "superseded":
      return "The walkthrough has changed since you last went through it.";
  }
}
