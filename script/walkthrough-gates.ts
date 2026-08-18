/**
 * What has to be true before the walkthrough may take a member's screen.
 *
 * ── Why the list lives here and not inside a test ─────────────────────────
 *
 * Two things consult it and they want opposite behaviour. During construction
 * `npm test` should *report* an unmet gate — failing the suite for work that is
 * honestly outstanding trains people to run it with a flag, and then the
 * assertions that matter stop being run at all. At rollout it must *fail*,
 * loudly, because a mandatory half-proven tutorial is the worst thing this
 * feature can become.
 *
 * One definition, two readers. Duplicating the list would let them disagree,
 * and the one that disagrees quietly is the one guarding production.
 */

import { readFileSync } from "node:fs";
import { AUTO_START_ENABLED } from "../client/src/lib/tour/rollout.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";
import { TOUR_ANCHORS } from "../client/src/lib/tour/types.js";

const read = (p: string) => readFileSync(p, "utf8");

export type Gates = Record<string, boolean>;

export function walkthroughGates(placed: ReadonlySet<string>, pending: number): Gates {
  const overlay = read("client/src/components/tour/GuidedTourOverlay.tsx");
  const intro = read("client/src/lib/tour/sakredIntro.ts");
  const pkg = read("package.json");
  const teaches = (needle: RegExp) => needle.test(intro);

  const unaccounted = TOUR_ANCHORS.filter((a) => !placed.has(a));

  return {
    /*
      Derived, never pinned. The Atmosphere step took this from 25 to 26 and a
      hardcoded number would have quietly stopped covering the new one.
    */
    "every anchor placed": pending === 0 && unaccounted.length === 0,
    "visible-instance resolver in use":
      /resolveTarget\(/.test(overlay) && !/querySelector\(`\[data-tour-id/.test(overlay),
    "rehearsal zero-write proven": /test-rehearsal/.test(pkg),
    "rehearsal barrier scoped to the workout":
      SAKRED_INTRO.steps.filter((s) => s.rehearsal === "begin").length === 1 &&
      SAKRED_INTRO.steps.filter((s) => s.rehearsal === "end").length === 1,
    "resume reconstructs route, section and rehearsal": /test-resume/.test(pkg),

    /*
      No enabled control that answers a tap with silence.

      The overlay used to render Continue during the wait for a lesson's
      subject. Pressing it did nothing — there was nothing yet to continue
      from — and a member on that evidence concludes the app is broken. The
      gate is the shape of the condition rather than a runtime probe: the
      Continue must be excluded while `waiting`, and the only other way to
      reach it must be `degraded`, which is the bounded give-up.
    */
    "no dead enabled tutorial control":
      /\{\(\(explanatory && !waiting\) \|\| degraded\) && \(/.test(overlay) &&
      /const waiting = resolution\.kind === "waiting"/.test(overlay) &&
      /const degraded = resolution\.kind === "degraded"/.test(overlay),

    /*
      And a lesson that was skipped is not counted as one that was taught.

      The degraded escape carries its own label and its own event. Without
      both, a run that reached the end past three lessons whose subject never
      rendered would report as a clean 26/26 — which is exactly the summary
      this gate exists to stop being written.
    */
    "a degraded lesson is distinguishable from a taught one":
      /Continue for now/.test(overlay) &&
      /tour\.step_degraded/.test(overlay) &&
      /"tour\.step_degraded"/.test(read("shared/models/telemetry.ts")),
    "intelligence-loop copy complete":
      teaches(/whole terrain/i) &&
      teaches(/don't get the final vote/i) &&
      teaches(/what that effort cost/i) &&
      teaches(/Restore creates room/i) &&
      teaches(/useful demand when the terrain can support it/i) &&
      teaches(/map behind the signals/i) &&
      teaches(/Your rhythm with Sakred/i),
  };
}

/** Anchors that appear as a literal `data-tour-id="…"` anywhere in the client. */
export function placedAnchors(grepOutput: string): Set<string> {
  return new Set(
    grepOutput
      .split("\n")
      .map((l) => l.match(/data-tour-id="([a-z-]*)"/)?.[1])
      .filter((v): v is string => !!v),
  );
}

export { AUTO_START_ENABLED, TOUR_ANCHORS };
