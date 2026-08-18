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

import { readFileSync, readdirSync } from "node:fs";
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
      Every anchor written on a component reaches the DOM.

      `<Panel data-tour-id="build-today">` compiled, passed the placement grep,
      and produced no element: TypeScript permits unknown hyphenated JSX
      attributes on components, and `Panel` accepted a fixed prop list and
      dropped it. The walkthrough waited twelve seconds for a card that was on
      screen the whole time, under a heading the member could read.

      That is the exact failure this gate list exists to stop being summarised
      away — "26/26 anchors placed" was true of the source and false of the
      product. So an anchor on a capitalised tag is only counted if the
      component it names declares the prop.
    */
    "anchors on components are forwarded, not swallowed": componentAnchors().every((a) => a.forwarded),

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


/**
 * Anchors written on a React component rather than an intrinsic element, and
 * whether that component actually accepts the prop.
 *
 * Resolved by finding the component's own definition and looking for the prop
 * name in it. Crude on purpose: the alternative is a type-level check that
 * TypeScript has already declined to perform, and a browser check that cannot
 * run in `npm test`. A component that mentions `data-tour-id` anywhere in its
 * source is one somebody has thought about.
 */
export function componentAnchors(): { tag: string; anchor: string; file: string; forwarded: boolean }[] {
  const out: { tag: string; anchor: string; file: string; forwarded: boolean }[] = [];
  const files = walk("client/src");

  /* Where each component is defined, by name. */
  const defined = new Map<string, string>();
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/(?:export\s+)?(?:const|function)\s+([A-Z][A-Za-z0-9_]*)\s*[=(<]/g)) {
      if (!defined.has(m[1])) defined.set(m[1], file);
    }
  }

  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_.]*)([^>]*?)data-tour-id="([a-z-]+)"/g)) {
      const [, rawTag, , anchor] = m;
      const tag = rawTag.split(".")[0];
      const where = defined.get(tag);
      out.push({ tag, anchor, file, forwarded: !!where && accepts(read(where), tag) });
    }
  }
  return out;
}


/**
 * Whether a component's own definition would let `data-tour-id` through.
 *
 * Two ways it can: it names the prop explicitly, or it spreads the rest of its
 * props onto an element. Both are real forwarding; a component that does
 * neither has a closed prop list and will drop the attribute in silence.
 *
 * The definition is read from its name to the start of the next top-level
 * declaration, so a spread belonging to a different component in the same file
 * cannot vouch for this one.
 */
function accepts(raw: string, tag: string): boolean {
  /*
    Comments stripped first. The component that prompted this gate carries a
    paragraph explaining why it forwards the attribute, and a check that greps
    the file finds that paragraph and passes whether or not the line under it
    still exists. A guard vouched for by its own documentation is not a guard —
    the same trap the media privacy test had to be taught to avoid.
  */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const start = src.search(new RegExp(`(?:export\\s+)?(?:const|function)\\s+${tag}\\s*[=(<]`));
  if (start < 0) return false;
  const after = src.slice(start + 1);
  const next = after.search(/\n(?:export\s+)?(?:const|function)\s+[A-Z]/);
  const body = next < 0 ? after : after.slice(0, next);
  return /data-tour-id/.test(body) || /\{\s*\.\.\.props\s*\}/.test(body);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
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
