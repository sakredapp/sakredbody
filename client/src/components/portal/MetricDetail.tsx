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
import { METRIC_DISPLAY, type DaySeries } from "@/lib/healthDisplay";
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
  // The most recent day we hold is not necessarily today — sync runs when the
  // phone feels like it. `today` is only used to word the date, never to claim
  // the reading is current.
  const today = new Date().toISOString().slice(0, 10);

  const history = latest ? points.filter((p) => p.onDate !== latest.onDate) : [];
  const baseline =
    history.length >= 5 ? history.reduce((a, b) => a + b.value, 0) / history.length : null;

  const delta = latest && baseline ? latest.value - baseline : null;
  const better =
    delta === null || display?.higherIsBetter === null || display?.higherIsBetter === undefined
      ? null
      : delta > 0 === display.higherIsBetter;

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

            {baseline !== null && delta !== null && (
              <div className="rounded-xl border border-border/40 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Against your own usual
                </p>
                <p
                  className={cn(
                    "text-sm mt-1",
                    better === true && "text-[hsl(var(--gold))]",
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
