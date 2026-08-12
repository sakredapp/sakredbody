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
      {/*
        ── Why the dots are not in the SVG ───────────────────────────────────

        The viewBox is 100 units wide stretched to whatever the container is —
        about 350px — while the height maps one to one. Every shape inside is
        therefore scaled roughly 3.5x horizontally and 1x vertically, so a
        <circle> renders as a wide flat ellipse. That much was diagnosed
        correctly the first time; the fix was not.

        The first attempt drew each dot as a zero-length subpath with a round
        linecap and `vectorEffect="non-scaling-stroke"`, reasoning that stroke
        width is the one thing a transform cannot touch. On paper that holds.
        In WebKit it does not: non-scaling-stroke on a degenerate subpath is
        applied inconsistently, and on the phone the dots stayed oval. Two
        rounds of clever geometry inside a deliberately distorted coordinate
        system is a sign the coordinate system is the problem.

        So the markers left it. The line keeps the stretchable viewBox, because
        stretching is exactly what a line of unknown width wants. The dots are
        ordinary elements in the page's own coordinates — positioned by
        percentage across and by pixel down, sized in pixels — where nothing is
        scaling anything and a circle is round because it is a circle.
      */}
      <div className="relative w-full" style={{ height }}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="overflow-visible block"
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
        </svg>
        {points.map((p, i) => {
          const isLast = i === last;
          const size = isLast ? 5 : 3;
          return (
            <span
              key={p.label + i}
              aria-hidden="true"
              className="absolute rounded-full pointer-events-none"
              style={{
                // `x(i)` is already a position in a 100-unit space, which is a
                // percentage by construction. The vertical axis maps 1:1 to
                // pixels, so `y` needs no conversion either.
                left: `${x(i)}%`,
                top: y(p.value),
                width: size,
                height: size,
                marginLeft: -size / 2,
                marginTop: -size / 2,
                background: isLast ? "hsl(var(--gold-light))" : "hsl(var(--gold))",
                opacity: isLast ? 1 : 0.55,
              }}
            />
          );
        })}
      </div>

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
