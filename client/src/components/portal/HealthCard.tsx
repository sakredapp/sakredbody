/**
 * The Health card — connect a phone, and see what came back.
 *
 * Shown on Stats. It has three states and they are genuinely different, so it
 * does not try to be one component with a flag:
 *
 *   web           — health only reads on the phone; say so and stop
 *   not connected — one button, and an honest sentence about what we read
 *   connected     — the numbers, when they last arrived, and a way out
 *
 * The way out is deliberately not buried. A member who cannot find how to
 * disconnect their health data reads that as the data not really being theirs.
 */

import { Activity, HeartPulse, Moon, Footprints, RefreshCw, Link2Off } from "lucide-react";
import { useHealthSummary, useHealthSync } from "@/hooks/use-health";
import type { HealthDay } from "@/hooks/use-health";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/** The four a coach looks at first. Everything else lives in the detail view. */
const HEADLINE = [
  { metric: "steps", label: "Steps", icon: Footprints, format: (v: number) => Math.round(v).toLocaleString() },
  { metric: "sleepMinutes", label: "Sleep", icon: Moon, format: (v: number) => `${Math.floor(v / 60)}h ${Math.round(v % 60)}m` },
  { metric: "restingHeartRate", label: "Resting HR", icon: HeartPulse, format: (v: number) => `${Math.round(v)} bpm` },
  { metric: "heartRateVariability", label: "HRV", icon: Activity, format: (v: number) => `${Math.round(v)} ms` },
] as const;

/**
 * The most recent day that actually has this metric — not simply the last day.
 *
 * Today is almost always partial: a member opening the app at 9am has 400
 * steps and no sleep yet, and showing that as their number makes a healthy
 * member look like they have stopped moving.
 */
function latest(days: HealthDay[], metric: string): { value: number; onDate: string } | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const v = days[i][metric as keyof HealthDay];
    if (typeof v === "number") return { value: v, onDate: days[i].onDate };
  }
  return null;
}

function average(days: HealthDay[], metric: string): number | null {
  const values = days
    .map((d) => d[metric as keyof HealthDay])
    .filter((v): v is number => typeof v === "number");
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function HealthCard() {
  const { available, reason, platform, connect, sync, disconnect } = useHealthSync();
  const { data, isLoading } = useHealthSummary(30);
  const { toast } = useToast();

  const storeName = platform === "healthconnect" ? "Health Connect" : "Apple Health";
  const days = data?.days ?? [];
  const connected = data?.connected ?? false;

  // `available === null` means the availability probe has not resolved yet.
  // Rendering the "phone only" message during that beat would flash the wrong
  // explanation at every member on a phone.
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
          <h3 className="text-lg font-display font-semibold tracking-tight">Your body's own record</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {connected
              ? `From ${storeName}. Updates when you open the app.`
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
          connect it — anything already synced will show up here too.
          {reason ? <span className="block mt-1 text-xs opacity-70">{reason}</span> : null}
        </p>
      )}

      {showConnect && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            We read a daily summary — steps, sleep, resting heart rate, HRV and workouts — so your
            progress reflects what you actually did. We never write anything back, and you choose
            which categories to share.
          </p>
          <Button onClick={runConnect} disabled={connect.isPending} className="w-full sm:w-auto">
            {connect.isPending ? "Connecting…" : `Connect ${storeName}`}
          </Button>
        </div>
      )}

      {connected && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {HEADLINE.map(({ metric, label, icon: Icon, format }) => {
              const recent = latest(days, metric);
              const avg = average(days, metric);
              return (
                <div key={metric} className="rounded-xl border border-border/30 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <Icon className="w-3 h-3" />
                    {label}
                  </div>
                  <div className="mt-1.5 text-xl font-display">
                    {recent ? format(recent.value) : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {avg !== null ? `${format(avg)} avg · 30d` : "no data yet"}
                  </div>
                </div>
              );
            })}
          </div>

          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

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
                // Confirmed, because it deletes rather than unlinks — and a
                // member who taps it expecting "pause" cannot get the history
                // back afterwards.
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
