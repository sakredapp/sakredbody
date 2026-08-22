/**
 * You already have a workout running.
 *
 * Shown when starting a session collides with one that is already open. The
 * server refuses with a 409 and hands back the running session precisely so
 * this can exist — a toast saying "You already have a workout in progress"
 * states the problem and leaves the member holding it, on a screen that has
 * just failed to do the thing they asked for.
 *
 * ── Why discard belongs here after all ────────────────────────────────────
 *
 * This card used to offer Resume and nothing else, on the reasoning that
 * finishing or discarding ends somebody's training and should happen inside
 * the workout rather than on a card they hit by accident. That reasoning holds
 * for a workout somebody is in the middle of. It does not hold for the case
 * this card exists to handle.
 *
 * A session called "Tissue work" sat open in production for a day and ten
 * hours with nothing logged in it. Because there can only be one open workout,
 * that row refused every attempt its owner made to start anything, and the
 * only way out was to resume a workout they did not want in order to discard
 * it from inside. A dead-end reached by pressing the one button on offer.
 *
 * So the way out is on the card. It is still confirmed — see below — and it is
 * still never automatic: a zero-set session can now carry exercise
 * composition, which is a real record of what somebody had chosen to do, and
 * nothing should delete that without being asked.
 *
 * ── And the card says which case this is ──────────────────────────────────
 *
 * "0 sets · 1d 8h" is the whole decision. A workout twenty minutes old with
 * eleven sets in it should obviously be resumed; one from yesterday with
 * nothing in it should obviously go. The card's job is to make that visible
 * rather than to make the member guess which button is safe.
 */

import { useState } from "react";
import { Elapsed } from "@/components/build/Elapsed";
import { Button } from "@/components/ui/button";
import type { RunningSession } from "@/lib/startSession";

/** Six hours. Past that, a live ticking clock is theatre rather than information. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** "1d 8h", "3h 12m", "24m" — coarse on purpose, for a session nobody is inside. */
function coarseAge(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/**
 * "from yesterday", "from Saturday", or nothing at all when it is from today.
 * A session started an hour ago does not need a date; one from last week does.
 */
function since(startedAt: string): string {
  const started = new Date(startedAt);
  const days = Math.floor((Date.now() - started.getTime()) / 86_400_000);
  if (days < 1) return "";
  if (days === 1) return " from yesterday";
  if (days < 7) return ` from ${started.toLocaleDateString(undefined, { weekday: "long" })}`;
  return ` from ${started.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function WorkoutInProgress({
  session,
  onResume,
  onDiscard,
  discarding = false,
}: {
  session: RunningSession;
  onResume: () => void;
  /**
   * Throw the open session away and start the one they asked for. Optional, so
   * a surface that has no start to retry can still show the card.
   */
  onDiscard?: () => void;
  discarding?: boolean;
}) {
  /**
   * Confirmed by a second tap rather than by a dialog, which is the pattern the
   * workout's own Discard uses. A modal over a card that itself appeared
   * unexpectedly is two surprises in a row.
   */
  const [confirming, setConfirming] = useState(false);

  const name = session.title?.trim() || "Your session";
  const stale = Date.now() - new Date(session.startedAt).getTime() > STALE_AFTER_MS;
  const sets = session.sets;

  return (
    <div
      className="rounded-2xl border border-[hsl(var(--gold))]/30 bg-card/60 p-4 space-y-3"
      data-testid="workout-in-progress"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium" data-testid="in-progress-title">
          {name} is still open{since(session.startedAt)}
        </p>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))] shrink-0" />
          <span data-testid="in-progress-meta">
            {sets != null && `${sets} ${sets === 1 ? "set" : "sets"} · `}
            {/*
              A running clock while somebody is training, a coarse age once it
              has been open long enough that the seconds stopped meaning
              anything.
            */}
            {stale ? coarseAge(session.startedAt) : null}
          </span>
          {!stale && <Elapsed startedAt={session.startedAt} className="tabular-nums" />}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="bg-gold border-gold-border text-white"
          onClick={onResume}
          disabled={discarding}
          data-testid="button-resume-workout"
        >
          Resume
        </Button>

        {onDiscard && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={discarding}
            onClick={() => {
              if (!confirming) return setConfirming(true);
              onDiscard();
            }}
            data-testid="button-discard-and-start"
          >
            {discarding
              ? "Discarding…"
              : confirming
                ? sets
                  ? `Discard ${name} and its ${sets} ${sets === 1 ? "set" : "sets"}? — tap again`
                  : `Discard ${name}? — tap again`
                : "Discard & start this workout"}
          </Button>
        )}
      </div>

      {/*
        Said once, underneath, rather than as the only thing on offer. The old
        copy — "Finish or discard it before beginning another" — was an
        instruction to go and do something the screen would not help with.
      */}
      {!confirming && (
        <p className="text-xs text-muted-foreground/70 leading-relaxed">
          Only one workout runs at a time.
        </p>
      )}
    </div>
  );
}
