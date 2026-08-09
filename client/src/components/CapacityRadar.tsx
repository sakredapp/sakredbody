import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { breathAt, elapsed } from "@/lib/breath";

export interface Quality {
  name: string;
  body: string;
}

/**
 * Six qualities drawn as one shape.
 *
 * As a list of six headed paragraphs this said "here are six words", and the
 * six words were the least interesting thing about them — the claim is that
 * capacity is the *area* they enclose, and that a body long on one spoke and
 * short on the next has less of it than the numbers suggest. A list cannot
 * say that. A closed figure says it before you read a word.
 *
 * The vertices carry a slow independent drift on the shared breath clock, so
 * the figure reads as a living envelope rather than a plotted dataset. Nothing
 * here is a measurement and it is not labelled as one.
 */
const R = 78;
const CX = 100;
const CY = 100;

function vertex(i: number, n: number, radius: number) {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return { x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius, a };
}

export function CapacityRadar({ qualities }: { qualities: Quality[] }) {
  const [active, setActive] = useState(0);
  const shapeRef = useRef<SVGPolygonElement>(null);
  const n = qualities.length;

  useEffect(() => {
    let raf = 0;
    let running = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = (now: number) => {
      const t = elapsed(now);
      const breath = breathAt(t);
      const pts: string[] = [];
      for (let i = 0; i < n; i++) {
        // Each spoke drifts on its own slow period, so the envelope never
        // settles into a regular hexagon and never looks plotted.
        const drift = Math.sin(t * (0.23 + i * 0.037) + i * 1.7) * 0.07;
        const r = R * (0.72 + drift + breath * 0.09);
        const p = vertex(i, n, r);
        pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
      }
      if (shapeRef.current) shapeRef.current.setAttribute("points", pts.join(" "));
      if (running && !reduced) raf = requestAnimationFrame(frame);
    };
    // One frame regardless, so a reduced-motion visitor still gets the shape —
    // it simply holds still instead of breathing. The canvas surfaces do the
    // same thing through `mountStage`; this one drives its own loop.
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [n]);

  const current = qualities[active];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="relative mx-auto w-full max-w-[26rem]" data-testid="capacity-radar">
        <svg viewBox="0 0 200 200" className="w-full h-auto overflow-visible" role="img" aria-label="The six qualities of physical capacity">
          {/* Rings. Three, so the figure has a ground to sit against. */}
          {[1, 0.66, 0.33].map((f) => (
            <polygon
              key={f}
              points={Array.from({ length: n }, (_, i) => {
                const p = vertex(i, n, R * f);
                return `${p.x},${p.y}`;
              }).join(" ")}
              fill="none"
              stroke="hsl(var(--gold) / 0.14)"
              strokeWidth="0.6"
            />
          ))}

          {/* Spokes. */}
          {qualities.map((q, i) => {
            const p = vertex(i, n, R);
            return (
              <line
                key={q.name}
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={i === active ? "hsl(var(--gold) / 0.55)" : "hsl(var(--gold) / 0.13)"}
                strokeWidth={i === active ? 0.9 : 0.5}
              />
            );
          })}

          <polygon
            ref={shapeRef}
            points=""
            fill="hsl(var(--gold) / 0.13)"
            stroke="hsl(var(--gold) / 0.65)"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />

          {/* The handles. Sized for a fingertip, not a cursor. */}
          {qualities.map((q, i) => {
            const p = vertex(i, n, R);
            return (
              <g key={q.name}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={i === active ? 3.4 : 2.2}
                  fill={i === active ? "hsl(var(--gold))" : "hsl(var(--gold) / 0.4)"}
                  className="transition-all duration-300"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="14"
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(i)}
                />
              </g>
            );
          })}
        </svg>

        {/* Labels live in the DOM, not the SVG — real type, real wrapping,
            and a tap target that follows the same rules as every other one. */}
        {qualities.map((q, i) => {
          const p = vertex(i, n, R + 20);
          return (
            <button
              key={q.name}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={`absolute -translate-x-1/2 -translate-y-1/2 text-[0.65rem] sm:text-xs uppercase tracking-[0.14em] whitespace-nowrap transition-colors px-1 ${
                i === active ? "text-gold" : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ left: `${(p.x / 200) * 100}%`, top: `${(p.y / 200) * 100}%` }}
              data-testid={`radar-label-${i}`}
            >
              {q.name}
            </button>
          );
        })}
      </div>

      <div className="text-center max-w-md mx-auto mt-6 min-h-[4.5rem]">
        <AnimatePresence mode="wait">
          <motion.p
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="text-sm text-muted-foreground leading-relaxed"
            data-testid="text-radar-detail"
          >
            {current.body}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
