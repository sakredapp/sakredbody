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

/**
 * Which readings get a written date under them.
 *
 * This used to be all of them, one `<span>` per point, and with 28 readings in
 * a `max-w-sm` dialog it was worse than unreadable — it was destructive. Flex
 * items do not shrink below their own content, so 28 labels reading `07-16` at
 * `tracking-widest` demanded something like 1,200px, widened the dialog's grid
 * column past the phone, and pushed every centred thing in the dialog off to
 * the right. Respiratory rate appeared to work only because that member had
 * fewer days of it.
 *
 * Evenly spaced and always including the first and last, so the row still says
 * what window is being drawn while fitting inside it. Twenty-eight tick labels
 * under a 72px line were never legible anyway.
 */
function labelIndices(count: number, max: number): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

export function Sparkline({
  points,
  height = 64,
  showLabels = true,
  /** Ticks to write. Five fits a phone; the line still draws every point. */
  maxLabels = 5,
  className,
  emptyNote = "Not enough history yet.",
  "data-testid": testId,
}: {
  points: SparkPoint[];
  height?: number;
  showLabels?: boolean;
  maxLabels?: number;
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
    <div className={cn("w-full min-w-0", className)} data-testid={testId}>
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
        {/*
          Dots drawn as zero-length strokes, not circles.

          The viewBox is 100 units wide and stretched to whatever the container
          is — around 350px — while the height maps one-to-one. So the whole
          drawing is scaled about 3.5x horizontally and 1x vertically, and a
          <circle> came out as a wide flat ellipse. It looked like a rendering
          fault because it was one.

          `vectorEffect="non-scaling-stroke"` already rescued the line, but it
          only protects a stroke, and a circle's roundness is its geometry. A
          zero-length subpath with a round linecap draws a dot whose diameter is
          the stroke width — and stroke width is exactly the thing the transform
          cannot touch. So these stay round at any container width, with no
          measuring and no resize handling.

          Smaller than the old radii as well: 3px and 5px across, where the
          circles were 4 and 6 before being stretched to about 14 and 21.
        */}
        {points.map((p, i) => (
          <path
            key={p.label + i}
            d={`M ${x(i)} ${y(p.value)} L ${x(i)} ${y(p.value)}`}
            stroke={i === last ? "hsl(var(--gold-light))" : "hsl(var(--gold))"}
            strokeOpacity={i === last ? 1 : 0.55}
            strokeWidth={i === last ? 5 : 3}
            strokeLinecap="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {showLabels && (
        <div className="flex justify-between gap-2 mt-2 min-w-0">
          {labelIndices(points.length, maxLabels).map((i) => (
            <span
              key={points[i].label + i}
              className={cn(
                "text-[10px] uppercase tracking-widest whitespace-nowrap",
                i === last ? "text-[hsl(var(--gold))]" : "text-muted-foreground/60",
              )}
            >
              {points[i].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
