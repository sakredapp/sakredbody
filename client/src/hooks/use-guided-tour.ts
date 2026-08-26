/**
 * The running walkthrough: engine, storage and the live application, joined.
 *
 * ── How the tour sees the app ─────────────────────────────────────────────
 *
 * Through the DOM, deliberately. The alternative is threading tour state into
 * MemberDashboard, the nav, the workout sheet and the More menu — twenty props
 * whose only job is to tell a tutorial something it could have looked at. That
 * couples every screen to a feature most members see once.
 *
 * Instead the dashboard writes its section to `data-tour-section` on the
 * document element, one effect, and everything else is already identified by
 * `data-tour-id` because that is how targets are named anyway. The tour reads
 * both. Nothing else in the app has to know it exists.
 *
 * ── Why it polls ──────────────────────────────────────────────────────────
 *
 * At most two selector lookups per frame — the step's own anchor and the one
 * its completion condition names. A MutationObserver over the whole document
 * would fire on every animation frame of the constellation canvas, which is a
 * worse deal than two `querySelector` calls.
 *
 * The poll is also what makes `waitedMs` honest: a step that has been looking
 * for a card for six seconds has genuinely been looking for six seconds, rather
 * than having missed a single mutation and waited forever.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type Resolution,
  type StartConditions,
  complete,
  emptyProgress,
  isSatisfied,
  objectives as deriveObjectives,
  pause as pauseAt,
  resolve,
  resumeAt,
  mayAutoStart,
  shouldStart,
} from "@/lib/tour/engine";
import { readProgress, writeProgress } from "@/lib/tour/progress";
import { resolveTarget } from "@/lib/tour/resolveTarget";
import { beginRehearsal, endRehearsal } from "@/lib/tour/rehearsal";
import { restoreSpecFor, seedRehearsal } from "@/lib/tour/restore";
import { clearStage, requestStage } from "@/lib/tour/stage";
import { queryClient } from "@/lib/queryClient";
import type { GuidedTour, TourAnchor, TourProgress, TourWorld } from "@/lib/tour/types";

export const TOUR_SECTION_ATTR = "data-tour-section";

/** What a step that has not been measured yet has seen. */
const EMPTY: ReadonlySet<TourAnchor> = new Set();

/** Called by the dashboard when its section changes. One line, no props. */
export function publishTourSection(section: string | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (section) root.setAttribute(TOUR_SECTION_ATTR, section);
  else root.removeAttribute(TOUR_SECTION_ATTR);
}

/**
 * Present means *usable*, not merely in the document.
 *
 * This asked `querySelector`, and the overlay asked `resolveTarget`, so the
 * two halves of the walkthrough could disagree about whether a step had its
 * subject. On a wide screen the phone navigation is still rendered and
 * `display: none`: the engine called the More lesson ready, the overlay could
 * not resolve anything to spotlight, and the step sat there — no highlight, no
 * degrade, no way forward, forever. The walkthrough could not be finished in a
 * browser at all.
 *
 * `anyInstance` because presence is not a question about which one: it asks
 * whether there is at least one the member could look at. Ambiguity between
 * two visible instances is a question for the step's own targeting, and
 * answering "absent" here would be a different lie.
 */
function anchorPresent(anchor: TourAnchor): boolean {
  return resolveTarget({ anchor, needsInteraction: false, anyInstance: true }).ok;
}

export type RunningTour = {
  resolution: Resolution;
  objectives: ReturnType<typeof deriveObjectives>;
  stepNumber: number;
  stepCount: number;
  advance: () => void;
  pause: () => void;
  markTapped: () => void;
};

export function useGuidedTour(
  tour: GuidedTour,
  conditions: StartConditions,
  /*
    Replay and QA bypass the rollout question entirely: the member asked for
    this one, so "is the product ready to require it" does not apply. The
    preconditions still do — a walkthrough started over skeletons is just as
    broken when somebody asked for it.
  */
  forced = false,
  /**
   * Which lesson a replay begins at. Null is the beginning.
   *
   * Only consulted when `forced`, because it is a request the member made from
   * the help portal — "show me the Build chapter again" — and not something the
   * engine should ever decide for itself.
   */
  replayFrom: string | null = null,
): RunningTour | null {
  const [progress, setProgress] = useState<TourProgress | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  /**
   * The world, and which step it describes.
   *
   * The step id travels *with* the measurement rather than beside it, because
   * every consumer needs the same guard and any one of them forgetting it is a
   * silent bug. Two already happened:
   *
   *   · `close-workout` completed itself from the previous step's readings,
   *     skipping the lesson whose whole instruction is to make something
   *     disappear;
   *   · a member who read one lesson for more than six seconds had the *next*
   *     one skipped — `waitedMs` from the step they had been reading was
   *     already past the give-up bound, so an optional step was dropped and a
   *     required one degraded, both before anybody had looked for the target.
   *     The health lesson was unreachable in every run that read Terrain
   *     properly, which is every run by a human being.
   */
  const [world, setWorld] = useState<TourWorld & { stepId: string | null }>({
    section: null,
    present: new Set(),
    loading: false,
    seen: new Set(),
    waitedMs: 0,
    stepId: null,
  });

  const tapped = useRef(false);
  const stepStartedAt = useRef(0);

  /**
   * How many reads the application has in flight, kept current without
   * re-rendering the tour.
   *
   * `useIsFetching()` is the obvious call and the wrong one here: it
   * re-renders its subscriber every time any query in the app starts or
   * settles, and this hook drives the walkthrough for the whole session.
   * Subscribing to the cache and writing a ref costs nothing per frame and
   * nothing per fetch.
   */
  const queries = useQueryClient();
  const fetching = useRef(0);
  useEffect(() => {
    const read = () => {
      fetching.current = queries
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.fetchStatus === "fetching").length;
    };
    read();
    return queries.getQueryCache().subscribe(read);
  }, [queries]);

  /*
    Start once, and only once.

    `index === null` is the guard rather than a separate "started" flag: the
    tour is running exactly when there is a step to be on. Re-running this
    effect when a condition flips — health finishing its sync, say — must not
    restart a walkthrough already in progress.
  */
  /**
   * Whether this mount has already run the walkthrough to its end.
   *
   * A replay writes no progress — correctly, since reviewing the app is not
   * un-learning it — which removed the only thing that had been stopping the
   * start effect from firing again the moment the tour finished. It restarted
   * from welcome, forever. Found by a driver that walked 32 lessons through a
   * 26-lesson walkthrough.
   */
  const finished = useRef(false);

  useEffect(() => {
    if (index !== null || finished.current) return;
    const stored = readProgress(tour);
    if (!(forced ? shouldStart(stored, tour, conditions) : mayAutoStart(stored, tour, conditions))) return;

    /*
      A replay starts where it was asked to and leaves the record alone.

      Somebody reviewing the Build chapter for the second time has not
      un-learned the app, and a replay that rewrote their progress would take a
      completed walkthrough and leave it looking half-finished — or, worse,
      mark a required version complete that they never actually walked. See
      `replay` in the engine, which exists to say exactly this.
    */
    const asked = forced && replayFrom ? tour.steps.findIndex((s) => s.id === replayFrom) : -1;
    const at = asked >= 0 ? asked : forced ? 0 : resumeAt(stored, tour);
    if (at >= tour.steps.length) return;
    setProgress(forced ? emptyProgress(tour) : stored ?? emptyProgress(tour));
    setIndex(at);
    stepStartedAt.current = performance.now();

    /*
      Put the app where the lesson happens, before the lesson opens.

      Resuming at step fifteen and leaving the member on Home means a panel
      explaining RPE over a screen with no sets on it — nothing errors, it is
      simply nonsense, and interruption on a phone is not an edge case. The
      spec for every step has existed in `restore.ts` since the walkthrough was
      written; until now nothing read it.

      The rehearsal is *reconstructed*, never restored: `seedRehearsal` builds
      the movement and the logged set from seven lines of script, in memory, so
      an app kill during the workout lesson still writes nothing.
    */
    const spec = restoreSpecFor(tour.steps[at]);
    if (spec.rehearsal) {
      beginRehearsal(new Date().toISOString(), undefined, seedRehearsal(spec.rehearsal, new Date().toISOString()));
      /*
        And tell the app to look again.

        The open-workout query is asked on load, so by the time a resumed
        walkthrough installs the barrier the answer "nothing is open" is either
        already cached or already in flight — and an in-flight one lands *after*
        the barrier with the pre-barrier answer, which is the version of this
        that looks intermittent. Cancelled first, then reset, so the question is
        asked again through the boundary rather than remembered from before it.
      */
      void queryClient
        .cancelQueries({ queryKey: ["/api/training/sessions/open"] })
        .then(() => queryClient.resetQueries({ queryKey: ["/api/training/sessions/open"] }));
    }
    requestStage({ section: spec.section, sheet: spec.sheet, workout: spec.workout });
  }, [tour, conditions, index, forced, replayFrom]);

  const step = index === null ? null : tour.steps[index] ?? null;

  /*
    The world, once per frame.

    `performance.now()` rather than a counter, because the clock keeps running
    while the tab is backgrounded and rAF does not. A member who took a phone
    call mid-step comes back to a step that has already given up waiting and
    offers them a Continue — which is the right outcome, and a frame counter
    would instead have them staring at "One moment…" forever.
  */
  useEffect(() => {
    if (!step) return;
    let frame = 0;
    /** Everything this step has ever had on screen. Reset with the step. */
    const seen = new Set<TourAnchor>();
    const watched: TourAnchor[] = [];
    if (step.anchor) watched.push(step.anchor);
    if ("anchor" in step.advance) watched.push(step.advance.anchor);

    const tick = () => {
      const present = new Set<TourAnchor>();
      for (const a of watched) {
        if (!anchorPresent(a)) continue;
        present.add(a);
        seen.add(a);
      }
      setWorld({
        section: document.documentElement.getAttribute(TOUR_SECTION_ATTR),
        present,
        seen: new Set(seen),
        waitedMs: performance.now() - stepStartedAt.current,
        /*
          Read from a ref the query client keeps current rather than from a
          hook here: this runs on every animation frame, and subscribing the
          whole tour to every fetch in the app would re-render it at the rate
          the app fetches.
        */
        loading: fetching.current > 0,
        stepId: step.id,
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  /*
    The rehearsal barrier, opened and closed by the steps that say so.

    `beginRehearsal` and `endRehearsal` were written, tested in isolation, and
    never called from anywhere in the app. The consequence was not subtle: the
    workout lesson says "Nothing in here is recorded — this one's a rehearsal"
    and then created a real session, added real movements to it, and left it
    open on the member's account. Every QA run had to delete one afterwards,
    which is how it was found.

    The gate that was supposed to cover this checked that the rehearsal *test*
    was in the npm script. It proved the router's logic and said nothing about
    whether the router was installed — the same shape as the tour anchor that
    existed in the JSX and never in the DOM.

    Started as an effect keyed on the step so it runs after render, and torn
    down on unmount so that pausing, navigating away, closing the sheet or
    throwing all bring the barrier down. `endRehearsal` is idempotent and safe
    to call when nothing is running.
  */
  useEffect(() => {
    if (step?.rehearsal === "begin") beginRehearsal(new Date().toISOString());
    else if (step?.rehearsal === "end") endRehearsal();
  }, [step]);

  useEffect(() => () => {
    endRehearsal();
    clearStage();
  }, []);

  const goTo = useCallback(
    (next: number) => {
      tapped.current = false;
      stepStartedAt.current = performance.now();
      setIndex(next);
    },
    [],
  );

  /**
   * The last index an advance was accepted from.
   *
   * Two taps on Continue in quick succession both ran against the same closed-
   * over `index` and moved the walkthrough two steps — a lesson skipped, and
   * one the member is never offered again. Measured in the browser rather than
   * reasoned about: the QA harness dispatches two real clicks and asserts the
   * step index moved by exactly one.
   *
   * A ref rather than state because the second tap can arrive before React has
   * re-rendered, which is precisely the window the bug lived in.
   */
  const advancedFrom = useRef<number | null>(null);

  /*
    There was a second guard here: reject any advance within 350ms of the last
    one. It was measured against the wrong event and rejected a real tap.

    A member taking one physical double-tap produces two clicks about *one
    millisecond* apart — measured, not guessed; see script/qa-input.ts. A member
    reading the next lesson and pressing Continue produces one click a few
    hundred milliseconds later. A window drawn between those two on the clock
    since the *previous advance* has to be large enough to cover the first and
    therefore large enough to swallow the second, which is exactly what
    happened: the walkthrough's own driver had its first Continue on every step
    ignored, and a member who taps promptly would have had the same experience
    with no way to know why.

    The distinguishing fact is not how long since the last advance. It is how
    long the control being pressed has existed — the ghost tap lands on a button
    that mounted a millisecond ago, under a finger that was already coming down
    for the previous one. That is guarded where the button is, in
    GuidedTourOverlay, and it does not need to know anything about time since
    the last step.
  */
  const advance = useCallback(() => {
    if (index === null || !progress) return;
    if (advancedFrom.current === index) return;
    advancedFrom.current = index;
    const updated = complete(progress, tour, index, new Date().toISOString());
    setProgress(updated);
    if (!forced) writeProgress(updated);
    if (index + 1 >= tour.steps.length) {
      finished.current = true;
      setIndex(null);
    } else goTo(index + 1);
  }, [index, progress, tour, goTo, forced]);

  const skip = useCallback(() => {
    if (index === null) return;
    if (index + 1 >= tour.steps.length) {
      finished.current = true;
      setIndex(null);
    } else goTo(index + 1);
  }, [index, goTo, tour]);

  const pause = useCallback(() => {
    if (index === null || !progress) return;
    const held = pauseAt(progress, tour, index);
    setProgress(held);
    if (!forced) writeProgress(held);
    finished.current = true;
    setIndex(null);
  }, [index, progress, tour, forced]);

  const markTapped = useCallback(() => {
    tapped.current = true;
  }, []);

  /** Whether the readings in `world` are about the step being judged. */
  const measured = !!step && world.stepId === step.id;

  /*
    A step is resolved against its own measurements or against none.

    For the render after a step change the frame loop has not run yet, and the
    previous step's readings would answer questions about this one — including
    "has this been waiting long enough to give up on", which is how a lesson
    was skipped before anything had looked for its subject. An unmeasured step
    has waited no time and seen nothing, which is the truth.
  */
  const resolution = useMemo(
    () =>
      step
        ? resolve(step, measured ? world : { section: world.section, present: EMPTY, seen: EMPTY, waitedMs: 0, loading: world.loading })
        : null,
    [step, world, measured],
  );

  /*
    Advancement, as an effect rather than inside the frame loop.

    Both `skip` and `advance` set state, and doing that from inside the rAF
    callback means a step can be advanced twice before React has re-rendered —
    which shows up as the walkthrough jumping two lessons on a fast phone and
    one on a slow one. Reacting to the resolved state instead makes it happen
    exactly once per step.
  */
  useEffect(() => {
    if (!resolution || !step) return;
    if (resolution.kind === "skip") {
      skip();
      return;
    }

    /*
      The advance condition is the contract; the anchor is only what the
      overlay points at.

      `close-workout` points at the close button and completes when the set row
      is gone. Tapping close removes both — so the step's own anchor vanished,
      `resolve` reported "waiting", and the check below never ran. The member
      did exactly what was asked and the walkthrough stopped, forever, on a
      lesson whose whole instruction is to make something disappear.

      So satisfaction is tested first. A step that has been completed is
      complete whether or not the thing it was pointing at is still on screen.
    */
    if (measured && isSatisfied(step.advance, world, tapped.current)) {
      advance();
      return;
    }

    if (resolution.kind !== "ready") return;
  }, [resolution, step, world, measured, advance, skip]);

  if (index === null || !step || !resolution) return null;

  return {
    resolution,
    objectives: deriveObjectives(tour, new Set(progress?.completed ?? [])),
    stepNumber: index + 1,
    stepCount: tour.steps.length,
    advance,
    pause,
    markTapped,
  };
}
