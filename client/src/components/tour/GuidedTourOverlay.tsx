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
  useLayoutEffect(() => {
    if (!anchor) return;
    const found = resolveTarget({ anchor, instance, needsInteraction: needsTap, anyInstance: step.anyInstance });
    if (found.ok && found.scrollNeeded) {
      (found.el as HTMLElement).scrollIntoView({
        block: "center",
        behavior: reduced ? "auto" : "smooth",
      });
    }
  }, [anchor, instance, needsTap, reduced]);

  useEffect(() => {
    if (!anchor) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last: Rect | null = null;

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
      if (!SAME(last, next)) {
        last = next;
        setRect(next);
      }
      frame = requestAnimationFrame(measure);
    };

    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [anchor, instance, needsTap]);

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

  // Low on the screen means the bottom panel would sit on top of it. The
  // primary navigation is a bottom bar, so this is the common case rather than
  // the exceptional one.
  const viewportH = typeof window === "undefined" ? 0 : window.innerHeight;
  const panelAtTop = !!rect && rect.top + rect.height > viewportH * 0.58;

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
      {rect ? (
        <>
          <Scrim style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) }} />
          <Scrim style={{ top: rect.top + rect.height + PAD, left: 0, right: 0, bottom: 0 }} />
          <Scrim
            style={{
              top: Math.max(0, rect.top - PAD),
              left: 0,
              width: Math.max(0, rect.left - PAD),
              height: rect.height + PAD * 2,
            }}
          />
          <Scrim
            style={{
              top: Math.max(0, rect.top - PAD),
              left: rect.left + rect.width + PAD,
              right: 0,
              height: rect.height + PAD * 2,
            }}
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
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
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
        <Scrim style={{ inset: 0 }} blocking={false} />
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
            "px-5 py-4 space-y-3",
          )}
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

          <ObjectiveList objectives={objectives} />

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
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute bg-[hsl(var(--tour-scrim))] transition-opacity duration-200",
        blocking ? "pointer-events-auto" : "pointer-events-none",
      )}
      style={style}
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
function ObjectiveList({ objectives }: { objectives: Objective[] }) {
  if (objectives.length === 0) return null;
  const done = objectives.filter((o) => o.done).length;

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
