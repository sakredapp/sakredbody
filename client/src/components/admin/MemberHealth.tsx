/**
 * What a member's phone measured, for the coach looking at them.
 *
 * Read-only, and there is no way to edit a value from here on purpose: a
 * hand-typed health number is one nobody can trace back to a measurement,
 * sitting in the same column as the ones a coach is about to make a call on.
 *
 * The comparison shown is last 7 days against the 30-day baseline, not the
 * latest reading. A single night's sleep is noise; a week that has drifted an
 * hour below a member's own normal is the thing worth a conversation, and it
 * is invisible if you only ever show the most recent number.
 */

import { Activity, HeartPulse, Moon, Footprints, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useMemberHealth, type HealthDay } from "@/hooks/use-health";
import { cn } from "@/lib/utils";

const TRACKED = [
  {
    metric: "sleepMinutes",
    label: "Sleep",
    icon: Moon,
    format: (v: number) => `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`,
    /** Less sleep is worse. Steps and HRV read the other way. */
    lowerIsWorse: true,
  },
  {
    metric: "restingHeartRate",
    label: "Resting HR",
    icon: HeartPulse,
    format: (v: number) => `${Math.round(v)} bpm`,
    // A resting heart rate drifting UP is the classic overreaching signal,
    // which is the opposite direction from every other metric here.
    lowerIsWorse: false,
  },
  {
    metric: "heartRateVariability",
    label: "HRV",
    icon: Activity,
    format: (v: number) => `${Math.round(v)} ms`,
    lowerIsWorse: true,
  },
  {
    metric: "steps",
    label: "Steps",
    icon: Footprints,
    format: (v: number) => Math.round(v).toLocaleString(),
    lowerIsWorse: true,
  },
] as const;

function mean(days: HealthDay[], metric: string): number | null {
  const values = days
    .map((d) => d[metric as keyof HealthDay])
    .filter((v): v is number => typeof v === "number");
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function MemberHealth({ userId }: { userId: string }) {
  const { data, isLoading } = useMemberHealth(userId, 30);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading health…</p>;
  }

  if (!data?.connected) {
    return (
      <p className="text-xs text-muted-foreground">
        No phone connected. They can link Apple Health or Health Connect from Stats in the app.
      </p>
    );
  }

  const days = data.days ?? [];
  const recent = days.slice(-7);
  const lastSync = data.connections[0]?.lastSyncAt;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">
          From their phone
        </h4>
        <span className="text-[10px] text-muted-foreground">
          {lastSync ? `synced ${new Date(lastSync).toLocaleDateString()}` : "never synced"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TRACKED.map(({ metric, label, icon: Icon, format, lowerIsWorse }) => {
          const week = mean(recent, metric);
          const month = mean(days, metric);

          // A trend needs both numbers and a baseline worth comparing against.
          // Below about 3%, the arrow is noise dressed up as a finding.
          let direction: "up" | "down" | "flat" = "flat";
          if (week !== null && month !== null && month !== 0) {
            const delta = (week - month) / month;
            if (Math.abs(delta) >= 0.03) direction = delta > 0 ? "up" : "down";
          }
          const worse =
            (direction === "down" && lowerIsWorse) || (direction === "up" && !lowerIsWorse);
          const Arrow = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

          return (
            <div key={metric} className="rounded-lg border border-border/40 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3 w-3" />
                {label}
              </div>
              <div className="mt-1 text-base">{week !== null ? format(week) : "—"}</div>
              <div
                className={cn(
                  "flex items-center gap-1 text-[10px] mt-0.5",
                  direction === "flat" && "text-muted-foreground",
                  direction !== "flat" && worse && "text-destructive",
                  direction !== "flat" && !worse && "text-[hsl(var(--gold))]",
                )}
              >
                <Arrow className="h-3 w-3" />
                {month !== null ? `vs ${format(month)} · 30d` : "no baseline"}
              </div>
            </div>
          );
        })}
      </div>

      {data.workouts.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Recent sessions
          </p>
          {data.workouts.slice(0, 4).map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-2 text-xs border border-border/30 rounded-md px-2.5 py-1.5"
            >
              <span className="truncate">{w.workoutType ?? "Workout"}</span>
              <span className="text-muted-foreground shrink-0">
                {w.durationSeconds ? `${Math.round(w.durationSeconds / 60)} min` : ""}
                {w.onDate ? ` · ${w.onDate}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {days.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Connected, but nothing has come through yet.
        </p>
      )}
    </div>
  );
}
