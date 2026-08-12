/**
 * What the body did today, from whichever app recorded it.
 *
 * A member who ran this morning should not have to log the run in Sakred to see
 * it. Before this, Build opened on "Start a session" and "Log an activity" —
 * an invitation to type in something the app had already imported and was
 * already counting toward their week.
 *
 * Restore or Build comes from the same model a logged session goes through, so
 * this cannot disagree with the terrain reading. A member's own placement
 * override wins, because where a session belongs in their week is theirs to
 * say; what it cost is not, and nothing here touches that.
 */

import { useHealthSummary } from "@/hooks/use-health";
import { localToday } from "@/lib/healthDisplay";
import {
  effectivePlacement,
  PLACEMENT_LABEL,
  type WorkoutPlacement,
} from "@shared/models/training";
import type { HealthWorkout } from "@shared/schema";
import { cn } from "@/lib/utils";

const PLACEMENT_TONE: Record<WorkoutPlacement, string> = {
  build: "text-[hsl(var(--gold))]",
  restore: "text-[hsl(var(--element-water))]",
  both: "text-muted-foreground",
};

function minutes(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function distance(metres: number | null): string | null {
  if (!metres || metres <= 0) return null;
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

function energy(kcal: number | null): string | null {
  if (!kcal || kcal <= 0) return null;
  return `${Math.round(kcal)} kcal`;
}

/** The platform, and the app behind it when we recognise one. */
export function workoutSource(w: HealthWorkout): string {
  const platform = w.source === "healthconnect" ? "Health Connect" : "Apple Health";
  const id = w.sourceApp?.toLowerCase() ?? "";
  const known = ["oura", "strava", "whoop", "garmin", "peloton", "fitbit", "zwift", "nike"];
  const match = known.find((k) => id.includes(k));
  return match ? `${match[0].toUpperCase()}${match.slice(1)} via ${platform}` : platform;
}

export function TodaysMovement({ workouts }: { workouts?: HealthWorkout[] }) {
  const summary = useHealthSummary(30);
  // Either handed the list by a parent that already has it, or fetching it —
  // the query is shared, so the second case is a cache read on most screens.
  const all = workouts ?? summary.data?.workouts ?? [];
  const mine = all.filter((w) => w.onDate === localToday());

  // Nothing at all on a day with no imported session. An empty "Today's
  // movement" heading is a report that the member has done nothing, printed
  // before the day is over.
  if (!mine.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Today</p>
      {mine.map((w) => {
        const placement = effectivePlacement(
          w.workoutType,
          (w.userOrientationOverride ?? null) as WorkoutPlacement | null,
        );
        const facts = [
          minutes(w.durationSeconds),
          distance(w.distanceMeters),
          energy(w.activeCalories),
        ].filter(Boolean);

        return (
          <div
            key={w.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/30 px-3 py-2"
            data-testid={`today-workout-${w.id}`}
          >
            <div className="min-w-0">
              <p className="text-sm capitalize truncate">{w.workoutType ?? "Workout"}</p>
              {facts.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{facts.join(" · ")}</p>
              )}
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                {workoutSource(w)}
              </p>
            </div>
            {placement && (
              <span
                className={cn(
                  "shrink-0 text-[9px] uppercase tracking-widest",
                  PLACEMENT_TONE[placement],
                )}
              >
                {PLACEMENT_LABEL[placement]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
