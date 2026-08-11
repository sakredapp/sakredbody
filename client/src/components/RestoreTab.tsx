/**
 * Restore — the other half of the product.
 *
 * ── Why this screen had to exist ──────────────────────────────────────────
 *
 * Restore and Build are the two forces the whole of Sakred Body is built on —
 * territories.ts has said so since it was written, in those words. But in the
 * app only one of them was a place. The Restore door on the home screen
 * pointed at `coaching`, which is Today: the daily checklist. So the product
 * presented a pair and delivered a screen and a redirect.
 *
 * That asymmetry is not cosmetic. It is the app telling a member which half it
 * takes seriously, on the screen where it introduces the philosophy.
 *
 * ── What it is, and what it deliberately is not ───────────────────────────
 *
 * Everything here is read from data that already exists: the terrain reading,
 * the health days the phone has synced, and the catalogue's own account of
 * which movement gives capacity back. Nothing is invented, and there is no new
 * checklist — Today already owns the checklist, and a second one that also
 * ticked things off would be two sources of truth about the same morning.
 *
 * No score. See TerrainToday for the argument; it applies here twice over,
 * because "recovery score" is the single most over-claimed number in this
 * category of app.
 */

import { useQuery } from "@tanstack/react-query";
import { Moon, Wind, HeartPulse } from "lucide-react";
import { Panel, SectionHeading } from "@/components/portal/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useHealthSummary } from "@/hooks/use-health";
import { EXERCISE_CATEGORIES, CATEGORY_LOAD } from "@shared/models/training";
import { HabitPanel } from "@/components/habits/HabitPanel";
import { TerrainCheckin } from "@/components/habits/TerrainCheckin";
import type { MemberSection } from "@/components/MemberNav";
import { cn } from "@/lib/utils";

type Reading = {
  lean: "restore" | "build" | "either" | "unknown";
  headline: string;
  reasons: { text: string; pulls: "restore" | "build" }[];
  week: { stress: number; restoration: number; sessions: number };
  hasBody: boolean;
};

/**
 * The movement that gives capacity back, taken from the catalogue rather than
 * listed here.
 *
 * Written as a derivation so it cannot drift: add a restorative category to
 * the taxonomy and it appears on this screen, with no second list to remember.
 */
const RESTORATIVE = EXERCISE_CATEGORIES.filter(
  (c) => (CATEGORY_LOAD[c.id]?.restoration ?? 0) >= 2,
);

/** Mean of a metric across whatever days actually carry it. */
function mean(days: Array<Record<string, unknown>>, metric: string): number | null {
  const vals = days
    .map((d) => d[metric])
    .filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function hoursMinutes(mins: number): string {
  return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
}

export function RestoreTab({ onOpen }: { onOpen: (s: MemberSection) => void }) {
  const terrain = useQuery<Reading>({ queryKey: ["/api/terrain/today"] });
  const health = useHealthSummary(7);

  const days = (health.data?.days ?? []) as Array<Record<string, unknown>>;
  const sleep = mean(days, "sleepMinutes");
  const hrv = mean(days, "heartRateVariability");
  const rhr = mean(days, "restingHeartRate");
  const nothingSynced = sleep === null && hrv === null && rhr === null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl leading-tight">Restore</h1>
        <p className="text-sm text-muted-foreground">
          Capacity is not only built. It is also returned.
        </p>
      </div>

      {/* The list comes first. Everything below it is context for the
          decisions on it, and context that sits above the thing it informs is
          a screen a member scrolls past. */}
      <HabitPanel
        emphasis="yin"
        title="What gives it back"
        emptyLine="Nothing here yet. Sleep, minerals and downshifting are where most people start."
      />

      <TerrainCheckin />

      {/* ── What the terrain is asking for ── */}
      <Panel title="Your terrain" data-testid="restore-terrain">
        {terrain.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : terrain.data ? (
          <div className="space-y-3">
            <p className="font-display text-lg leading-snug">{terrain.data.headline}</p>

            {terrain.data.reasons.length > 0 && (
              <ul className="space-y-1">
                {terrain.data.reasons.map((r) => (
                  <li key={r.text} className="text-sm text-muted-foreground flex gap-2">
                    {/* Which way each fact pulls, so the conclusion is shown
                        working rather than asserted. */}
                    <span
                      className={cn(
                        "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                        r.pulls === "restore"
                          ? "bg-[hsl(var(--gold))]"
                          : "bg-muted-foreground/50",
                      )}
                      aria-hidden="true"
                    />
                    {r.text}
                  </li>
                ))}
              </ul>
            )}

            {terrain.data.week.sessions > 0 && (
              <p className="text-xs text-muted-foreground pt-1 border-t border-[hsl(var(--gold))]/10">
                This week: {terrain.data.week.sessions} session
                {terrain.data.week.sessions === 1 ? "" : "s"} logged
                {terrain.data.week.restoration > 0
                  ? `, ${terrain.data.week.restoration >= terrain.data.week.stress ? "more" : "less"} restoring than demanding`
                  : ", none of it restorative"}
                .
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing to read yet. Connect health data or log a session.
          </p>
        )}
      </Panel>

      {/* ── The numbers this half of the app runs on ── */}
      <Panel
        title="Sleep and recovery"
        action={nothingSynced ? undefined : "Stats"}
        onAction={nothingSynced ? undefined : () => onOpen("coaching")}
        data-testid="restore-recovery"
      >
        {health.isLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : nothingSynced ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nothing synced from your phone yet. Sleep, heart rate variability
              and resting heart rate are what this screen reads.
            </p>
            <Button variant="outline" size="sm" onClick={() => onOpen("settings")}>
              Connect health data
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Metric
              icon={Moon}
              label="Sleep"
              value={sleep === null ? null : hoursMinutes(sleep)}
            />
            <Metric
              icon={Wind}
              label="HRV"
              value={hrv === null ? null : `${Math.round(hrv)} ms`}
            />
            <Metric
              icon={HeartPulse}
              label="Resting"
              value={rhr === null ? null : `${Math.round(rhr)} bpm`}
            />
          </div>
        )}
        {!nothingSynced && !health.isLoading && (
          <p className="text-[11px] text-muted-foreground mt-3">Averaged over the last 7 days.</p>
        )}
      </Panel>

      {/* ── Restoring is something you do, not only something you skip ── */}
      <Panel
        title="Movement that restores"
        action="Open Build"
        onAction={() => onOpen("build")}
        data-testid="restore-movement"
      >
        <p className="text-sm text-muted-foreground mb-3">
          Rest is not the only way to give capacity back. These are logged the
          same as anything else, and they count on the other side of the ledger.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RESTORATIVE.map((c) => (
            <span
              key={c.id}
              className="rounded-full border border-[hsl(var(--gold))]/20 px-2.5 py-1 text-xs text-muted-foreground"
            >
              {c.label}
            </span>
          ))}
        </div>
      </Panel>

      {/* ── The reading from the inside ── */}
      <Panel
        title="The nine centres"
        action="Read"
        onAction={() => onOpen("body")}
        data-testid="restore-centres"
      >
        <p className="text-sm text-muted-foreground">
          What the phone measures is one account of your terrain. What you
          notice is another, and it is usually earlier.
        </p>
      </Panel>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Moon;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--gold))]/10 bg-black/20 px-3 py-2.5">
      <Icon className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">{label}</p>
      {/* An unsynced metric says so rather than showing a dash that reads as
          zero — three of these in a row with dashes looks like a broken screen. */}
      <p className="text-sm mt-0.5 tabular-nums">{value ?? <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}
