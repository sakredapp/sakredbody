/**
 * What a member's phone measured, for the coach looking at them.
 *
 * Read-only, and there is deliberately no way to edit a value from here: a
 * hand-typed health number is one nobody can trace back to a measurement,
 * sitting in the same column as the ones a coach is about to make a call on.
 *
 * Uses the same METRIC_DISPLAY table as the member's own card, so a number
 * cannot read one way to the member and another to their coach — and so a
 * newly synced metric appears on both screens without either being edited.
 *
 * What is shown is the last 7 days against the days before them, not the
 * latest reading. A single night's sleep is noise; a week that has drifted an
 * hour below a member's own normal is the conversation, and it is invisible if
 * you only ever show the most recent number.
 */

import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemberHealth } from "@/hooks/use-health";
import { METRIC_DISPLAY, groupsWithData, summarise } from "@/lib/healthDisplay";
import type { DaySeries } from "@/lib/healthDisplay";
import { HealthWorkouts } from "@/components/portal/HealthWorkouts";
import { cn } from "@/lib/utils";

const TREND_FLOOR = 0.03;

export function MemberHealth({ userId }: { userId: string }) {
  const { data, isLoading, error } = useMemberHealth(userId, 30);

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading health…</p>;

  /*
    A failed read is not a member without a phone.

    The loading case was already handled above, so this is the narrower half
    of the same mistake the member-facing screens made: with no data and no
    spinner, "no phone connected" was the only thing left to say, and it is a
    statement about the member rather than about the request. A coach acts on
    it — asks a client to reconnect something that was never disconnected.
  */
  if (error) {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn't load their health data. This says nothing about their connection.
      </p>
    );
  }

  if (!data?.connected) {
    return (
      <p className="text-xs text-muted-foreground">
        No phone connected. They can link Apple Health or Health Connect from Stats in the app.
      </p>
    );
  }

  const days = (data.days ?? []) as DaySeries[];
  const groups = groupsWithData(days);
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

      {groups.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Connected, but nothing has come through yet.
        </p>
      )}

      {groups.map(({ group, metrics }) => (
        <div key={group} className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">{group}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {metrics.map((metric) => {
              const display = METRIC_DISPLAY[metric];
              const stat = summarise(days, metric);
              if (!stat) return null;

              let delta: number | null = null;
              if (stat.baseline !== null && stat.baseline !== 0) {
                const d = (stat.value - stat.baseline) / stat.baseline;
                if (Math.abs(d) >= TREND_FLOOR) delta = d;
              }
              const better =
                delta === null || display.higherIsBetter === null
                  ? null
                  : delta > 0 === display.higherIsBetter;

              return (
                <div key={metric} className="rounded-lg border border-border/40 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                    {display.label}
                  </div>
                  <div className="mt-1 text-base">{display.format(stat.value)}</div>
                  {delta !== null ? (
                    <div
                      className={cn(
                        "flex items-center gap-1 text-[10px] mt-0.5",
                        better === null && "text-muted-foreground",
                        better === true && "text-gold",
                        better === false && "text-destructive",
                      )}
                    >
                      {delta > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(Math.round(delta * 100))}%
                    </div>
                  ) : (
                    <div className="text-[10px] mt-0.5 text-muted-foreground">
                      {stat.days} {stat.days === 1 ? "day" : "days"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <HealthWorkouts workouts={data.workouts} limit={4} />

    </div>
  );
}
