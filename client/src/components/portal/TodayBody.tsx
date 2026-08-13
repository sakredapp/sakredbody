/**
 * Today — what the body has actually done, and what state it is in now.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * Today was the moon. Everything a member wanted to know about their own day —
 * how they slept, how far they had walked, whether they had trained — lived two
 * tabs away under Stats, and the two screens did not agree: Today said movement
 * was down while Stats showed sixteen thousand steps and a five-mile run.
 *
 * The disagreement was fixed at the source. This is the other half: putting the
 * answer where the question is asked. A member opening Today is asking what has
 * happened in their body today and what to do about it next, and until now that
 * screen answered neither.
 *
 * ── Two clocks on one page ────────────────────────────────────────────────
 *
 * The rhythm layer below this — moon, season, personal day — is written once
 * and is still true at midnight. This layer is not. It re-reads on every visit,
 * because a person can wake poorly recovered, train at noon, and be a different
 * proposition by five. Keeping them apart is the whole point: the rhythm gives
 * the day its shape, and the terrain gets the final vote.
 */

import { useState } from "react";
import { CoachPlanCard } from "@/components/portal/CoachPlanCard";
import { useHasActiveCoachPlan } from "@/hooks/use-coach-plan";
import { CheckinRequestCard, useOpenCheckinRequest } from "@/components/portal/CheckinRequestCard";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useHealthSummary } from "@/hooks/use-health";
import {
  METRIC_DISPLAY,
  summarise,
  isStillCounting,
  localToday,
  type DaySeries,
} from "@/lib/healthDisplay";
import { MetricDetail } from "@/components/portal/MetricDetail";
import { TodaysMovement } from "@/components/portal/TodaysMovement";
import type { HealthMetric } from "@shared/schema";

/**
 * The four a member actually opens the app for.
 *
 * Not the twenty-two. The full set still exists one tap away, and a screen that
 * leads with respiratory rate is a dashboard rather than a day.
 */
const HEADLINE_METRICS: HealthMetric[] = [
  "sleepMinutes",
  "steps",
  "activeCalories",
  "distanceMeters",
];

type Reading = {
  lean: "restore" | "build" | "either" | "unknown";
  headline: string;
  reasons: string[];
};

function Tile({
  metric,
  days,
  onOpen,
}: {
  metric: HealthMetric;
  days: DaySeries[];
  onOpen: () => void;
}) {
  const display = METRIC_DISPLAY[metric];
  const stat = summarise(days, metric);
  if (!display || !stat) return null;

  const counting = isStillCounting(metric, stat.onDate);
  const sleep = metric.startsWith("sleep");
  const today = localToday();

  /**
   * Every tile says which day it is. That sounds obvious and was the single
   * most common confusion on this data: a member could not tell whether a
   * number was today, last night, or an average of the month.
   */
  const when = counting
    ? "Today so far"
    : stat.onDate === today
      ? sleep
        ? "Last night"
        : "Today"
      : new Date(`${stat.onDate}T12:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-xl border border-border/30 p-3 text-left transition-colors hover:border-border/60"
      data-testid={`today-metric-${metric}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
        {display.label}
      </div>
      <div className="mt-1.5 text-lg font-display">{display.format(stat.value)}</div>
      <div className="text-[10px] mt-0.5 text-muted-foreground">{when}</div>
    </button>
  );
}

/**
 * The live half.
 *
 * Read fresh on every visit, and deliberately separate from the stored note
 * below it. The note describes the day's rhythm and holds all day; this
 * describes the body and is allowed to change its mind at four in the
 * afternoon, because the member did.
 */
function TerrainNow() {
  const { data } = useQuery<Reading>({ queryKey: ["/api/terrain/today"] });
  if (!data || data.lean === "unknown") return null;

  return (
    <div className="rounded-xl border border-[hsl(var(--gold))]/12 bg-white/[0.03] p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Terrain now</p>
      <p className="font-display text-base leading-snug mt-1.5">{data.headline}</p>
      {data.reasons.length > 0 && (
        <ul className="mt-2 space-y-1">
          {data.reasons.slice(0, 2).map((r, i) => (
            <li key={i} className="text-[11px] text-muted-foreground leading-snug">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TodayBody({ onOpenTrends }: { onOpenTrends?: () => void }) {
  const { data } = useHealthSummary(30);
  /** The same live reading TerrainNow renders — read once, not fetched twice. */
  const { data: terrain } = useQuery<Reading>({ queryKey: ["/api/terrain/today"] });
  const [open, setOpen] = useState<HealthMetric | null>(null);

  const days = (data?.days ?? []) as DaySeries[];
  const workouts = data?.workouts ?? [];

  /**
   * Nothing at all rather than an empty frame. A member who has not connected a
   * phone is not missing a feature here; the rhythm below is still the page.
   *
   * But "no synced metrics" is not the same as "nothing to show". Terrain now
   * reads a member's own check-in, so somebody with no wearable can have a
   * reading — and a coached member can have a plan or a question waiting.
   * Gating all of that behind a phone would have hidden their coach's question
   * from the people least likely to have a watch.
   */
  const present = HEADLINE_METRICS.filter((m) => days.some((d) => typeof d[m] === "number"));
  const hasPlan = useHasActiveCoachPlan();
  const { data: requests } = useOpenCheckinRequest();
  const hasCoachingToShow = hasPlan || (requests?.length ?? 0) > 0;
  const hasReading = Boolean(terrain) && terrain!.lean !== "unknown";
  if (!present.length && !workouts.length && !hasReading && !hasCoachingToShow) return null;

  return (
    <div className="space-y-5">
      {/*
        What is being asked of this person, first.

        The nav calls this destination "Your Plan", so a member who came through
        that door has to land on the plan rather than scroll past four metric
        tiles to find it. Below these, the same page still answers what the body
        actually did — which is the context the plan is held against, not a
        replacement for it.

        Both render nothing at all when there is no plan and no open request,
        which is most people. Their Today is unchanged.
      */}
      <CoachPlanCard terrainLean={terrain?.lean ?? null} />
      <CheckinRequestCard />

      {present.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Your body's own record
            </p>
            {onOpenTrends && (
              <button
                type="button"
                onClick={onOpenTrends}
                className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                data-testid="today-view-trends"
              >
                View trends
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {present.map((m) => (
              <Tile key={m} metric={m} days={days} onOpen={() => setOpen(m)} />
            ))}
          </div>
        </div>
      )}

      <TodaysMovement workouts={workouts} />
      <TerrainNow />

      <MetricDetail metric={open} days={days} onClose={() => setOpen(null)} />
    </div>
  );
}
