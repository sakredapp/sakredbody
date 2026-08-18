/**
 * Which of these is the button the member can actually see.
 *
 * ── Why `querySelector` had to go ─────────────────────────────────────────
 *
 * It returns the first match in document order, and document order is not a
 * fact about the interface — it is a fact about how somebody happened to nest
 * the markup. Two cases break it, and both are ordinary in this codebase:
 *
 *   · **Responsive duplicates.** A control rendered twice, once for a phone and
 *     once for a wider layout, with one of them `display: none`. The hidden one
 *     is frequently first, and a hidden element still has a bounding rect —
 *     `{0,0,0,0}` — so the spotlight is drawn as a point in the top-left corner
 *     of the screen while the member looks at a button in the middle of it.
 *
 *   · **Repeated controls.** Every set in a workout has its own RPE control.
 *     "The first RPE" is not a thing the tutorial means; it means *this* set's,
 *     and which set that is changes as the member logs.
 *
 * So targeting resolves every candidate and chooses among them, and when it
 * cannot choose it says why rather than returning null and leaving the overlay
 * to guess.
 *
 * ── Why the choosing is pure ──────────────────────────────────────────────
 *
 * `chooseCandidate` takes plain descriptions, not elements. The interesting
 * cases — a hidden desktop twin, four visible set rows, a control inside a
 * closed sheet — are then testable without a browser, which matters because
 * they are exactly the cases nobody reproduces by hand.
 */

import type { TourAnchor } from "./types";

/** What the DOM told us about one element carrying the anchor. */
export type Candidate = {
  /** `data-tour-instance`, when the control is one of several like it. */
  instance: string | null;
  connected: boolean;
  /** `display: none`, `visibility: hidden`, `content-visibility`, `hidden`. */
  rendered: boolean;
  /** Fully transparent counts as invisible — it cannot be looked at. */
  opacity: number;
  width: number;
  height: number;
  /** `disabled`, `aria-disabled`, or inside an `inert` subtree. */
  interactive: boolean;
  /** Overlaps the viewport as it stands, before any scrolling. */
  inViewport: boolean;
};

export type TargetFailure =
  /** Nothing on the page carries this anchor at all. */
  | "absent"
  /** Present, but every instance is hidden — a closed sheet, the other layout. */
  | "hidden"
  /** Visible, but not usable, and this step needs the member to press it. */
  | "disabled"
  /** The step named an instance and no visible candidate carries it. */
  | "instance-gone"
  /**
   * Several genuinely distinct controls, and the step did not say which.
   *
   * Deliberately a failure rather than a guess. Guessing here means the
   * spotlight lands on set two while the panel explains set one, and the member
   * types into the wrong row — which reads as the tutorial being broken and is
   * indistinguishable from the app being broken.
   */
  | "ambiguous";

export type TargetResolution =
  | { ok: true; index: number; scrollNeeded: boolean }
  | { ok: false; reason: TargetFailure; candidates: number };

export type TargetRequest = {
  anchor: TourAnchor;
  /** Which one, when there are several. */
  instance?: string | null;
  /** Whether the member has to press it, as opposed to merely look at it. */
  needsInteraction: boolean;
  /**
   * The step means "any of these", and says so.
   *
   * Different instances normally mean different controls, and a step that has
   * not said which one is a step with a bug — reporting that is more useful
   * than picking one. But some lessons genuinely invite a free choice: "open
   * one territory, anything that interests you" is nine equally correct
   * answers, and demanding the step name one would be demanding it lie about
   * what it is teaching.
   *
   * So the exception is declared by the step rather than inferred, and the
   * ambiguity rule still protects every step that has not declared it.
   */
  anyInstance?: boolean;
};

const visible = (c: Candidate) =>
  c.connected && c.rendered && c.opacity > 0.05 && c.width > 0 && c.height > 0;

export function chooseCandidate(
  candidates: readonly Candidate[],
  request: TargetRequest,
): TargetResolution {
  if (candidates.length === 0) return { ok: false, reason: "absent", candidates: 0 };

  const shown = candidates.map((c, i) => ({ c, i })).filter(({ c }) => visible(c));
  if (shown.length === 0) return { ok: false, reason: "hidden", candidates: candidates.length };

  /*
    Instance first, and before the interaction filter.

    A named instance is the step being specific, and it should win over every
    heuristic below it. If the named one is present but disabled, the honest
    answer is "disabled" — not "here is a different set's control", which is
    what falling back to the general case would produce.
  */
  let pool = shown;
  if (request.instance) {
    const matched = shown.filter(({ c }) => c.instance === request.instance);
    if (matched.length === 0) {
      return { ok: false, reason: "instance-gone", candidates: shown.length };
    }
    pool = matched;
  }

  if (request.needsInteraction) {
    const usable = pool.filter(({ c }) => c.interactive);
    if (usable.length === 0) return { ok: false, reason: "disabled", candidates: pool.length };
    pool = usable;
  }

  if (pool.length === 1) {
    return { ok: true, index: pool[0].i, scrollNeeded: !pool[0].c.inViewport };
  }

  /*
    More than one survivor.

    If they all carry the same instance — or none carries one at all — they are
    the same logical control rendered more than once and any of them will do;
    prefer one already on screen so the tutorial does not scroll for no reason.

    If they carry *different* instances, they are different controls and the
    step has not said which. That is the step's bug, and reporting it is more
    useful than picking one.
  */
  const instances = new Set(pool.map(({ c }) => c.instance));
  if (instances.size > 1 && !request.anyInstance) {
    return { ok: false, reason: "ambiguous", candidates: pool.length };
  }

  const onScreen = pool.find(({ c }) => c.inViewport);
  const pick = onScreen ?? pool[0];
  return { ok: true, index: pick.i, scrollNeeded: !pick.c.inViewport };
}

// ── The DOM half ─────────────────────────────────────────────────────────

/**
 * Describe one element the way `chooseCandidate` needs to hear about it.
 *
 * `getComputedStyle` rather than inspecting classes: a control can be hidden by
 * a media query, a parent's `display: none`, an `aria-hidden` sheet, or a
 * utility class nobody here knows about, and the computed style is the only
 * answer that covers all of them. `offsetParent` would be cheaper and is wrong
 * for `position: fixed` elements, which the bottom navigation is.
 */
export function describe(el: Element): Candidate {
  const style = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
  const rect = el.getBoundingClientRect();
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;

  const ariaDisabled = el.getAttribute("aria-disabled") === "true";
  const nativelyDisabled = (el as HTMLButtonElement).disabled === true;
  const inert = !!el.closest("[inert]");
  // A closed Radix sheet keeps its content mounted and marks it hidden. Without
  // this the More step would resolve a row inside a sheet nobody has opened.
  const inClosedLayer = !!el.closest('[data-state="closed"], [aria-hidden="true"]');

  return {
    instance: el.getAttribute("data-tour-instance"),
    connected: el.isConnected,
    rendered:
      !inClosedLayer &&
      (!style || (style.display !== "none" && style.visibility !== "hidden")),
    opacity: style ? Number(style.opacity || "1") : 1,
    width: rect.width,
    height: rect.height,
    interactive: !nativelyDisabled && !ariaDisabled && !inert,
    inViewport: rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw,
  };
}

/**
 * The one call the overlay makes. Returns the element, or the reason there
 * isn't one — never a silent null.
 */
export function resolveTarget(
  request: TargetRequest,
): { ok: true; el: Element; scrollNeeded: boolean } | { ok: false; reason: TargetFailure } {
  if (typeof document === "undefined") return { ok: false, reason: "absent" };

  const els = Array.from(document.querySelectorAll(`[data-tour-id="${request.anchor}"]`));
  const outcome = chooseCandidate(els.map(describe), request);
  if (!outcome.ok) return { ok: false, reason: outcome.reason };
  return { ok: true, el: els[outcome.index], scrollNeeded: outcome.scrollNeeded };
}
