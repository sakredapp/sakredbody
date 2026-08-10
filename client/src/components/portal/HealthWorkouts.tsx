/**
 * Sessions, with everything we actually stored about them.
 *
 * Shared by the member's card and the coach's panel so a session reads the
 * same to both. It previously showed type and duration only, while
 * health_workouts was already holding distance, calories and both heart rates
 * — four columns written on every sync and displayed nowhere.
 */

import type { HealthWorkout } from "@shared/schema";

function minutes(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Only the facts this session actually has. An empty stat is not a stat. */
function facts(w: HealthWorkout): string[] {
  const out: string[] = [];
  const t = minutes(w.durationSeconds);
  if (t) out.push(t);
  if (w.distanceMeters && w.distanceMeters > 0) {
    out.push(
      w.distanceMeters >= 1000
        ? `${(w.distanceMeters / 1000).toFixed(2)} km`
        : `${Math.round(w.distanceMeters)} m`
    );
  }
  if (w.activeCalories && w.activeCalories > 0) out.push(`${Math.round(w.activeCalories)} kcal`);
  if (w.avgHeartRate && w.avgHeartRate > 0) {
    // Max only alongside average — on its own it reads as the session's
    // intensity when it is really one spike.
    out.push(
      w.maxHeartRate && w.maxHeartRate > 0
        ? `${Math.round(w.avgHeartRate)}/${Math.round(w.maxHeartRate)} bpm`
        : `${Math.round(w.avgHeartRate)} bpm`
    );
  }
  return out;
}

export function HealthWorkouts({
  workouts,
  limit = 5,
}: {
  workouts: HealthWorkout[];
  limit?: number;
}) {
  if (!workouts.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sessions</p>
      {workouts.slice(0, limit).map((w) => {
        const stats = facts(w);
        return (
          <div
            key={w.id}
            className="flex items-start justify-between gap-3 text-xs border border-border/30 rounded-lg px-3 py-2"
          >
            <div className="min-w-0">
              <p className="capitalize truncate">{w.workoutType ?? "Workout"}</p>
              {stats.length > 0 && (
                <p className="text-muted-foreground mt-0.5">{stats.join(" · ")}</p>
              )}
            </div>
            <span className="text-muted-foreground shrink-0 text-[11px]">{w.onDate}</span>
          </div>
        );
      })}
      {workouts.length > limit && (
        <p className="text-[10px] text-muted-foreground">
          and {workouts.length - limit} more in the last 30 days
        </p>
      )}
    </div>
  );
}
