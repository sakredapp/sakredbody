/**
 * Why this, today — before you commit to it.
 *
 * ── Why a step exists at all ──────────────────────────────────────────────
 *
 * A recommendation that starts a workout on first tap gives somebody no way to
 * read the reasoning without becoming committed to it. The whole argument of
 * this product is that the member decides and Sakred advises, and a card that
 * turns curiosity into an open session has quietly reversed that.
 *
 * So one step: what was suggested, why the day supports it, and the condition
 * Terrain attached. Then a start.
 *
 * ── The condition is not decoration ───────────────────────────────────────
 *
 * On an adjustable day the sentence upstairs says "available if the warm-up
 * agrees", and that qualifier has to survive the tap. Dropping it here would
 * turn a conditional read into a prescription at exactly the moment somebody
 * is deciding how hard to go.
 */

import { Button } from "@/components/ui/button";
import type { BuildAction } from "@shared/models/buildToday";

export function WhyToday({
  action,
  why,
  starting,
  onStart,
  onDismiss,
}: {
  action: BuildAction;
  /** Terrain's own reasons, already sentences. Empty when nothing is known. */
  why: string;
  starting: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const isPractice = action.kind === "practice";

  return (
    <div
      className="rounded-2xl border border-[hsl(var(--gold))]/25 bg-card/60 p-4 space-y-3"
      data-testid="why-today"
    >
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Why today
        </p>
        <p className="font-display text-lg leading-snug">{action.label}</p>
      </div>

      {why && <p className="text-sm text-muted-foreground leading-relaxed">{why}</p>}

      {/*
        Said plainly, because it is the difference between a suggestion and an
        instruction. Sakred does not know how the first set will feel.
      */}
      <p className="text-xs text-muted-foreground/80 leading-relaxed">
        Start moderate and let the warm-up decide how far you take it.
      </p>

      <div className="flex items-center gap-2 pt-1">
        {/*
          A practice is recorded after it happens, not run as a live session —
          it has a duration, not sets. So there is nothing to start, and saying
          so is better than opening a set logger for a yoga class.
        */}
        {isPractice ? (
          <p className="text-xs text-muted-foreground">
            Log it below once you've done it.
          </p>
        ) : (
          <Button
            size="sm"
            className="bg-gold border-gold-border text-gold-foreground"
            disabled={starting}
            onClick={onStart}
            data-testid="button-start-recommended"
          >
            {starting ? "Starting…" : "Start workout"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDismiss} data-testid="button-choose-another">
          {isPractice ? "Close" : "Choose another"}
        </Button>
      </div>
    </div>
  );
}
