/**
 * The walkthrough's decisions, with nothing that can see a screen.
 *
 * Every function here takes what is true and returns what should happen. The
 * overlay reports the world and renders the answer; it decides nothing. That
 * split is what makes the fifteen scenarios in `script/test-tour.ts` checkable
 * without a browser — including the ones that matter most, which are the
 * failures: an anchor that never appears, a member who leaves at step four, a
 * version bump, a replay.
 *
 * ── The rule that shapes all of it ────────────────────────────────────────
 *
 * A frozen scrim is worse than no tutorial. The app is still there underneath,
 * the member can see it, and they cannot touch it — which reads as a crash on
 * the first screen of a product they just signed up for. So every wait in here
 * is bounded and every bound has an exit, and `resolve` never returns "keep
 * waiting" forever.
 */

import type {
  Advance,
  GuidedTour,
  TourAnchor,
  TourProgress,
  TourStep,
  TourWorld,
} from "./types";
import { AUTO_START_ENABLED, REQUIRED_TOUR_VERSION } from "./rollout";

/**
 * How long a step will wait for its target before it stops waiting.
 *
 * Long enough to cover a lazy chunk on a slow connection and a list that is
 * still fetching; short enough that a member who hit a genuine dead end is not
 * left looking at a dimmed screen wondering whether the app has hung.
 */
/**
 * How long a lesson looks for its subject before giving up.
 *
 * Raised from six seconds because six is inside the range a real screen takes
 * to arrive: the Room feed is a network read, and a slow one degraded the
 * lesson about it — a member on a train would have met "Continue for now" on a
 * card that was about to appear. Nine is still short enough that a genuinely
 * missing target does not leave anybody staring at a panel, and long enough
 * that arriving late is not treated as never.
 */
export const ANCHOR_TIMEOUT_MS = 9000;

/** What the overlay should do about the current step, right now. */
export type Resolution =
  /** The anchor is mounted. Spotlight it. */
  | { kind: "ready"; step: TourStep; anchor: TourAnchor | null }
  /** Not there yet, and still within the bound. Hold the panel, no cutout. */
  | { kind: "waiting"; step: TourStep; reason: "anchor" | "section" }
  /** Optional and never arrived. Move on silently. */
  | { kind: "skip"; step: TourStep }
  /**
   * Required and never arrived. Show the step without a cutout and let the
   * member continue — a walkthrough that cannot find one card is still worth
   * finishing, and stopping dead teaches them the app is broken.
   */
  | { kind: "degraded"; step: TourStep };

export function resolve(step: TourStep, world: TourWorld): Resolution {
  // Wrong screen. Not a failure — a member can wander mid-step — so this waits
  // rather than degrading, and the panel tells them where to go back to.
  if (step.section && world.section !== null && world.section !== step.section) {
    return world.waitedMs >= ANCHOR_TIMEOUT_MS
      ? { kind: "degraded", step }
      : { kind: "waiting", step, reason: "section" };
  }

  if (!step.anchor) return { kind: "ready", step, anchor: null };
  if (world.present.has(step.anchor)) return { kind: "ready", step, anchor: step.anchor };
  if (world.waitedMs < ANCHOR_TIMEOUT_MS) return { kind: "waiting", step, reason: "anchor" };

  /*
    The bound has passed. An optional step had nothing to teach today; a lesson
    about an affordance this form factor does not have has nothing to teach
    here at all; a required one still has something to say.
  */
  return step.optional || step.formFactor ? { kind: "skip", step } : { kind: "degraded", step };
}

/**
 * Has the member done the thing?
 *
 * `tapped` is passed separately rather than folded into the world because it
 * is an event, not a state: it is true for one call and must not be re-read on
 * the next frame, or a `tap` step would advance twice.
 */
export function isSatisfied(advance: Advance, world: TourWorld, tapped: boolean): boolean {
  switch (advance.kind) {
    case "continue":
      // The panel's button is the only path, and pressing it calls `next`
      // directly. Nothing observable satisfies this on its own.
      return false;
    case "tap":
      return tapped;
    case "section":
      return world.section === advance.section;
    case "present":
      return world.present.has(advance.anchor);
    case "absent":
      /*
        Gone, not merely not-here-yet. Without `seen`, resuming into the
        workout lesson satisfied "the set row has disappeared" in the frame
        before the workout had been rebuilt — the member came back and the
        lesson had taught itself.
      */
      return world.seen.has(advance.anchor) && !world.present.has(advance.anchor);
  }
}

// ── Where a tour starts, and whether it should ───────────────────────────

/**
 * Everything that has to be true before a walkthrough may take the screen.
 *
 * Each of these is a real way to ruin it. A tour that starts while Home is
 * still skeletons spotlights a rectangle that is about to move. One that
 * starts during a redirect teaches the wrong screen. One that starts under the
 * OS health-permission sheet dims an app the member cannot see and waits for a
 * tap the OS is intercepting — a genuine dead end on first launch.
 */
export type StartConditions = {
  authenticated: boolean;
  intakeComplete: boolean;
  /** Home has real content, not skeletons. */
  homeReady: boolean;
  redirecting: boolean;
  /** A native permission dialog is over the app. */
  systemDialogOpen: boolean;
};

export function shouldStart(progress: TourProgress | null, tour: GuidedTour, c: StartConditions): boolean {
  if (!c.authenticated || !c.intakeComplete) return false;
  if (!c.homeReady || c.redirecting || c.systemDialogOpen) return false;

  if (!progress) return true;

  /*
    A record older than the required version is owed this walkthrough again,
    finished or not.

    This is the one case where a completion does not settle the question. The
    required version is bumped when the walkthrough has changed enough that
    having seen the old one is not the same as having been taught the app — and
    at that point "they already did it" is an answer to a question nobody
    asked. Their old record is untouched on disk, under its own key; this only
    decides what to show them next.
  */
  if (progress.version < REQUIRED_TOUR_VERSION) return true;

  if (progress.completedAt) return false;
  // A different version with no completion recorded is an unfinished tour that
  // has since been rewritten. Start it, from the beginning of the new one.
  return progress.version !== tour.version || progress.stepId !== null;
}

/**
 * Which step a returning member lands on.
 *
 * Three cases, and the middle one is the one that gets built wrong.
 *
 *   nothing stored          → the first step
 *   stored, same version    → the step they left on, by id
 *   stored, older version   → the first step *they have not already done*
 *
 * The third is what stops a v2 bump replaying an hour of walkthrough for
 * somebody who did all of it a month ago. Ids are matched, not indices: steps
 * get inserted, and an index would silently point at a different lesson.
 */
export function resumeAt(progress: TourProgress | null, tour: GuidedTour): number {
  if (!progress) return 0;

  /*
    A required bump starts at the beginning, not at "the first step you have
    not already done".

    The unseen-steps rule below is right for an ordinary version bump — nobody
    should sit through an hour they finished last month to see three new
    lessons. It is wrong here: a required bump says the whole thing is being
    taught again, and dropping somebody into step nineteen of a walkthrough
    they are meant to be re-shown is worse than either extreme.
  */
  if (progress.version < REQUIRED_TOUR_VERSION) return 0;

  if (progress.version === tour.version && progress.stepId) {
    const at = tour.steps.findIndex((s) => s.id === progress.stepId);
    if (at !== -1) return at;
  }

  const done = new Set(progress.completed);
  const first = tour.steps.findIndex((s) => !done.has(s.id));
  return first === -1 ? tour.steps.length : first;
}

/**
 * The question the application actually asks.
 *
 * Split from `shouldStart` rather than folded into it, because the two answer
 * different things and only one of them is engineering. `shouldStart` is "are
 * the preconditions met" — testable, and true today. This is "is the product
 * ready for every member to meet this on opening the app", which is a judgement
 * the suite must not be able to make on the code's behalf.
 *
 * The hook calls this one. Replay and the QA reset call neither: they run the
 * same tour through the same engine deliberately, so what gets rehearsed is
 * what will ship rather than a demo build of it.
 */
export function mayAutoStart(progress: TourProgress | null, tour: GuidedTour, c: StartConditions): boolean {
  return AUTO_START_ENABLED && shouldStart(progress, tour, c);
}

/**
 * The steps of a new version that an existing member has genuinely not seen.
 *
 * This is what a "What's new" micro-tour is built from, and why a version bump
 * does not have to mean replaying v1. Returns nothing when there is nothing
 * new, which the caller must treat as "do not offer a tour" rather than "offer
 * an empty one".
 */
export function unseenSteps(progress: TourProgress | null, tour: GuidedTour): TourStep[] {
  if (!progress?.completedAt) return [];
  const done = new Set(progress.completed);
  return tour.steps.filter((s) => !done.has(s.id));
}

// ── Progress ─────────────────────────────────────────────────────────────

export function emptyProgress(tour: GuidedTour): TourProgress {
  return {
    tourId: tour.id,
    version: tour.version,
    stepId: tour.steps[0]?.id ?? null,
    completed: [],
    completedAt: null,
  };
}

/**
 * Record a step as done and point at the next one.
 *
 * `at` is an index because the caller is walking the list; the *stored* value
 * is an id, for the reason in `resumeAt`. `completedAt` is set only when the
 * last step is finished, so a paused tour is distinguishable from a finished
 * one by a field rather than by comparing an index to a length.
 */
export function complete(progress: TourProgress, tour: GuidedTour, at: number, now: string): TourProgress {
  const step = tour.steps[at];
  if (!step) return progress;

  const completed = progress.completed.includes(step.id)
    ? progress.completed
    : [...progress.completed, step.id];

  const next = tour.steps[at + 1];
  return {
    ...progress,
    version: tour.version,
    completed,
    stepId: next ? next.id : null,
    completedAt: next ? null : now,
  };
}

/**
 * Leaving, without losing anything.
 *
 * A phone call, a force-quit, a permission sheet, or simply putting the phone
 * down. All of them are the same event as far as the record is concerned, and
 * none of them may cost the member the eight steps they already did.
 */
export function pause(progress: TourProgress, tour: GuidedTour, at: number): TourProgress {
  const step = tour.steps[at];
  return step ? { ...progress, stepId: step.id, version: tour.version } : progress;
}

/**
 * A replay changes nothing.
 *
 * The member has already completed the walkthrough; running it again is
 * reference, not education, and the record of having learned the app once is
 * not something a second viewing should overwrite. So replay runs off a
 * separate in-memory state and this function exists to say — and to let the
 * suite assert — that the stored progress is returned unchanged.
 */
export function replay(progress: TourProgress): TourProgress {
  return progress;
}

// ── The quest log ────────────────────────────────────────────────────────

export type Objective = { name: string; done: boolean };

/**
 * The objective list, derived rather than maintained.
 *
 * Steps carry an `objective` name and several steps share one — the four
 * workout lessons are all "Learn Build". An objective is done when every step
 * carrying it is done, which means the list cannot drift out of step with the
 * tour it describes, and adding a lesson to Build does not silently add a
 * seventh line to a list the copy calls "6 / 6".
 */
export function objectives(tour: GuidedTour, completed: ReadonlySet<string>): Objective[] {
  const order: string[] = [];
  const byName = new Map<string, TourStep[]>();

  for (const step of tour.steps) {
    if (!step.objective) continue;
    if (!byName.has(step.objective)) {
      byName.set(step.objective, []);
      order.push(step.objective);
    }
    byName.get(step.objective)!.push(step);
  }

  return order.map((name) => ({
    name,
    done: byName.get(name)!.every((s) => completed.has(s.id)),
  }));
}
