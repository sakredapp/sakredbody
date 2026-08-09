/**
 * A thin gold line showing a week.
 *
 * The mockups use one under "Weekly Performance" and another under "Energy
 * Trend". Both are the same object: a handful of points, no axes, no grid, no
 * legend — a shape you read in a glance rather than a chart you study.
 *
 * ── Why it draws nothing under three points ───────────────────────────────
 *
 * A trend line through two points is a straight segment that says only "these
 * two numbers differ", which is a shape people over-read. Under three points
 * this renders the empty note instead. That matters here specifically: a new
 * member has one or two days of history, and the first thing they'd see is a
 * dramatic line implying a trend from a single day.
 *
 * ── Flat data is a real case ──────────────────────────────────────────────
 *
 * Seven identical values give a zero range, and normalising by it divides by
 * zero. Those draw as a centred flat line, which is the honest picture:
 * nothing changed.
 */

import { cn } from "@/lib/utils";

export interface SparkPoint {
  label: string;
  value: number;
}

export function Sparkline({
  points,
  height = 64,
  showLabels = true,
  className,
  emptyNote = "Not enough history yet.",
  "data-testid": testId,
}: {
  points: SparkPoint[];
  height?: number;
  showLabels?: boolean;
  className?: string;
  emptyNote?: string;
  "data-testid"?: string;
}) {
  if (points.length < 3) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)} data-testid={testId}>
        {emptyNote}
      </p>
    );
  }

  // A 0–100 viewBox with preserveAspectRatio="none" lets the line stretch to
  // any container width without recalculating on resize.
  const W = 100;
  const pad = 8;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) =>
    range === 0 ? height / 2 : pad + (1 - (v - min) / range) * (height - pad * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const last = points.length - 1;

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        <path
          d={path}
          fill="none"
          stroke="hsl(var(--gold))"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          // The viewBox is stretched horizontally, which would stretch the
          // stroke with it. This keeps the line an even weight at any width.
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={p.label + i}
            cx={x(i)}
            cy={y(p.value)}
            r={i === last ? 3 : 2}
            fill={i === last ? "hsl(var(--gold-light))" : "hsl(var(--gold))"}
            fillOpacity={i === last ? 1 : 0.55}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {showLabels && (
        <div className="flex justify-between mt-2">
          {points.map((p, i) => (
            <span
              key={p.label + i}
              className={cn(
                "text-[10px] uppercase tracking-widest",
                i === last ? "text-[hsl(var(--gold))]" : "text-muted-foreground/60",
              )}
            >
              {p.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
