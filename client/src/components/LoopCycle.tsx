import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { breathAt, elapsed } from "@/lib/breath";

export interface LoopBeat {
  step: string;
  body: string;
}

/**
 * A loop, drawn as a loop.
 *
 * Four boxes in a row said these were four things and then needed a sentence
 * underneath — "then repeat, adaptation is a cycle, not a finish line" — to
 * take the row back and explain that it wasn't one. A ring says it without the
 * sentence: there is no first box and no last box, and the light going round
 * shows the direction the beats run in.
 *
 * The travelling mark rides the shared breath clock, so it slows and gathers
 * with everything else on the page rather than ticking at its own rate.
 */
const SIZE = 200;
const C = SIZE / 2;
const RADIUS = 76;
const GAP = 0.11; // radians of clear air between arcs

function polar(angle: number, r: number) {
  return { x: C + Math.cos(angle) * r, y: C + Math.sin(angle) * r };
}

function arcPath(from: number, to: number, r: number) {
  const a = polar(from, r);
  const b = polar(to, r);
  const large = to - from > Math.PI ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function LoopCycle({ beats }: { beats: LoopBeat[] }) {
  const [active, setActive] = useState(0);
  const markRef = useRef<SVGCircleElement>(null);
  const n = beats.length;
  const span = (Math.PI * 2) / n;

  useEffect(() => {
    let raf = 0;
    let running = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = (now: number) => {
      const t = elapsed(now);
      // A quarter turn per breath cycle, eased by the breath itself, so the
      // mark gathers pace on the inhale and settles on the exhale.
      const a = (t * 0.16 + breathAt(t) * 0.05) * Math.PI * 2 - Math.PI / 2;
      const p = polar(a, RADIUS);
      if (markRef.current) {
        markRef.current.setAttribute("cx", p.x.toFixed(2));
        markRef.current.setAttribute("cy", p.y.toFixed(2));
      }
      if (running && !reduced) raf = requestAnimationFrame(frame);
    };
    // One frame regardless: the mark is placed, then holds. A ring with no
    // mark on it would read as a rendering fault rather than a preference.
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const current = beats[active];

  return (
    <div className="relative mx-auto w-full max-w-[24rem]" data-testid="loop-cycle">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto overflow-visible" role="img" aria-label="The operating loop">
        {beats.map((beat, i) => {
          const from = -Math.PI / 2 + i * span + GAP / 2;
          const to = -Math.PI / 2 + (i + 1) * span - GAP / 2;
          const on = i === active;
          return (
            <path
              key={beat.step}
              d={arcPath(from, to, RADIUS)}
              fill="none"
              stroke={on ? "hsl(var(--gold))" : "hsl(var(--gold) / 0.28)"}
              strokeWidth={on ? 5 : 3}
              strokeLinecap="round"
              className="transition-all duration-300 cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
            />
          );
        })}

        {/* Direction. One mark, going round, forever. */}
        <circle ref={markRef} r="3.4" fill="hsl(var(--gold))" opacity="0.9" />
      </svg>

      {/* The beat names sit on the ring in real type. */}
      {beats.map((beat, i) => {
        const mid = -Math.PI / 2 + (i + 0.5) * span;
        const p = polar(mid, RADIUS + 22);
        return (
          <button
            key={beat.step}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={`absolute -translate-x-1/2 -translate-y-1/2 font-display text-lg sm:text-xl transition-colors px-1 ${
              i === active ? "text-gold" : "text-muted-foreground hover:text-foreground"
            }`}
            style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%` }}
            data-testid={`loop-beat-${i}`}
          >
            {beat.step}
          </button>
        );
      })}

      {/* The reading sits in the middle of the ring, where the eye already is. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-[22%]">
        <AnimatePresence mode="wait">
          <motion.p
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="text-center text-[0.78rem] sm:text-sm text-muted-foreground leading-relaxed"
            data-testid="text-loop-detail"
          >
            {current.body}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
