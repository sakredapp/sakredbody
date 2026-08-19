/**
 * A workout, as the Room sees it.
 *
 * ── What is on it, and what is deliberately not ───────────────────────────
 *
 * Movements, working sets, the top set, and how long it took. That is what
 * somebody is saying when they share a session: *I did this*.
 *
 * Not on it: their session note, per-set notes, RPE, whether they hit failure,
 * anything from Terrain, Training Memory or their health data. The server does
 * not send those fields at all — see `server/community/sharedWorkout.ts` — so
 * this component could not render them if it wanted to, which is the point. A
 * share is not an open diary.
 *
 * ── It is what was published, not what is true now ────────────────────────
 *
 * The numbers here were copied when the member pressed share and do not move
 * again. If they correct a set next week their training log changes and this
 * post does not, which is the only version of it that other people's replies
 * still make sense underneath.
 *
 * ── Supersets are shown as the relationship they are ──────────────────────
 *
 * Movements performed together carry the same group key, so they are bracketed
 * rather than listed as two unrelated lines. Flattening them would misdescribe
 * the session — three rounds of two movements is not six straight sets.
 */

import { Dumbbell } from "lucide-react";
import type { SharedWorkout, SharedMovement } from "@/hooks/use-community";
import { cn } from "@/lib/utils";

/** Kilograms, without a trailing `.0` on the whole numbers most lifts are. */
const kg = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

function movementLine(m: SharedMovement): string {
  const parts: string[] = [];
  if (m.sets > 0) parts.push(m.reps != null ? `${m.sets} × ${m.reps}` : `${m.sets} sets`);
  if (m.topWeightKg != null) parts.push(`${kg(m.topWeightKg)} kg`);
  /*
    A movement with no working sets is one that was chosen and not performed —
    it exists because `session_exercises` records intent. Said plainly rather
    than shown as "0 sets", which reads like a failure.
  */
  return parts.length ? parts.join(" · ") : "logged";
}

/** Consecutive movements sharing a superset key, kept in the member's order. */
function group(movements: SharedMovement[]): SharedMovement[][] {
  const out: SharedMovement[][] = [];
  for (const m of movements) {
    const last = out[out.length - 1];
    if (last && m.supersetGroup && last[0].supersetGroup === m.supersetGroup) last.push(m);
    else out.push([m]);
  }
  return out;
}

export function SharedWorkoutCard({
  workout,
  className,
}: {
  workout: SharedWorkout;
  className?: string;
}) {
  const groups = group(workout.movements);

  return (
    <div
      className={cn(
        "rounded-xl border border-gold-border/40 bg-muted/30 p-3 space-y-2",
        className,
      )}
      data-testid="card-shared-workout"
    >
      <div className="flex items-baseline gap-2">
        <Dumbbell className="h-3.5 w-3.5 shrink-0 text-gold/70" />
        <span className="text-sm font-medium">{workout.title ?? "Training"}</span>
        <span className="ml-auto text-[11px] text-muted-foreground/70">
          {workout.durationMinutes ? `${workout.durationMinutes} min` : null}
        </span>
      </div>

      {groups.length > 0 && (
        <ul className="space-y-1">
          {groups.map((set, i) => (
            <li key={i} className={cn(set.length > 1 && "border-l border-gold-border/40 pl-2")}>
              {set.length > 1 && (
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/60">
                  Superset
                </span>
              )}
              {set.map((m) => (
                <div key={m.exerciseId} className="flex items-baseline gap-2 text-xs">
                  <span className="truncate">{m.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/80">
                    {movementLine(m)}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {workout.volumeKg != null && (
        <p className="text-[11px] tabular-nums text-muted-foreground/60">
          {workout.volumeKg.toLocaleString()} kg moved
        </p>
      )}
    </div>
  );
}
