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
 * So the strip is driven by `useOpenWorkout`, which is the same query the
 * workout screen reads. Not by navigation state, not by a context provider
 * tracking where somebody has been. A workout is running because a row has no
 * `finished_at`.
 *
 * ── It has no "hidden" case any more ──────────────────────────────────────
 *
 * It used to hide on Build, because Build was where the workout lived. The
 * workout is now a layer over the whole app, so there is no screen that is
 * already showing it — collapsed is collapsed everywhere — and this is the way
 * back in from all of them.
 *
 * ── Except one, and it is a real distinction ──────────────────────────────
 *
 * A session carrying a `habit_id` is a coach's prescription being worked
 * through, and that screen is not a blank logger: every lift arrives with its
 * target sets, target reps and a weight already resolved from this member's
 * own history. Opening the ad-hoc workout layer over it would replace all of
 * that with an empty list. So a prescribed session sends the member to Build,
 * where its own screen is, and the layer takes the sessions nobody wrote.
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
import { useWorkoutSheet } from "@/components/build/WorkoutSheet";
import { ChevronRight } from "lucide-react";

export function ActiveWorkoutBar({
  /** Where a coach-prescribed session lives. See the note above. */
  onOpenBuild,
}: {
  onOpenBuild: () => void;
}) {
  const { data } = useOpenWorkout();
  const { expanded, open } = useWorkoutSheet();
  const session = data?.session;

  // Nothing to point at, or it is already in front of them.
  if (!session || expanded) return null;

  const sets = session.sets;

  return (
    <button
      onClick={session.habitId ? onOpenBuild : open}
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
