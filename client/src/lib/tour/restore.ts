/**
 * Putting the member back where the lesson happens, not just on the right step.
 *
 * ── The failure this exists to prevent ────────────────────────────────────
 *
 * A member gets a phone call during the RPE lesson. They come back an hour
 * later, the app cold-starts onto Home, the tour restores step fifteen, and the
 * spotlight begins waiting for an RPE control that only exists inside a workout
 * they are no longer in. Six seconds later it degrades to a panel explaining
 * RPE over a screen with no sets on it.
 *
 * Nothing errors. It is simply nonsense, and it is the single most likely way
 * this feature embarrasses itself, because interruption on a phone is not an
 * edge case — it is Tuesday.
 *
 * ── Reconstructed from the script, never from a saved world ───────────────
 *
 * The tempting fix is to persist what the app looked like: the open session,
 * the movement, the logged set. That would mean writing rehearsal rows to
 * survive a restart, which is the exact contamination the whole rehearsal
 * design exists to make impossible — invented sets that outlive the tutorial
 * are worse than a tutorial that resumes badly.
 *
 * So nothing about the rehearsal is persisted. Each step declares the minimum
 * state its lesson needs, and that state is rebuilt from the declaration. The
 * RPE step needs a movement and one completed set; those are constructed on
 * resume, in memory, from seven lines of data. An app kill during the workout
 * lesson is recoverable and still writes nothing.
 */

import type { GuidedTour, TourProgress, TourStep } from "./types";
import { REHEARSAL_LAST_TIME, type RehearsalStore, createStore } from "./rehearsal";

/**
 * What the interface has to look like before a step's target can exist.
 *
 * Derived from the step rather than stored alongside it wherever possible —
 * `section` is already on the step because the engine uses it to decide
 * whether to wait, and duplicating it here would be two facts that can
 * disagree.
 */
export type RestoreSpec = {
  /** Always the portal today; named so a future role workspace can differ. */
  route: string;
  section: string | null;
  /** The More sheet has to be open for its rows to be resolvable. */
  sheet: "more" | null;
  /** Which of several like-named controls, for repeated targets. */
  instance: string | null;
  rehearsal: RehearsalSnapshot | null;
};

/**
 * The least state that makes a workout lesson teachable.
 *
 * Deliberately counts rather than fixtures: the exercise picker is real, so
 * what the member chose is theirs and unknowable on resume. A generic movement
 * is honest — the lesson is about the set row, not about bench press.
 */
export type RehearsalSnapshot = {
  movements: number;
  /** Completed sets on the most recent movement. */
  sets: number;
  /** Whether the previous-session example needs to be present. */
  lastTime: boolean;
};

/**
 * What each rehearsal step needs in front of it.
 *
 * Read down the column: the state accumulates exactly as it would if the member
 * had walked there, which is the property that makes a resumed tutorial
 * indistinguishable from an uninterrupted one.
 */
const SNAPSHOTS: Record<string, RehearsalSnapshot> = {
  // The sheet is open and empty. Nothing has been added yet — that is the
  // lesson.
  "start-session": { movements: 0, sets: 0, lastTime: false },
  "add-exercise": { movements: 0, sets: 0, lastTime: false },
  // A movement is chosen, so there is a row to point at.
  "set-row": { movements: 1, sets: 0, lastTime: false },
  // One set is logged, so effort has something to attach to.
  "rpe": { movements: 1, sets: 1, lastTime: false },
  "set-style": { movements: 1, sets: 1, lastTime: false },
  // The example history is what the lesson is about.
  "last-time": { movements: 1, sets: 1, lastTime: true },
  "close-workout": { movements: 1, sets: 1, lastTime: true },
};

/** Steps whose target lives inside the More sheet. */
const IN_MORE_SHEET = new Set(["settings", "coach-role"]);

export function restoreSpecFor(step: TourStep): RestoreSpec {
  const snapshot = SNAPSHOTS[step.id] ?? null;
  return {
    route: "/member",
    /*
      A workout step has no `section` of its own — the sheet covers whatever is
      underneath — but it is reached from Build, and resuming onto Home with a
      workout sheet over it is not a state the app ever produces naturally.
    */
    section: step.section ?? (snapshot ? "build" : null),
    sheet: IN_MORE_SHEET.has(step.id) ? "more" : null,
    instance: instanceFor(step),
    rehearsal: snapshot,
  };
}

/**
 * Which instance of a repeated control this step means.
 *
 * The rehearsal mints its ids deterministically, so the step can name the one
 * it is talking about without anything being persisted — `rehearsal-set-1` is
 * the first set of a reconstructed rehearsal by construction, not by luck.
 */
function instanceFor(step: TourStep): string | null {
  switch (step.id) {
    case "set-row":
      return "log-set-rehearsal-movement-1";
    case "rpe":
    case "set-style":
      return "meta-rehearsal-movement-1";
    case "last-time":
      return "rehearsal-movement-1";
    default:
      return null;
  }
}

/**
 * Rebuild the rehearsal to the shape a step needs. In memory, every time.
 *
 * Takes a fresh store rather than mutating a running one: resuming is starting
 * over from a known point, and reusing whatever happened to be there is how a
 * resumed lesson ends up with four movements in it.
 */
export function seedRehearsal(snapshot: RehearsalSnapshot, startedAt: string): RehearsalStore {
  const store = createStore(startedAt);

  for (let m = 0; m < snapshot.movements; m++) {
    store.counter++;
    store.exercises.push({
      id: `rehearsal-movement-${m + 1}`,
      exerciseId: `rehearsal-movement-${m + 1}`,
      // Not a real movement name. Inventing "Bench press" would put a specific
      // claim on screen that the member never made.
      name: "Your movement",
      position: m,
      sets: [],
    });
  }

  const last = store.exercises[store.exercises.length - 1];
  if (last) {
    for (let s = 0; s < snapshot.sets; s++) {
      store.counter++;
      last.sets.push({
        id: `rehearsal-set-${s + 1}`,
        sessionExerciseId: last.id,
        weight: 100,
        reps: 8,
        // Left unknown, exactly as a real unlogged set is. Reconstructing an
        // RPE would contradict the lesson the member is about to be given.
        rpe: null,
        setStyle: null,
        toFailure: false,
        position: s,
      });
    }
  }

  return store;
}

export const RESUME_LAST_TIME = REHEARSAL_LAST_TIME;

// ── Recovering from a tour that has changed underneath somebody ──────────

export type Recovery =
  | { kind: "exact"; index: number }
  /** The saved step is gone. Resumed at the start of the lesson it belonged to. */
  | { kind: "checkpoint"; index: number; reason: string }
  /** Nothing recognisable. Start over rather than declare it done. */
  | { kind: "restart"; reason: string };

/**
 * Where to put somebody whose saved step no longer exists.
 *
 * Tours get edited. A step is renamed, split, or removed, and a member who was
 * paused on it comes back to a walkthrough that has never heard of where they
 * were. The two obvious outcomes are both wrong: trapping them on a step that
 * cannot be resolved, and quietly marking the tour complete so they are never
 * taught the parts they had not reached.
 *
 * So it falls back to the start of the objective they were in the middle of —
 * they repeat a lesson rather than losing one — and the reason is returned so
 * it can be logged rather than guessed at later.
 */
export function recoverStep(progress: TourProgress | null, tour: GuidedTour): Recovery {
  if (!progress?.stepId) return { kind: "restart", reason: "no saved step" };

  const exact = tour.steps.findIndex((s) => s.id === progress.stepId);
  if (exact !== -1) return { kind: "exact", index: exact };

  /*
    The saved step is gone. Its objective may still exist — it is the human
    unit of the walkthrough and survives steps being split or renamed — so
    resume at the first step of the first objective they had not finished.
  */
  const done = new Set(progress.completed);
  const firstUnfinished = tour.steps.findIndex((s) => !done.has(s.id));
  if (firstUnfinished !== -1) {
    const objective = tour.steps[firstUnfinished].objective;
    const start = objective
      ? tour.steps.findIndex((s) => s.objective === objective)
      : firstUnfinished;
    return {
      kind: "checkpoint",
      index: start === -1 ? firstUnfinished : start,
      reason: `step "${progress.stepId}" no longer exists in ${tour.id} v${tour.version}`,
    };
  }

  return {
    kind: "restart",
    reason: `step "${progress.stepId}" is gone and every current step is already recorded complete`,
  };
}
