/**
 * The Health card — connect a phone, and see everything it sent.
 *
 * Shown on Stats. Three genuinely different states, so it does not try to be
 * one component with a flag:
 *
 *   web           — health only reads on the phone; say so and stop
 *   not connected — one button, and an honest sentence about what we read
 *   connected     — every metric that has data, grouped
 *
 * "Every metric that has data" rather than a fixed four. The sync collects
 * twenty-two, and hard-coding a handful in the component meant the other
 * eighteen were stored and rendered nowhere — which looks exactly like the
 * member having no data, so nobody would ever report it.
 *
 * The way out is deliberately not buried. A member who cannot find how to
 * disconnect their health data reads that as the data not really being theirs.
 */

import { RefreshCw, Link2Off, TrendingDown, TrendingUp } from "lucide-react";
import { useHealthSummary, useHealthSync } from "@/hooks/use-health";
import {
  METRIC_DISPLAY,
  groupsWithData,
  summarise,
  isStillCounting,
  localToday,
} from "@/lib/healthDisplay";
import type { DaySeries } from "@/lib/healthDisplay";
import type { HealthMetric } from "@shared/schema";
import { HealthWorkouts } from "@/components/portal/HealthWorkouts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Under 3%, a trend arrow is noise dressed up as a finding. */
const TREND_FLOOR = 0.03;

/**
 * Which day this reading belongs to, in words.
 *
 * Sleep is filed to the date the night *ends* on, so today's sleep row is last
 * night — which is the one piece of naming here counter-intuitive enough that
 * leaving it unsaid invites a member to read it as a nap.
 */
function whenLabel(metric: string, onDate: string | null): string {
  if (!onDate) return "";
  const today = localToday();
  const sleep = metric.startsWith("sleep");
  if (onDate === today) return sleep ? "Last night" : "Today";

  const days = Math.round(
    (new Date(`${today}T12:00:00`).getTime() - new Date(`${onDate}T12:00:00`).getTime()) /
      86_400_000,
  );
  if (days === 1) return sleep ? "The night before" : "Yesterday";
  return new Date(`${onDate}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function MetricTile({ days, metric }: { days: DaySeries[]; metric: keyof typeof METRIC_DISPLAY }) {
  const display = METRIC_DISPLAY[metric];
  const stat = summarise(days, metric);
  if (!stat) return null;

  /**
   * A day still being counted is not a day you can compare.
   *
   * At 18:10 this tile read "16,190 steps · 11% down vs earlier" — down against
   * finished days, with hours of the current one still to run. The percentage
   * was arithmetically true and told the member something false, which is the
   * worst kind of number to print: it needs no bug to mislead.
   *
   * The same guard exists in the metric detail sheet. It was added there and
   * not here, so the modal said "Today so far" while the tile behind it was
   * still quoting a decline — the two disagreed on the same screen.
   *
   * Sleep keeps its comparison. Last night is over.
   */
  const stillCounting = isStillCounting(metric as HealthMetric, stat.onDate);

  let delta: number | null = null;
  if (!stillCounting && stat.baseline !== null && stat.baseline !== 0) {
    const d = (stat.value - stat.baseline) / stat.baseline;
    if (Math.abs(d) >= TREND_FLOOR) delta = d;
  }

  // `higherIsBetter: null` means the metric has no good direction — weight is a
  // goal, not a virtue — so it gets an arrow without a colour.
  const better =
    delta === null || display.higherIsBetter === null
      ? null
      : delta > 0 === display.higherIsBetter;

  return (
    <div className="rounded-xl border border-border/30 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
        {display.label}
      </div>
      <div className="mt-1.5 text-lg font-display">{display.format(stat.value)}</div>
      {/*
        What day this is. The tiles never said, so a member could not tell
        whether they were reading today, last night, or an average of the month.
      */}
      {stillCounting ? (
        <div className="text-[10px] mt-0.5 text-muted-foreground">Today so far</div>
      ) : (
        <div className="text-[10px] mt-0.5 text-muted-foreground">{whenLabel(metric, stat.onDate)}</div>
      )}
      {delta !== null && (
        <div
          className={cn(
            "flex items-center gap-1 text-[10px] mt-0.5",
            better === null && "text-muted-foreground",
            better === true && "text-[hsl(var(--gold))]",
            better === false && "text-destructive",
          )}
        >
          {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {/*
            "vs earlier" named no window at all. It is a comparison against the
            member's other recent days, and saying so is the difference between
            a number they can act on and one they have to guess at.
          */}
          {Math.abs(Math.round(delta * 100))}% vs your recent days
        </div>
      )}
    </div>
  );
}

export function HealthCard() {
  const { available, reason, platform, connect, sync, disconnect } = useHealthSync();
  const { data, isLoading } = useHealthSummary(30);
  const { toast } = useToast();

  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";
  const days = (data?.days ?? []) as DaySeries[];
  const connected = data?.connected ?? false;
  const groups = groupsWithData(days);

  // `available === null` means the probe has not resolved. Rendering the
  // "phone only" message during that beat would flash the wrong explanation at
  // every member who is in fact on a phone.
  const showConnect = available === true && !connected;
  const webOnly = available === false && !connected;

  const runSync = async () => {
    const res = await sync.mutateAsync();
    toast(
      res.accepted || res.workouts
        ? { title: "Synced", description: `${res.accepted} days, ${res.workouts} workouts.` }
        : { title: "Nothing new", description: res.message ?? "Already up to date." }
    );
  };

  const runConnect = async () => {
    const res = await connect.mutateAsync();
    if (res.accepted || res.workouts) {
      toast({ title: `${storeName} connected`, description: `${res.accepted} days read.` });
    } else {
      toast({
        title: "Connected, but nothing came back",
        description: res.skipped.length
          ? "Check which categories you allowed."
          : (res.message ?? "There may be no data in the last 90 days."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-display font-semibold tracking-tight">
            Your body's own record
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {connected
              ? `From ${storeName}. Updates on its own.`
              : `Activity, sleep and heart data from ${storeName}.`}
          </p>
        </div>
        {connected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={runSync}
            disabled={sync.isPending}
            aria-label="Sync now"
          >
            <RefreshCw className={`w-4 h-4 ${sync.isPending ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {webOnly && (
        <p className="text-sm text-muted-foreground">
          Health data can only be read on your phone. Open Sakred Body on iPhone or Android to
          connect it — anything already synced shows up here too.
          {reason ? <span className="block mt-1 text-xs opacity-70">{reason}</span> : null}
        </p>
      )}

      {showConnect && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            We read a daily summary — movement, sleep, heart, body and workouts — so your progress
            reflects what you actually did. We never write anything back, and you choose which
            categories to share.
          </p>
          <Button onClick={runConnect} disabled={connect.isPending} className="w-full sm:w-auto">
            {connect.isPending ? "Connecting…" : `Connect ${storeName}`}
          </Button>
        </div>
      )}

      {connected && (
        <>
          {groups.map(({ group, metrics }) => (
            <div key={group} className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{group}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {metrics.map((metric) => (
                  <MetricTile key={metric} days={days} metric={metric} />
                ))}
              </div>
            </div>
          ))}

          <HealthWorkouts workouts={data?.workouts ?? []} editable />

          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

          {!isLoading && groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Connected, but nothing has come through yet. If you only just allowed access, give it
              a minute — or check which categories you shared in {storeName}.
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              {data?.connections[0]?.lastSyncAt
                ? `Last synced ${new Date(data.connections[0].lastSyncAt).toLocaleString()}`
                : "Not synced yet"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] text-muted-foreground hover:text-destructive"
              disabled={disconnect.isPending}
              onClick={async () => {
                // Confirmed, because it deletes rather than unlinks — a member
                // who taps it expecting "pause" cannot get the history back.
                if (
                  !window.confirm(
                    "Disconnect and delete every health measurement we hold for you? This cannot be undone."
                  )
                )
                  return;
                const res = await disconnect.mutateAsync();
                toast({
                  title: "Disconnected",
                  description: `${res.deletedDays ?? 0} days deleted.`,
                });
              }}
            >
              <Link2Off className="w-3.5 h-3.5 mr-1.5" />
              Disconnect
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
