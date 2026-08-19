/**
 * The walkthrough, actually on screen.
 *
 * Deliberately thin. Everything it does is decided elsewhere — the engine picks
 * the step, the resolver picks the element, the overlay draws it — so this is
 * only the wire between the dashboard and those, plus the one decision that is
 * genuinely local: whether to be here at all.
 *
 * Today that answer is "only for QA and replay". `mayAutoStart` is false while
 * rollout is off, so the tour would never start on its own; this mounts on an
 * explicit per-device flag instead, which is how the feature gets exercised on
 * real phones before it is required of anybody.
 */

import { GuidedTourOverlay } from "@/components/tour/GuidedTourOverlay";
import { useGuidedTour } from "@/hooks/use-guided-tour";
import { SAKRED_INTRO } from "@/lib/tour/sakredIntro";
import { restoreSpecFor } from "@/lib/tour/restore";
import { replayRequest } from "@/lib/tour/rollout";
import type { StartConditions } from "@/lib/tour/engine";

export function TourHost({ conditions }: { conditions: StartConditions }) {
  /*
    Read once per mount rather than watched. A member cannot turn this on
    mid-session — it is a URL flag — and re-reading it every render would put a
    storage access in the render path of the busiest screen in the app.
  */
  const replaying = replayRequest();
  const running = useGuidedTour(SAKRED_INTRO, conditions, !!replaying, replaying?.from ?? null);

  if (!running) return null;

  return (
    <GuidedTourOverlay
      resolution={running.resolution}
      instance={restoreSpecFor(running.resolution.step).instance}
      objectives={running.objectives}
      stepNumber={running.stepNumber}
      stepCount={running.stepCount}
      onContinue={running.advance}
      onPause={running.pause}
      onTargetTap={running.markTapped}
    />
  );
}
