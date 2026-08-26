/**
 * Dim the world, cut a hole where the member needs to touch, explain it below.
 *
 * ── Why four rectangles and not an SVG mask ───────────────────────────────
 *
 * The obvious build is one full-screen element with a mask, or a huge
 * `box-shadow` spread from a transparent div. Both look right and both are
 * wrong, because both leave an element covering the target — and then the tap
 * the tutorial is waiting for lands on the scrim.
 *
 * The usual patch is `pointer-events: none` on the overlay, which fixes the
 * target and breaks the requirement it existed for: now every other control on
 * the screen is live too, and a member can tap something the tutorial isn't
 * expecting and derail the state machine on their first minute in the app.
 *
 * So the scrim is four rectangles — above, below, left and right of the target.
 * The hole is not covered by anything at all, so the real control receives the
 * real tap with no forwarding and no synthetic events; and the four rectangles
 * genuinely block everything else. The halo drawn over the gap is
 * `pointer-events: none` so it decorates without intercepting.
 *
 * ── Measurement ───────────────────────────────────────────────────────────
 *
 * Polled on an animation frame rather than measured once. The target moves for
 * reasons that have nothing to do with the tour: a lazy chunk arrives, an image
 * loads, a list resolves and pushes the card down, the keyboard opens, the
 * phone rotates. A rect captured at mount is wrong a moment later and the hole
 * is over empty space. One `getBoundingClientRect` per frame on one element is
 * cheap, and state is only set when the numbers actually change, so this does
 * not re-render at 60fps.
 *
 * ── Where the panel goes ──────────────────────────────────────────────────
 *
 * Bottom by default, because that is where a hand is. It moves to the top when
 * the target is low enough that it would otherwise cover the very thing being
 * pointed at — which is most of the walkthrough, since the primary navigation
 * is a bottom bar. Both positions clear the iOS home indicator and the Android
 * gesture area through `env(safe-area-inset-*)`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Resolution } from "@/lib/tour/engine";
import type { Objective } from "@/lib/tour/engine";
import { resolveTarget } from "@/lib/tour/resolveTarget";
import { AtmosphereChoice } from "@/components/tour/AtmosphereChoice";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { track } from "@/lib/track";
import { lessonWeight, PANEL, veilFor } from "@/lib/tour/weight";

type Rect = { top: number; left: number; width: number; height: number };

const SAME = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5);

/** Breathing room around the cutout so the halo doesn't clip the control. */
const PAD = 8;

/**
 * How much room a target of this kind wants around it.
 *
 * ── The screenshots this exists because of ────────────────────────────────
 *
 * On a real iPhone the Home halo ran off the left edge and the More halo ran
 * off the right. Both are nav cells sitting flush against the viewport, and a
 * uniform 8px of "breathing room" has nowhere to go: it is drawn outside the
 * screen, so the rounded corner the design intends is simply missing, and the
 * spotlight reads as approximate rather than deliberate.
 *
 * The nav row is also gapless — the cells abut — so any outward padding on one
 * item overlaps its neighbours and the halo starts to look like it means two
 * destinations at once.
 *
 * So a nav target is hugged exactly. The cell already carries its own generous
 * padding around the icon and label; that *is* the breathing room, and the
 * halo tracing its bounds is what makes it look chosen rather than
 * approximated. Everything else keeps the 8px it was designed with.
 */
function padFor(anchor: string | undefined): number {
  if (!anchor) return PAD;
  return /^(nav-|role-)/.test(anchor) ? 0 : PAD;
}

/**
 * Below this, a press on a freshly-mounted tutorial control is the tail of the
 * gesture that mounted it rather than a new decision.
 *
 * Two orders of magnitude above the measured 1ms gap between the halves of a
 * double-tap, and an order of magnitude below the time it takes to read a
 * sentence and decide to move on.
 */
const GHOST_TAP_MS = 120;

export function GuidedTourOverlay({
  resolution,
  instance,
  objectives,
  stepNumber,
  stepCount,
  onContinue,
  onPause,
  onTargetTap,
}: {
  resolution: Resolution;
  /** Which of several like-named controls this step means. */
  instance?: string | null;
  objectives: Objective[];
  stepNumber: number;
  stepCount: number;
  onContinue: () => void;
  onPause: () => void;
  onTargetTap: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [rect, setRect] = useState<Rect | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const anchor = resolution.kind === "ready" ? resolution.anchor : null;
  const step = resolution.step;
  // A step whose completion is the member pressing the thing needs a control
  // that can be pressed; one that merely explains a card does not, and would
  // otherwise fail on a disabled button it was only ever pointing at.
  const needsTap = step.advance.kind === "tap" || step.advance.kind === "present";

  /*
    Bring the target somewhere a person can see before measuring it.

    Runs on the anchor changing, not every frame: a repeated scrollIntoView
    fights the member's own scrolling and makes the page feel possessed.
  */
  /**
   * Whether this step has already had its one scroll.
   *
   * One per step, not one per frame: a repeated `scrollIntoView` fights the
   * member's own scrolling and makes the page feel possessed.
   */
  const scrolledFor = useRef<string | null>(null);
  /**
   * How many times this step has asked, and when it last did.
   *
   * Once was not enough. The Settings row and the Appearance control both sit
   * inside surfaces that are still laying out when the step opens: the one
   * scroll fired, moved the page as far as the layout then allowed, and the
   * target came to rest half under the bottom navigation. Measured at
   * 360×780, where it ended 22px below the fold.
   *
   * Bounded rather than continuous, because a `scrollIntoView` on every frame
   * fights the member's own scrolling and makes the page feel possessed.
   * Three attempts, a third of a second apart, is enough for a sheet to
   * settle and far short of a fight.
   */
  const scrollTries = useRef(0);
  const lastScrollAt = useRef(0);

  useLayoutEffect(() => {
    scrolledFor.current = null;
    scrollTries.current = 0;
    lastScrollAt.current = 0;
  }, [anchor, instance]);

  /*
    Scroll when the target becomes findable, not when the step begins.

    This ran once, on the step changing — and the Settings lesson opens inside
    a sheet that is still animating at that moment, so the effect fired, found
    nothing to scroll, and never looked again. The item sat at y=1305 in an
    852px viewport: measured, visible, and untappable, with the tour waiting
    for a press on something below the fold.

    Attempted from the measure loop instead, guarded so it still happens at
    most once per step. If the target is not there yet, the next frame tries;
    once it has been brought into view, nothing touches the member's scrolling
    again.
  */
  const bringIntoView = useCallback(
    (found: ReturnType<typeof resolveTarget>) => {
      if (!anchor) return;
      if (!found.ok || !found.scrollNeeded) return;
      if (scrolledFor.current === anchor && scrollTries.current >= 3) return;
      if (performance.now() - lastScrollAt.current < 350) return;
      scrolledFor.current = anchor;
      scrollTries.current += 1;
      lastScrollAt.current = performance.now();
      (found.el as HTMLElement).scrollIntoView({
        block: "center",
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [anchor, reduced],
  );

  useEffect(() => {
    if (!anchor) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last: Rect | null = null;
    /**
     * The first frame always publishes, even when it publishes nothing.
     *
     * `last` starts null, so a step whose target cannot be resolved produced
     * `next === null`, compared equal to `last`, and never called `setRect` —
     * leaving the halo from the *previous* lesson on screen. The member was
     * told about RPE while the spotlight sat on the set row above it, and the
     * tutorial looked confidently wrong rather than honestly stuck.
     */
    let published = false;

    const measure = () => {
      // Re-resolved every frame rather than held: the chosen instance can stop
      // being the right one mid-step. A layout crosses its breakpoint and the
      // visible twin becomes the other element; a sheet opens and a previously
      // hidden row becomes the real target. Holding the element found at mount
      // is how a spotlight ends up on a node that is no longer on screen.
      const found = resolveTarget({ anchor, instance, needsInteraction: needsTap, anyInstance: step.anyInstance });
      bringIntoView(found);
      const el = found.ok ? (found.el as HTMLElement) : null;
      const next = el
        ? (() => {
            const r = el.getBoundingClientRect();
            return { top: r.top, left: r.left, width: r.width, height: r.height };
          })()
        : null;
      if (!published || !SAME(last, next)) {
        published = true;
        last = next;
        setRect(next);
      }
      frame = requestAnimationFrame(measure);
    };

    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [anchor, instance, needsTap, bringIntoView]);

  /*
    The tap the step is waiting for.

    Captured on the document rather than bound to the target, because the target
    is somebody else's component and may re-mount between frames. Capture phase,
    so the tour records the tap even if the control stops propagation — which
    the nav does.
  */
  useEffect(() => {
    if (!anchor) return;
    const onPointer = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.(`[data-tour-id="${anchor}"]`);
      if (el) onTargetTap();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [anchor, onTargetTap]);

  /*
    Android's back gesture, and the reason it is handled here.

    Back is a system gesture that does not go through the router on the way out.
    Without this, back during a tour dismisses the screen underneath and leaves
    the scrim over whatever it landed on — an app that is dimmed, unresponsive
    and has no visible way out. Pausing keeps every step already completed.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPause();
    };
    window.addEventListener("keydown", onKey);
    let remove: (() => void) | undefined;
    void import("@capacitor/app")
      .then(({ App }) => App.addListener("backButton", () => onPause()))
      .then((h) => {
        remove = () => void h.remove();
      })
      .catch(() => undefined);
    return () => {
      window.removeEventListener("keydown", onKey);
      remove?.();
    };
  }, [onPause]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [step.id]);

  const waiting = resolution.kind === "waiting";
  const explanatory = step.advance.kind === "continue";
  /*
    The lesson gave up looking. Distinct from `waiting`, and distinct from a
    lesson that was taught — see the note on the button below, and the
    telemetry that records the difference.
  */
  const degraded = resolution.kind === "degraded";

  /*
    How long this step's Continue has been on screen.

    The one fact that separates a member pressing Continue from the second half
    of one physical double-tap. Measured in the browser rather than reasoned
    about: the two clicks of a double-tap arrive about a millisecond apart, and
    the second lands wherever the re-render put things — sometimes a harmless
    DIV, sometimes the new Continue, which skips a lesson the member is never
    offered again.

    So the button ignores a press that arrives before it has plausibly been
    seen. Nothing is disabled and nothing is hidden: a member who taps again
    gets what they asked for immediately, because by then the control is older
    than the window.
  */
  const shownAt = useRef(performance.now());
  useEffect(() => {
    shownAt.current = performance.now();
  }, [step.id]);

  /**
   * Which end of the screen the dialogue sits at.
   *
   * ── Why a fraction of the viewport was not enough ─────────────────────────
   *
   * The rule was "put the panel at the top when the target is below 58% of the
   * screen", which asks where the target is and never asks how tall the panel
   * is. On a 360×780 phone the Restore lesson's panel wraps to 363px — nearly
   * half the screen — and the target sat at 418: above the threshold, so the
   * panel went to the bottom, where it started at 405 and covered the row of
   * practices the lesson exists to point at. Twenty of its twenty-six pixels.
   *
   * So the question is the one that was always meant: *does the panel fit on
   * this side of the target*. Measured from the panel itself, because its
   * height depends on how the copy wraps at this width, which no constant
   * knows. When neither side fits, the roomier one is the least bad answer and
   * the halo still says which control is meant.
   */
  /**
   * The height the member can actually see, not the height of the window.
   *
   * `innerHeight` does not move when the keyboard comes up, so on the Add
   * Movement lesson every placement decision was made against a viewport
   * roughly twice the size of the one on screen — which is how a panel
   * "below the target" ends up behind the keyboard. `visualViewport` is the
   * only thing that knows, and it changes without a resize event, so it is
   * subscribed to rather than read once.
   */
  const [viewportH, setViewportH] = useState(
    typeof window === "undefined" ? 0 : (window.visualViewport?.height ?? window.innerHeight),
  );
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!vv) return;
    const read = () => setViewportH(vv.height);
    read();
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, []);

  /**
   * How much of the screen this lesson may take, and how dark the rest goes.
   *
   * One decision, made once, applied to padding, to the checklist, to the
   * height ceiling and to the veil — which is the point. Four screenshots
   * showed four lessons covering the thing they were teaching, and patching
   * them one at a time would have produced four different panels.
   */
  const weight = lessonWeight(step);
  const metrics = PANEL[weight];
  const veil = veilFor(weight);
  const [panelH, setPanelH] = useState(0);
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const read = () => setPanelH(el.getBoundingClientRect().height);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [step.id]);

  const GAP = 16;

  /**
   * The tallest this panel may be on this screen.
   *
   * Applied as a real max-height with the body scrolling inside it, rather
   * than as a hope about how the copy wraps. A lesson that overruns simply
   * scrolls; it never grows into the product it is explaining.
   */
  const maxPanelH = Math.round(viewportH * metrics.maxViewportShare);

  const panelAtTop = (() => {
    if (!rect) return false;
    /*
      The effective height, not the measured one. Before the panel has been
      measured the ceiling is the better guess, because it is the height the
      panel is about to be clamped to anyway.
    */
    const h = Math.min(panelH || maxPanelH, maxPanelH);
    const below = viewportH - (rect.top + rect.height);
    const above = rect.top;
    if (below >= h + GAP) return false;
    if (above >= h + GAP) return true;
    return above > below;
  })();

  /**
   * The one rectangle the cutout and the halo both use.
   *
   * They were computed separately from `rect ± PAD`, which meant any clamping
   * had to be applied identically in five places or the hole and the ring
   * would disagree — and a ring that does not sit on its hole is the most
   * obviously broken thing a spotlight can do.
   *
   * Clamped to the visible viewport, so an edge target's halo stays on screen
   * instead of being drawn past it. The clamp moves the *drawing* only: the
   * real control keeps its own bounds and its own tap target, which is the
   * line this must not cross — a halo is a description of where to press, and
   * shrinking the press area to flatter the description would be backwards.
   */
  const pad = padFor(step.anchor);
  const viewportW = typeof window === "undefined" ? 0 : window.innerWidth;
  const halo = rect
    ? (() => {
        const left = Math.max(0, rect.left - pad);
        const top = Math.max(0, rect.top - pad);
        const right = Math.min(viewportW || rect.left + rect.width + pad, rect.left + rect.width + pad);
        const bottom = Math.min(viewportH || rect.top + rect.height + pad, rect.top + rect.height + pad);
        return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      })()
    : null;

  const body = (
    <div
      /*
        `pointer-events-none` on the container, restored on each piece that is
        meant to block.

        The four-rectangle scrim below is built so that nothing covers the hole
        — that is the entire reason it is four rectangles and not a mask. This
        wrapper was quietly defeating it: a `fixed inset-0` div is a hit target
        whether or not it paints anything, so `elementFromPoint` at the centre
        of the highlighted control returned the overlay, and every step that
        asks the member to tap something was untappable. The walkthrough could
        be read and not used.

        Measured, not reasoned about: the QA driver tapped the highlighted
        Restore tab and the tap landed on `tour-overlay`.
      */
      className="fixed inset-0 z-[120] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      data-testid="tour-overlay"
      data-tour-step={step.id}
    >
      {/* ── The scrim, in four pieces ────────────────────────────────────── */}
      {rect && halo ? (
        <>
          <Scrim veil={veil} style={{ top: 0, left: 0, right: 0, height: halo.top }} />
          <Scrim veil={veil} style={{ top: halo.top + halo.height, left: 0, right: 0, bottom: 0 }} />
          <Scrim
            veil={veil}
            style={{ top: halo.top, left: 0, width: halo.left, height: halo.height }}
          />
          <Scrim
            veil={veil}
            style={{ top: halo.top, left: halo.left + halo.width, right: 0, height: halo.height }}
          />
          {/* Decoration only. Never intercepts the tap it is drawing around. */}
          <div
            aria-hidden="true"
            /* The QA harness measures this against the target's own rect.
               Geometry you cannot select is geometry nobody checks. */
            data-testid="tour-halo"
            className={cn(
              "absolute rounded-xl pointer-events-none",
              "ring-2 ring-[hsl(var(--gold))]/70",
              "shadow-[0_0_0_1px_hsl(var(--gold)/0.25),0_0_28px_hsl(var(--gold)/0.28)]",
              !reduced && "tour-pulse",
            )}
            style={{
              top: halo.top,
              left: halo.left,
              width: halo.width,
              height: halo.height,
            }}
          />
        </>
      ) : (
        /*
          No target, so nothing may be blocked.

          The four-rectangle scrim blocks everything *except* the highlighted
          control. With no control located there is nothing to make an
          exception for, and a full-screen blocking scrim then swallows the
          entire app — including, precisely, the thing the tour is waiting for.

          That is not hypothetical. Tapping "Add" opens the movement picker,
          which removes `workout-add-exercise` from the document; the overlay
          fell back to this scrim, and every movement in the picker became
          untappable. The lesson said "Add one" and then made it impossible.

          So the fallback dims and does not intercept. The member can act, the
          tour sees the result, and the moment a rect is known the blocking
          rectangles come back.
        */
        <Scrim veil={veil} style={{ inset: 0 }} blocking={false} />
      )}

      {/* ── The dialogue panel ───────────────────────────────────────────── */}
      <div
        className={cn(
          /* The panel is the other half that must stay interactive. */
          "absolute left-0 right-0 px-4 pointer-events-auto",
          panelAtTop ? "top-0 pt-[calc(env(safe-area-inset-top)+0.75rem)]" : "bottom-0 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
        )}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className={cn(
            "mx-auto w-full max-w-md rounded-2xl border border-[hsl(var(--gold))]/25",
            "bg-[hsl(var(--tour-panel))] backdrop-blur-xl outline-none",
            "shadow-[0_18px_50px_-12px_hsl(var(--tour-shadow))]",
            "overflow-y-auto overscroll-contain",
            metrics.padding,
            metrics.gap,
          )}
          /* The ceiling, enforced rather than hoped for. See `maxPanelH`. */
          style={{ maxHeight: maxPanelH }}
          data-tour-weight={weight}
          data-testid="tour-panel"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="tour-title"
              className="font-serif text-lg tracking-tight text-foreground"
              data-testid="tour-title"
            >
              {step.title}
            </h2>
            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
              {stepNumber} / {stepCount}
            </span>
          </div>

          {/* Announced rather than merely rendered: the instruction is the
              content of this screen, and a member using VoiceOver gets the new
              step read to them the way a sighted member gets it swapped in. */}
          <p
            className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line"
            aria-live="polite"
            data-testid="tour-body"
          >
            {waiting ? "One moment…" : step.body}
          </p>

          {step.choice === "appearance" && !waiting && <AtmosphereChoice />}

          <ObjectiveList objectives={objectives} expandable={metrics.expandableChecklist} />

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onPause}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors tap-clean py-1"
              data-testid="button-tour-pause"
            >
              Pause for now
            </button>

            {/*
              No Continue while the lesson is still looking for its subject.

              It used to render one here, enabled, under the words "One
              moment…" — and pressing it did nothing, because there is nothing
              yet to continue from. A control that invites a tap and answers
              with silence is worse than no control: the member concludes the
              app is broken, which on that evidence is a reasonable thing to
              conclude.

              `degraded` is different and still offers it. That is the bounded
              give-up after six seconds of waiting, and moving on is exactly
              the right thing to be able to do at that point — but it is not
              the same act, so it does not wear the same word. "Continue for
              now" says what happened: the lesson could not find its subject
              and is being left behind rather than taught. A member who reads
              "Continue" there would remember being shown something they were
              never shown.
            */}
            {((explanatory && !waiting) || degraded) && (
              <button
                type="button"
                onClick={() => {
                  /*
                    ~1ms is a ghost; ~200ms is a person. GHOST_TAP_MS sits
                    between them, far closer to the ghost than to any real
                    reading time, so it cannot swallow a deliberate press.
                  */
                  if (performance.now() - shownAt.current < GHOST_TAP_MS) return;
                  /*
                    Say that this lesson degraded, before moving past it. A run
                    that ends with the walkthrough marked complete must not be
                    indistinguishable from one where three lessons never found
                    their subject.
                  */
                  if (degraded) track("tour.step_degraded", { surface: "walkthrough", subjectId: step.id });
                  onContinue();
                }}
                className={cn(
                  "rounded-full px-5 py-2 text-sm tap-clean transition-colors",
                  degraded
                    ? "bg-muted text-muted-foreground hover:bg-muted/80"
                    : "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-text))] hover:bg-[hsl(var(--gold))]/25",
                )}
                data-testid={degraded ? "button-tour-continue-degraded" : "button-tour-continue"}
                data-tour-degraded={degraded ? "true" : undefined}
              >
                {degraded
                  ? "Continue for now"
                  : stepNumber === stepCount
                    ? "Enter Sakred"
                    : "Continue"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Rendered into `body` for the same reason the theme attribute lives on
  // `documentElement`: the portal's own tree is inside a stacking context this
  // has to cover, and sheets and dialogs already render as siblings of it.
  return typeof document === "undefined" ? body : createPortal(body, document.body);
}

/**
 * One piece of the scrim.
 *
 * `--tour-scrim` is a token rather than a literal because Light needs a
 * genuinely different treatment: a warm walnut veil at low alpha that dims
 * without relighting the app in the other atmosphere. A tutorial that turns a
 * daylight app dark for its duration has switched the member's theme without
 * asking.
 */
function Scrim({
  style,
  /**
   * How dark this piece goes, 0–1.
   *
   * A teaching veil and a modal scrim are not the same object. On a workspace
   * lesson — the movement picker, the composer — the member is being asked to
   * *use* the surface underneath, and the shipped build dimmed it to near
   * black while doing so. See `veilFor`.
   */
  veil = 1,
  /**
   * Whether this piece is one of the four that surround a located target.
   *
   * False only for the no-target fallback, which dims the screen without
   * taking it over — see the note at the call site. Everything else blocks,
   * because that is the half of "only the target is interactive" that this
   * component exists for.
   */
  blocking = true,
}: {
  style: React.CSSProperties;
  blocking?: boolean;
  veil?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute bg-[hsl(var(--tour-scrim))] transition-opacity duration-200",
        blocking ? "pointer-events-auto" : "pointer-events-none",
      )}
      style={{ ...style, opacity: veil }}
      // Swallowed rather than ignored, so a stray tap does nothing at all
      // instead of reaching a control the state machine is not expecting.
      onPointerDown={blocking ? (e) => e.preventDefault() : undefined}
    />
  );
}

/**
 * The objective list, which is orientation and not a scoreboard.
 *
 * No XP, no streak, no currency. It exists so a member can see that this ends,
 * and roughly when — the single most common reason people abandon a tutorial is
 * not knowing how much of it there is.
 */
function ObjectiveList({
  objectives,
  /**
   * Whether the seven items may be opened here.
   *
   * On the Body Map lesson the expanded checklist was the largest object on a
   * screen whose entire subject is a map. The count is the orientation a
   * member actually uses mid-lesson; the list is a thing to read afterwards.
   */
  expandable = true,
}: {
  objectives: Objective[];
  expandable?: boolean;
}) {
  if (objectives.length === 0) return null;
  const done = objectives.filter((o) => o.done).length;

  if (!expandable) {
    return (
      <p
        className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70"
        data-testid="tour-objectives"
      >
        Learning Sakred · {done} / {objectives.length}
      </p>
    );
  }

  return (
    <details className="group" data-testid="tour-objectives">
      <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70 tap-clean py-0.5">
        Learning Sakred · {done} / {objectives.length}
      </summary>
      <ul className="mt-2 space-y-1">
        {objectives.map((o) => (
          <li key={o.name} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                o.done ? "bg-[hsl(var(--gold))]" : "bg-muted-foreground/30",
              )}
            />
            <span className={cn(o.done && "text-foreground/80")}>{o.name}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function useTourTap(): [boolean, () => void, () => void] {
  const [tapped, setTapped] = useState(false);
  const mark = useCallback(() => setTapped(true), []);
  const clear = useCallback(() => setTapped(false), []);
  return [tapped, mark, clear];
}
