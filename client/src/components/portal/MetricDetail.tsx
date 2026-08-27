/**
 * One measurement, on a date, with its history.
 *
 * ── The complaint this answers ────────────────────────────────────────────
 *
 * Every swatch on the home screen opened the same place, so tapping Sleep and
 * tapping Steps did exactly the same thing. Worse, nothing said *when* a
 * number was from — and a figure with no date attached is, in the words of the
 * person who found it, useless data. A resting heart rate that might be from
 * today or might be from Tuesday cannot be acted on either way.
 *
 * So: the date is stated on every reading, in the member's own words —
 * "today", "yesterday", or the actual day — and the last four weeks are drawn
 * underneath so a single figure is never the whole story.
 *
 * ── Comparison is against themselves ──────────────────────────────────────
 *
 * The trailing average excludes the day being shown, otherwise the number is
 * partly being compared with itself and every deviation flattens. There is no
 * population norm anywhere in here, because 52 resting beats is excellent for
 * one person and a warning for another.
 *
 * ── No score ──────────────────────────────────────────────────────────────
 *
 * Deliberately no rating, no ring and no colour-coded verdict on a metric
 * where effort doesn't move the number. Sleep is the case that matters: a ring
 * implies a target and a target implies you failed, which is a strange thing
 * to tell somebody about a night they didn't choose.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkline } from "@/components/portal/Sparkline";
import { useState } from "react";
import {
  METRIC_DISPLAY,
  adviceFor,
  isStillCounting,
  localToday,
  sleepTonight,
  type DaySeries,
} from "@/lib/healthDisplay";
import { selectSupport, type SupportPrimitive } from "@shared/models/apothecary";
import { useApothecaryLinks, type ApothecaryLink } from "@/hooks/use-apothecary-links";
import type { HealthMetric } from "@shared/models/health";
import { cn } from "@/lib/utils";

/** "today", "yesterday", or a real date. Never a bare number with no when. */
function whenLabel(onDate: string, today: string): string {
  if (onDate === today) return "today";
  const diff = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${onDate}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 1) return "yesterday";
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  const [y, m, d] = onDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function MetricDetail({
  metric,
  days,
  onClose,
}: {
  metric: HealthMetric | null;
  days: DaySeries[];
  onClose: () => void;
}) {
  const display = metric ? METRIC_DISPLAY[metric] : null;

  const points = metric
    ? days
        .map((d) => ({ onDate: d.onDate, value: d[metric] }))
        .filter((p): p is { onDate: string; value: number } => typeof p.value === "number")
        .sort((a, b) => a.onDate.localeCompare(b.onDate))
    : [];

  const latest = points.length ? points[points.length - 1] : null;
  /**
   * The member's own date, not UTC.
   *
   * This was `new Date().toISOString()`, which is the same off-by-a-day fault
   * that made Restore claim health data wasn't connected: west of Greenwich,
   * an evening is already tomorrow in UTC, so a reading taken today would be
   * labelled "yesterday" from about 20:00 onward.
   *
   * The most recent day we hold is still not necessarily today — sync runs
   * when the phone feels like it — which is exactly why the label has to be
   * right.
   */
  const today = localToday();

  const history = latest ? points.filter((p) => p.onDate !== latest.onDate) : [];
  const rawBaseline =
    history.length >= 5 ? history.reduce((a, b) => a + b.value, 0) / history.length : null;

  /**
   * Whether this reading is still being added to as we look at it.
   *
   * Steps, distance and burn accumulate; at lunchtime they are a fraction of
   * the day and comparing them to a full day's usual reports a collapse that
   * is really just the clock. The number stays — it is true — but everything
   * downstream of a comparison is withheld until the day is done, which is why
   * this suppresses the baseline itself rather than only the sentence: the
   * advice and the suggestions below both read from it.
   */
  const stillCounting = Boolean(
    metric && latest && isStillCounting(metric, latest.onDate, today),
  );
  const baseline = stillCounting ? null : rawBaseline;

  const delta = latest && baseline ? latest.value - baseline : null;

  /** A figure to aim at tonight, on the sleep screen only. Null when square. */
  const tonight = metric === "sleepMinutes" ? sleepTonight(points, baseline) : null;
  const better =
    delta === null || display?.higherIsBetter === null || display?.higherIsBetter === undefined
      ? null
      : delta > 0 === display.higherIsBetter;

  const advice =
    metric && latest ? adviceFor(metric, latest.value, baseline) : null;

  /**
   * What Sakred would actually do about this reading.
   *
   * Conditions come from this metric alone — the screen is about one number,
   * so it should not imply it has read the whole day. `depleted` is passed
   * whenever the reading is the bad direction, which is what withholds sauna
   * and cold from somebody already short. See support.ts.
   */
  const conditions =
    metric === "sleepMinutes" && delta != null && delta <= -45
      ? (["low_sleep", "trouble_winding_down"] as const)
      : metric === "heartRateVariability" && baseline && latest && latest.value / baseline <= 0.9
        ? (["low_recovery", "wired"] as const)
        : metric === "restingHeartRate" && delta != null && delta >= 3
          ? (["low_recovery"] as const)
          : metric === "steps" && delta != null && delta <= -2000
            ? (["low_movement"] as const)
            : ([] as const);

  const support = selectSupport({ conditions: [...conditions], depleted: true });

  /**
   * Products attached to these suggestions, if any.
   *
   * Through the shared resolver so that a sleep card, a Restore card and the
   * Apothecary all answer "does this have a product" identically. Guidance
   * renders whether or not this resolves.
   */
  const { linkFor } = useApothecaryLinks();

  const best = points.length ? Math.max(...points.map((p) => p.value)) : null;
  const worst = points.length ? Math.min(...points.map((p) => p.value)) : null;

  return (
    <Dialog open={Boolean(metric)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="metric-detail">
        <DialogHeader>
          <DialogTitle className="font-display">{display?.label ?? "Measurement"}</DialogTitle>
        </DialogHeader>

        {!latest || !display ? (
          <p className="text-sm text-muted-foreground">Nothing has come through for this yet.</p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="font-display text-3xl">{display.format(latest.value)}</p>
              {/* The whole point. A number with no date is not information. */}
              <p className="text-xs text-muted-foreground mt-1">
                {whenLabel(latest.onDate, today)} · {latest.onDate}
              </p>
            </div>

            {/*
              Said plainly, instead of a comparison that would be wrong.

              The alternative was to show nothing here, which reads as the app
              having no opinion — and a member who saw "down on your usual"
              yesterday will assume something broke. Naming the reason is one
              line and it is the true one.
            */}
            {stillCounting && (
              <div className="rounded-xl border border-border/40 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Today so far
                </p>
                <p className="text-sm mt-1">Still counting.</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  We'll compare it with your usual once the day is done.
                </p>
              </div>
            )}

            {baseline !== null && delta !== null && (
              <div className="rounded-xl border border-border/40 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Against your own usual
                </p>
                <p
                  className={cn(
                    "text-sm mt-1",
                    better === true && "text-gold",
                    better === false && "text-destructive",
                  )}
                >
                  {Math.abs(delta) < 0.5
                    ? "About the same as usual."
                    : `${delta > 0 ? "Up" : "Down"} on your usual ${display.format(baseline)}.`}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Your average over the {history.length} other days we hold — not a target, and not
                  a comparison with anybody else.
                </p>
              </div>
            )}

            {/*
              A number to aim at tonight.

              The screen could say you were down on your average and stop,
              which is a diagnosis with no instruction attached — the member
              agrees, changes nothing, and already knew. This gives the figure,
              and the figure is usually larger than people will allow
              themselves: eight hours down across a week needs a long night to
              clear, and most people won't take one because ten hours in bed
              feels like sloth. Saying the number out loud is the point.

              Built from their own baseline and their own shortfall. No
              eight-hours-is-healthy anywhere in it.
            */}
            {tonight && (
              <div className="rounded-xl border border-[hsl(var(--gold))]/25 p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-gold/70">
                  Tonight
                </p>
                <p className="font-display text-2xl">
                  Aim for {display.format(tonight.target)}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  You're {display.format(tonight.debt)} short across the last {tonight.nights}{" "}
                  nights, against your usual {display.format(baseline ?? 0)}. A long night makes
                  most of that back.
                </p>
                <p className="text-xs text-gold/85 leading-snug">
                  Attention and judgement are the first things short sleep takes, and the first
                  things that come back once you catch up.
                </p>
              </div>
            )}

            {/*
              What to do about it.

              The first version of this screen was a value, a baseline and a
              chart — and the reaction to it was "this didn't tell me anything
              about my sleep". They already knew they slept badly. A chart of a
              thing is not information about the thing.
            */}
            {advice && (
              <div className="rounded-xl border border-[hsl(var(--gold))]/20 p-3 space-y-1.5">
                <p className="text-sm font-medium leading-snug">{advice.title}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{advice.body}</p>
                <p className="text-xs text-gold/85 leading-snug">{advice.tip}</p>

                {/* The herbal half of the practice, where there is a real
                    traditional answer to this reading. Named preparations and
                    how they are used — never a dose, never a claim to treat. */}
                {advice.remedy && (
                  <div className="pt-2 mt-1 border-t border-[hsl(var(--gold))]/15 space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-gold/70">
                      {advice.remedy.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {advice.remedy.body}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/*
              What Sakred would do about it — the step that turns a dashboard
              into a practice.

              Spread across kinds on purpose: something to drink, something to
              take, something to do. Three teas would be a shop.
            */}
            {support.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-gold/70">
                  Try tonight
                </p>
                {support.map((p) => (
                  <SupportCard
                    key={p.id}
                    primitive={p}
                    link={linkFor(p.id)}
                  />
                ))}
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Last {Math.min(points.length, 28)} readings
              </p>
              <Sparkline
                points={points.slice(-28).map((p) => ({
                  label: p.onDate.slice(5),
                  value: p.value,
                }))}
                height={72}
                data-testid="metric-detail-spark"
              />
            </div>

            {best !== null && worst !== null && best !== worst && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-widest">
                    Highest
                  </p>
                  <p className="mt-0.5">{display.format(best)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-widest">
                    Lowest
                  </p>
                  <p className="mt-0.5">{display.format(worst)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


/**
 * One thing to try, with the lineage folded underneath it.
 *
 * The layering rule the whole product runs on, applied here: the action is
 * what a member reads, the reason is why it fits tonight, and the physiology
 * and the tradition are behind a tap for whoever wants them. Nobody has to
 * know what a rasayana is to make the tea.
 *
 * Cautions are the exception — they render whenever they exist, never behind
 * a tap, because somebody on thyroid medication should not have to be curious
 * to find out that ashwagandha matters to them.
 */
function SupportCard({
  primitive,
  link,
}: {
  primitive: SupportPrimitive;
  /** Null whenever nothing is stocked for this. Renders nothing at all. */
  link: ApothecaryLink | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border/40 p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{primitive.title}</p>
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70 shrink-0">
          {primitive.type}
        </span>
      </div>

      <p className="text-xs leading-snug">{primitive.action}</p>
      <p className="text-[11px] text-muted-foreground leading-snug">{primitive.why}</p>

      {primitive.cautions && (
        <p className="text-[11px] text-caution/80 leading-snug">{primitive.cautions}</p>
      )}

      {/*
        What we actually use, when there is one.

        Absent entirely when nothing is linked — no "coming soon", no empty
        shelf. The practice stands on its own and this is an addition to it.
      */}
      {link && (
        <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--gold))]/20 p-2">
          {link.imageUrl && (
            <img src={link.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] truncate">
              {link.brand ? `${link.brand} · ` : ""}
              {link.name}
            </p>
            {link.note && (
              <p className="text-[10px] text-muted-foreground truncate">{link.note}</p>
            )}
          </div>
          {link.url && (
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[10px] uppercase tracking-widest text-gold shrink-0 tap-clean"
            >
              {link.linkLabel ?? "Get it"}
            </a>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-gold/70 tap-clean"
      >
        {open ? "Less" : "Why this works"}
      </button>
      {open && (
        <div className="border-l border-[hsl(var(--gold))]/20 pl-3 space-y-1">
          <p className="text-[11px] text-muted-foreground leading-snug">{primitive.deeper}</p>
          {primitive.tradition && (
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              {primitive.tradition}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
