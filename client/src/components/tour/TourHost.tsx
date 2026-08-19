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
import { SAKRED_INTRO, roleTours } from "@/lib/tour/sakredIntro";
import { restoreSpecFor } from "@/lib/tour/restore";
import { replayRequest } from "@/lib/tour/rollout";
import type { StartConditions } from "@/lib/tour/engine";

export function TourHost({
  conditions,
  role,
}: {
  conditions: StartConditions;
  /** What this account *is*. Null for an ordinary member. */
  role?: string | null;
}) {
  /*
    Read once per mount rather than watched. A member cannot turn this on
    mid-session — it is a URL flag — and re-reading it every render would put a
    storage access in the render path of the busiest screen in the app.
  */
  const replaying = replayRequest();
  const universal = useGuidedTour(SAKRED_INTRO, conditions, !!replaying, replaying?.from ?? null);

  /*
    The role extension, after the universal one and never beside it.

    `ROLE_TOURS` and `SAKRED_COACH_INTRO` were written, exported and mounted
    nowhere — the fourth module this cycle that existed without ever executing.
    A coach has been finishing the member walkthrough and never being shown
    where their workspace is.

    Held back by the same condition the engine already understands rather than
    by a second flag: while the universal walkthrough is on screen, the app is
    not ready for another one. That keeps this to one line and keeps the
    ordering impossible to get wrong.
  */
  const roleTour = roleTours(role)[0] ?? null;
  const extension = useGuidedTour(
    roleTour ?? SAKRED_INTRO,
    { ...conditions, homeReady: conditions.homeReady && !universal && !!roleTour },
    !!replaying && !universal && !!roleTour,
    null,
  );

  const running = universal ?? (roleTour ? extension : null);
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
