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
} from "@/lib/tour/engine";
import { readProgress, writeProgress } from "@/lib/tour/progress";
import type { GuidedTour, TourAnchor, TourProgress, TourWorld } from "@/lib/tour/types";

export const TOUR_SECTION_ATTR = "data-tour-section";

/** Called by the dashboard when its section changes. One line, no props. */
export function publishTourSection(section: string | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (section) root.setAttribute(TOUR_SECTION_ATTR, section);
  else root.removeAttribute(TOUR_SECTION_ATTR);
}

function anchorPresent(anchor: TourAnchor): boolean {
  return !!document.querySelector(`[data-tour-id="${anchor}"]`);
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

export function useGuidedTour(tour: GuidedTour, conditions: StartConditions): RunningTour | null {
  const [progress, setProgress] = useState<TourProgress | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [world, setWorld] = useState<TourWorld>({ section: null, present: new Set(), waitedMs: 0 });

  const tapped = useRef(false);
  const stepStartedAt = useRef(0);

  /*
    Start once, and only once.

    `index === null` is the guard rather than a separate "started" flag: the
    tour is running exactly when there is a step to be on. Re-running this
    effect when a condition flips — health finishing its sync, say — must not
    restart a walkthrough already in progress.
  */
  useEffect(() => {
    if (index !== null) return;
    const stored = readProgress(tour);
    if (!mayAutoStart(stored, tour, conditions)) return;
    const at = resumeAt(stored, tour);
    if (at >= tour.steps.length) return;
    setProgress(stored ?? emptyProgress(tour));
    setIndex(at);
    stepStartedAt.current = performance.now();
  }, [tour, conditions, index]);

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
    const watched: TourAnchor[] = [];
    if (step.anchor) watched.push(step.anchor);
    if ("anchor" in step.advance) watched.push(step.advance.anchor);

    const tick = () => {
      const present = new Set<TourAnchor>();
      for (const a of watched) if (anchorPresent(a)) present.add(a);
      setWorld({
        section: document.documentElement.getAttribute(TOUR_SECTION_ATTR),
        present,
        waitedMs: performance.now() - stepStartedAt.current,
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const goTo = useCallback(
    (next: number) => {
      tapped.current = false;
      stepStartedAt.current = performance.now();
      setIndex(next);
    },
    [],
  );

  const advance = useCallback(() => {
    if (index === null || !progress) return;
    const updated = complete(progress, tour, index, new Date().toISOString());
    setProgress(updated);
    writeProgress(updated);
    if (index + 1 >= tour.steps.length) setIndex(null);
    else goTo(index + 1);
  }, [index, progress, tour, goTo]);

  const skip = useCallback(() => {
    if (index === null) return;
    if (index + 1 >= tour.steps.length) setIndex(null);
    else goTo(index + 1);
  }, [index, goTo]);

  const pause = useCallback(() => {
    if (index === null || !progress) return;
    const held = pauseAt(progress, tour, index);
    setProgress(held);
    writeProgress(held);
    setIndex(null);
  }, [index, progress, tour]);

  const markTapped = useCallback(() => {
    tapped.current = true;
  }, []);

  const resolution = useMemo(() => (step ? resolve(step, world) : null), [step, world]);

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
    if (resolution.kind !== "ready") return;
    if (isSatisfied(step.advance, world, tapped.current)) advance();
  }, [resolution, step, world, advance, skip]);

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
