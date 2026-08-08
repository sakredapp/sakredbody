import { useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TerrainStage {
  stage: string;
  body: string;
}

/**
 * The terrain as a ring rather than a stack.
 *
 * Nine stages laid out as an orrery: the cycle is the point — elimination
 * feeds back into digestion — and a vertical list of nine cards said that in
 * a footnote while eating a full screen of scroll. Here the loop is the shape.
 *
 * Scroll drives the rotation. The ring indexes by a little over one station
 * as the section passes, which is what makes it read as a mechanism being
 * turned rather than a diagram sitting there. Labels counter-rotate so they
 * stay upright, and the whole thing holds still under prefers-reduced-motion.
 */
export function TerrainWheel({ stages }: { stages: TerrainStage[] }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const n = stages.length;

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const raw = useTransform(scrollYProgress, [0, 1], [-24, 24]);
  const spin = useSpring(raw, { stiffness: 60, damping: 20, mass: 0.4 });
  const counter = useTransform(spin, (v) => -v);

  // Start at twelve o'clock and go clockwise.
  const pos = (i: number) => {
    const rad = ((-90 + (360 / n) * i) * Math.PI) / 180;
    return { x: 50 + 38 * Math.cos(rad), y: 50 + 38 * Math.sin(rad) };
  };

  return (
    <div className="max-w-3xl mx-auto" ref={ref}>
      <div className="relative w-full aspect-square max-w-[34rem] mx-auto">
        <motion.div className="absolute inset-0" style={reduced ? undefined : { rotate: spin }}>
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
            <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--gold) / 0.22)" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="hsl(var(--gold) / 0.1)" strokeWidth="0.2" />
            {stages.map((_, i) => {
              const a = pos(i);
              const bnext = pos((i + 1) % n);
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={bnext.x}
                  y2={bnext.y}
                  stroke={i === active ? "hsl(var(--gold) / 0.5)" : "hsl(var(--gold) / 0.14)"}
                  strokeWidth="0.25"
                />
              );
            })}
          </svg>

          {stages.map((s, i) => {
            const a = pos(i);
            const on = i === active;
            return (
              <motion.button
                key={s.stage}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                aria-label={s.stage}
                aria-pressed={on}
                className="absolute flex flex-col items-center gap-1.5 group"
                style={{
                  left: `${a.x}%`,
                  top: `${a.y}%`,
                  x: "-50%",
                  y: "-50%",
                  rotate: reduced ? 0 : counter,
                }}
                data-testid={`terrain-node-${i}`}
              >
                <span
                  className={cn(
                    "rounded-full transition-all duration-300",
                    on ? "h-3 w-3 bg-gold shadow-gold-medium" : "h-1.5 w-1.5 bg-gold/40 group-hover:bg-gold/70",
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] sm:text-xs whitespace-nowrap transition-colors",
                    on ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.stage}
                </span>
              </motion.button>
            );
          })}
        </motion.div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-[22%]">
          <AnimatePresence mode="wait">
            <motion.p
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              className="text-center text-sm text-muted-foreground leading-relaxed"
              data-testid="terrain-detail"
            >
              {stages[active].body}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Elimination feeds back into digestion. It closes.
      </p>
    </div>
  );
}
