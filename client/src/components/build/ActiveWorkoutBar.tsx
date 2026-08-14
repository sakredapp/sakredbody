/**
 * A workout is running, and every screen says so.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The server has always known a session was open. The app did not act like it:
 * a member who started lifting and then looked at their step count found a
 * Build tab with an inert form on it and no sign anywhere else that they were
 * mid-workout. Nothing was lost — the sets were committed as they were logged
 * — but the difference between a form that happens to be open and a session
 * the system knows is happening is most of what makes this feel like training
 * software.
 *
 * So the strip is driven by `useOpenWorkout`, which is the same query Build
 * reads. Not by navigation state, not by a context provider tracking where
 * somebody has been. A workout is running because a row has no `finished_at`.
 *
 * ── Restraint is the design ───────────────────────────────────────────────
 *
 * This is deliberately not a large orange bar. It sits above the bottom nav in
 * the app's own register, states the two facts worth stating, and offers one
 * action. A member in the middle of a set does not need to be advertised to;
 * they need to be able to get back.
 */

import { Elapsed } from "@/components/build/Elapsed";
import { useOpenWorkout } from "@/hooks/use-open-workout";
import { ChevronRight } from "lucide-react";

export function ActiveWorkoutBar({
  /** True on the surface that already shows the workout — no point pointing at itself. */
  hidden,
  onResume,
}: {
  hidden?: boolean;
  onResume: () => void;
}) {
  const { data } = useOpenWorkout();
  const session = data?.session;

  if (hidden || !session) return null;

  const sets = session.sets;

  return (
    <button
      onClick={onResume}
      className="w-full text-left rounded-xl border border-[hsl(var(--gold))]/25 bg-card/80 backdrop-blur px-3 py-2 flex items-center gap-3 tap-clean"
      data-testid="active-workout-bar"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))] shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
          Active workout
        </span>
        <span className="block text-sm truncate">
          {session.title?.trim() || "Your session"}
          {/* Only once there is something to count. "0 sets" on a workout
              somebody just started reads as a reproach. */}
          {sets > 0 && (
            <span className="text-muted-foreground"> · {sets} {sets === 1 ? "set" : "sets"}</span>
          )}
        </span>
      </span>
      <Elapsed startedAt={session.startedAt} className="text-sm tabular-nums shrink-0" />
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </button>
  );
}
