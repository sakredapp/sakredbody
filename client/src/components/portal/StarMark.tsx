/**
 * A small constellation, drawn rather than iconified.
 *
 * Onboarding opened each step with a lucide glyph in a tinted circle — a
 * sparkle, a camera, a heart-with-a-pulse, a bell, a grid. Five stock icons
 * from a set every app uses, sitting inside a product whose entire visual
 * argument is that a body and a sky are read by the same eye. They were the
 * one thing on those screens that could have come from anywhere.
 *
 * So: the same idiom as ConstellationBody. Points with magnitudes, lines strung
 * between them, and light that moves. Each step gets its own arrangement from
 * its own seed, so the five screens are recognisably siblings without being
 * repetitions — and nothing here is a picture of the thing it introduces,
 * because a constellation of a camera would be worse than a camera.
 *
 * SVG rather than canvas: it is 40px of a dozen elements, it must stay crisp on
 * every scale factor, and the animation is a stroke-dash and an opacity — all
 * of which CSS does better than a render loop, and without a frame budget on a
 * modal that appears during app launch.
 */

import { useMemo } from "react";

type Point = { x: number; y: number; mag: number };

/**
 * A deterministic arrangement from a seed.
 *
 * Deterministic so a step looks the same every time it is seen — a mark that
 * reshuffled on each render would read as a loading state.
 */
function arrangement(seed: string, count: number): Point[] {
  // xmur3-style string hash, then a small LCG. Enough for stable jitter; this
  // is decoration, not cryptography.
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let s = h >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Points are spread around a ring with jitter rather than placed at random:
  // pure random in a square clusters and leaves corners empty, which reads as
  // a mistake at this size.
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.9;
    const radius = 15 + rand() * 13;
    pts.push({
      x: 32 + Math.cos(angle) * radius,
      y: 32 + Math.sin(angle) * radius * 0.92,
      mag: 0.7 + rand() * 1.1,
    });
  }
  // One bright anchor near the middle, which is what makes it read as a figure
  // rather than a circle of dots.
  pts.push({ x: 30 + rand() * 4, y: 30 + rand() * 4, mag: 1.8 });
  return pts;
}

export function StarMark({ seed, className }: { seed: string; className?: string }) {
  const pts = useMemo(() => arrangement(seed, 6), [seed]);
  const anchor = pts[pts.length - 1];

  return (
    <svg
      viewBox="0 0 64 64"
      className={className ?? "h-11 w-11"}
      role="presentation"
      aria-hidden="true"
    >
      {/* Strung from the anchor outward, the way fascia is drawn on the body —
          the lines are the relationship, not a border. */}
      <g stroke="hsl(var(--gold))" strokeWidth="0.6" strokeLinecap="round">
        {pts.slice(0, -1).map((p, i) => (
          <line
            key={`l${i}`}
            x1={anchor.x}
            y1={anchor.y}
            x2={p.x}
            y2={p.y}
            opacity="0.28"
            className="starmark-line"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </g>

      <g fill="hsl(var(--gold))">
        {pts.map((p, i) => (
          <circle
            key={`p${i}`}
            cx={p.x}
            cy={p.y}
            r={p.mag}
            className="starmark-star"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </g>

      {/* The anchor keeps a soft halo so there is a centre to the thing. */}
      <circle cx={anchor.x} cy={anchor.y} r="4.5" fill="hsl(var(--gold))" opacity="0.12" />
    </svg>
  );
}
