/**
 * The gold ring with a number in it.
 *
 * The single most recognisable object in the mockups, and the one thing the
 * portal had no version of. Used for anything that is a proportion of a whole:
 * today's progress through a protocol, a week's consistency, a room's capacity.
 *
 * ── Deliberately not a charting library ───────────────────────────────────
 *
 * It is two SVG circles. Recharts or Chart.js would add ~50kB gzipped to draw
 * an arc, and every one of them wants to own its own colours and tooltips,
 * which is precisely the part that has to match the rest of the app.
 *
 * ── The arc is drawn, not filled ──────────────────────────────────────────
 *
 * `strokeDasharray` on a circle plus a -90° rotation gives a ring that starts
 * at twelve o'clock and fills clockwise. The alternative — an SVG path arc —
 * needs trigonometry per render and breaks at exactly 100%, where the start
 * and end points coincide and the arc collapses to nothing.
 *
 * Reduced motion is honoured: the ring still shows the right value, it simply
 * arrives there instead of sweeping.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface DialProps {
  /** 0–1. Clamped, so a caller dividing by zero can't produce a broken ring. */
  value: number;
  /** Big text in the middle. Defaults to the value as a percentage. */
  label?: string;
  /** Small text under it — "High", "Today's progress". */
  caption?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  "data-testid"?: string;
}

export function Dial({
  value,
  label,
  caption,
  size = 132,
  strokeWidth = 4,
  className,
  "data-testid": testId,
}: DialProps) {
  const safe = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(safe);
      return;
    }
    // One frame's delay so the transition has a "from" to animate out of —
    // setting the final value in the same paint as mount produces no sweep.
    const id = requestAnimationFrame(() => setShown(safe));
    return () => cancelAnimationFrame(id);
  }, [safe]);

  // Inset by half the stroke, or the ring is clipped by the viewBox edge.
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      data-testid={testId}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--gold))"
          strokeOpacity={0.14}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--gold))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-display leading-none text-gold-light"
          style={{ fontSize: size * 0.28 }}
        >
          {label ?? `${Math.round(safe * 100)}`}
        </span>
        {caption && (
          <span
            className="text-muted-foreground mt-1 text-center leading-tight px-2"
            style={{ fontSize: Math.max(10, size * 0.085) }}
          >
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
