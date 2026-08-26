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
import { initialMotion, nextMotion, padFor, settleSide, type MotionState } from "@/lib/tour/motion";

type Rect = { top: number; left: number; width: number; height: number };

/**
 * The element that actually moves when this target is scrolled to.
 *
 * Not assumed to be the document: the portal has run with the window as the
 * scroller and with an inner pane as the scroller at different breakpoints,
 * and a hold applied to the wrong one is a hold that does nothing while
 * looking like it worked. Walked from the target outwards, so it is whatever
 * `scrollIntoView` would have moved.
 */
function scrollerFor(el: Element): Element {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (/(auto|scroll|overlay)/.test(overflow) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return document.scrollingElement ?? document.documentElement;
}

const SAME = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5);

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
    Everything that is allowed to move the page while this lesson runs.

    One owner, one state machine, and every transition caused by something
    observed rather than timed — see `lib/tour/motion.ts` for the trace this
    was built from. What it replaced asked again every 350ms, which restarted
    an in-flight smooth scroll with a fresh one from wherever it had reached.
  */
  const motion = useRef<MotionState>(initialMotion());
  /** The scroller that actually moves this target. Cached per anchor. */
  const scroller = useRef<Element | null>(null);
  /** A gesture since the last frame. The member outranks the walkthrough. */
  const memberMoved = useRef(false);
  /** What `overflow-anchor` was before the lesson borrowed it. */
  const anchoring = useRef<{ el: HTMLElement; was: string } | null>(null);

  useLayoutEffect(() => {
    motion.current = initialMotion();
    scroller.current = null;
    memberMoved.current = false;
    return () => {
      if (anchoring.current) {
        anchoring.current.el.style.overflowAnchor = anchoring.current.was;
        anchoring.current = null;
      }
      document.documentElement.removeAttribute("data-tour-motion");
      document.documentElement.removeAttribute("data-tour-scrolls");
    };
  }, [anchor, instance]);

  /*
    The member taking the page back.

    Passive, capture, and on the window: the gesture may be over a control the
    scrim is blocking, or over the target itself, and either way it is the
    member's intent. Momentum after a flick arrives with no further events at
    all, which is why the machine also watches the offset — this is the fast
    signal, not the only one.
  */
  useEffect(() => {
    if (!anchor) return;
    const took = () => {
      memberMoved.current = true;
    };
    const key = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) took();
    };
    window.addEventListener("wheel", took, { passive: true, capture: true });
    window.addEventListener("touchmove", took, { passive: true, capture: true });
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("wheel", took, true);
      window.removeEventListener("touchmove", took, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [anchor]);

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
      const el = found.ok ? (found.el as HTMLElement) : null;
      const next = el
        ? (() => {
            const r = el.getBoundingClientRect();
            return { top: r.top, left: r.left, width: r.width, height: r.height };
          })()
        : null;

      /*
        One frame of the motion machine, on the rect just measured rather than
        on the one React last rendered — a hold that answers a shift a frame
        late is a hold you can see.
      */
      if (el && !scroller.current) {
        const box = scrollerFor(el);
        scroller.current = box;
        /*
          Take the browser out of the argument.

          Chrome anchors scrolling by itself when content above the viewport
          changes size, adjusting the offset with no script involved — which
          is a second owner doing a crude version of the hold below, and the
          machine correctly read it as somebody else moving the page and let
          go. Worse, it is not a *reliable* second owner: WebKit has never
          implemented scroll anchoring, so on the iPhone these lessons were
          measured on there is nothing there at all and the drift is the full
          52px. Two engines behaving differently is the thing to remove.
        */
        if (box instanceof HTMLElement) {
          anchoring.current = { el: box, was: box.style.overflowAnchor };
          box.style.overflowAnchor = "none";
        }
      }
      const box = scroller.current;
      const offset = box ? box.scrollTop : 0;
      const took = memberMoved.current;
      memberMoved.current = false;
      const turn = nextMotion(motion.current, {
        scroll: offset,
        targetDoc: next ? next.top + offset : null,
        visible: found.ok && !found.scrollNeeded,
        memberMoved: took,
      });
      motion.current = turn.state;
      /*
        Published, because a motion defect is two seconds long and invisible in
        any single frame. The QA harness reads this to assert that a lesson
        reaches `holding` and that nothing scrolls afterwards; a phase kept only
        in a ref is a phase nobody can check.
      */
      document.documentElement.setAttribute(
        "data-tour-motion",
        turn.state.reason ? `${turn.state.phase}:${turn.state.reason}` : turn.state.phase,
      );
      document.documentElement.setAttribute("data-tour-scrolls", String(turn.state.spent));
      if (turn.command.do === "scroll-into-view" && el) {
        el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      } else if (turn.command.do === "hold" && box) {
        /* Instant, always. A smooth correction is a second animation on top of
           the content shift it exists to hide. */
        box.scrollTop = offset + turn.command.by;
      }
      if (!published || !SAME(last, next)) {
        published = true;
        last = next;
        setRect(next);
      }
      frame = requestAnimationFrame(measure);
    };

    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [anchor, instance, needsTap, step.anyInstance, reduced]);

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
  /**
   * That a lesson is on screen, published where anything can read it.
   *
   * The movement picker autofocuses its search box, which is right when a
   * member opens it to find a movement and wrong when the walkthrough opens it
   * to teach one: the keyboard takes half the phone, the categories and the
   * list go under it, and the lesson asks the member to choose from a list
   * they cannot see.
   *
   * An attribute rather than a context because the picker is several trees
   * away and inside a portal, and because the walkthrough must remain a thing
   * the product does not have to know about in order to work.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-tour-active", "true");
    return () => root.removeAttribute("data-tour-active");
  }, []);

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
  /**
   * Whether the lesson has more text below the fold.
   *
   * A workspace lesson gets a quarter of the screen so it cannot cover the
   * thing it explains, and the RPE lesson's copy does not fit in it — the
   * member was shown a sentence that stopped mid-clause with nothing to
   * suggest there was more. The panel had been silently scrollable since the
   * ceiling landed; this is the part that says so.
   */
  const readingRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const reading = readingRef.current;
    if (reading) {
      setMore(reading.scrollHeight - reading.scrollTop - reading.clientHeight > 4);
    }
  }, [step.id, viewportH, waiting]);

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

  /**
   * The side, decided once per lesson instead of recomputed every frame.
   *
   * `rect` travels five hundred pixels during a single directed scroll — the
   * Restore card starts at 974 in an 852 viewport and lands at 462 — and a
   * side recomputed from it crosses the threshold mid-flight and swaps ends of
   * the screen while the page is still moving. Latched, with hysteresis: see
   * `settleSide`. Reset with the step, not with the rect.
   */
  const side = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    side.current = null;
  }, [step.id, anchor, instance]);

  /**
   * Where the panel already is, carried across lessons.
   *
   * A step's target does not exist for the first couple of hundred
   * milliseconds — Restore's cards mounted 217ms after its lesson opened — and
   * defaulting to the bottom in the meantime made the panel drop to the bottom
   * of the screen and then jump back to the top the instant the card appeared.
   * One teleport per lesson, on a screen that had not otherwise changed.
   *
   * While there is no target there is also nothing that could be covered, so
   * the neutral choice is free — and the least surprising free choice is to
   * leave the panel where the member is already looking. The walkthrough is
   * one continuous surface; it should move when the lesson needs it to and
   * not because a query has not come back yet.
   */
  const lastPlaced = useRef(false);

  /*
    The effective height, not the measured one. Before the panel has been
    measured the ceiling is the better guess, because it is the height the
    panel is about to be clamped to anyway.
  */
  const need = Math.min(panelH || maxPanelH, maxPanelH) + GAP;
  const panelAtTop = rect
    ? (side.current = settleSide(side.current, {
        above: rect.top,
        below: viewportH - (rect.top + rect.height),
        need,
      }))
    : lastPlaced.current;
  useLayoutEffect(() => {
    lastPlaced.current = panelAtTop;
  }, [panelAtTop]);

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
        data-testid="tour-panel-dock"
        data-tour-side={panelAtTop ? "top" : "bottom"}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className={cn(
            "mx-auto w-full max-w-md rounded-2xl border border-[hsl(var(--gold))]/25",
            "bg-[hsl(var(--tour-panel))] backdrop-blur-xl outline-none",
            "shadow-[0_18px_50px_-12px_hsl(var(--tour-shadow))]",
            /* A column, so the ceiling clips the reading and never the way
               out. See the scrolling region below. */
            "flex flex-col",
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

          {/*
            Only the reading scrolls.

            The ceiling that stops a lesson covering the product it explains
            also, applied to the whole panel, pushed the action row past the
            bottom of it — on Restore the member was told "you don't have to do
            it now" above a Continue button that had been clipped out of the
            visible box. The QA driver could not find a hittable point for it
            and the walkthrough could not be finished at three of four sizes.

            So the title and the actions are pinned and the body is what gives.
            A lesson may run long; the way forward is never below a fold.
          */}
          <div
            ref={readingRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
            }}
            className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", metrics.gap)}
          >
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
          </div>

          {/* A hairline of the panel's own ground over the last line, so the
              text fades rather than being guillotined by the action row. */}
          {more && (
            <div
              aria-hidden="true"
              className="pointer-events-none -mt-5 h-5 bg-gradient-to-t from-[hsl(var(--tour-panel))] to-transparent"
              data-testid="tour-more-to-read"
            />
          )}

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
