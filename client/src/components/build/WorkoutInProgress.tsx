/**
 * You already have a workout running.
 *
 * Shown when starting a session collides with one that is already open. The
 * server refuses with a 409 and hands back the running session precisely so
 * this can exist — a toast saying "You already have a workout in progress"
 * states the problem and leaves the member holding it, on a screen that has
 * just failed to do the thing they asked for.
 *
 * So the refusal comes with the only two things worth offering: what is
 * running, and the way back into it. Finishing or discarding stays inside the
 * workout itself, because those end somebody's training and do not belong on
 * a card that appeared because they tapped the wrong thing.
 */

import { Elapsed } from "@/components/build/Elapsed";
import { Button } from "@/components/ui/button";
import type { RunningSession } from "@/lib/startSession";

export function WorkoutInProgress({
  session,
  onResume,
}: {
  session: RunningSession;
  onResume: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-[hsl(var(--gold))]/30 bg-card/60 p-4 space-y-3"
      data-testid="workout-in-progress"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">Workout already in progress</p>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]" />
          {session.title?.trim() || "Your session"} ·{" "}
          <Elapsed startedAt={session.startedAt} className="tabular-nums" />
        </p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Finish or discard it before beginning another.
      </p>
      <Button
        size="sm"
        className="bg-gold border-gold-border text-white"
        onClick={onResume}
        data-testid="button-resume-workout"
      >
        Resume workout
      </Button>
    </div>
  );
}
