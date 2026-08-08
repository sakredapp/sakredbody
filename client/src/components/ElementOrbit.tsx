import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface OrbitElement {
  element: string;
  organs: string;
  season: string;
  /** An `hsl()` triplet or a `var(--…)` reference. */
  color: string;
  reads: string;
}

/**
 * The five elements as an orrery.
 *
 * A list of five cards says the elements are five things. A ring that turns
 * says they are one cycle with five stations — which is the actual claim, and
 * the reason the seasons are attached to them at all.
 *
 * The nodes ride a tilted ellipse: the near half comes forward, larger and
 * brighter, the far half recedes. Positions are written straight to the DOM
 * inside the animation frame, so the ring turns at sixty frames without React
 * re-rendering anything. Hovering a node stops the ring and holds it.
 */
export function ElementOrbit({ elements }: { elements: OrbitElement[] }) {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const heldRef = useRef(false);
  heldRef.current = held;

  const n = elements.length;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let running = true;
    let angle = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      if (!heldRef.current && !reduced) angle += dt * 0.16; // radians a second

      for (let i = 0; i < n; i++) {
        const el = nodeRefs.current[i];
        if (!el) continue;
        // Start at the front of the ring and go round.
        const a = angle + (Math.PI * 2 * i) / n + Math.PI / 2;
        const x = Math.cos(a);
        const depth = Math.sin(a); // -1 far, 1 near

        const left = 50 + x * 40;
        const top = 50 + depth * 21;
        const scale = 0.78 + ((depth + 1) / 2) * 0.34;
        const opacity = 0.45 + ((depth + 1) / 2) * 0.55;

        el.style.left = `${left}%`;
        el.style.top = `${top}%`;
        el.style.transform = `translate(-50%, -50%) scale(${scale})`;
        el.style.opacity = `${opacity}`;
        el.style.zIndex = `${Math.round(depth * 10) + 20}`;
      }

      if (running) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [n]);

  const current = elements[active];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="relative w-full aspect-[16/11] max-w-[40rem] mx-auto" data-testid="element-orbit">
        {/* The ring the stations ride, drawn as an ellipse in perspective. */}
        <svg viewBox="0 0 100 70" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <ellipse
            cx="50"
            cy="35"
            rx="40"
            ry="21"
            fill="none"
            stroke="hsl(var(--gold) / 0.2)"
            strokeWidth="0.25"
          />
          <ellipse
            cx="50"
            cy="35"
            rx="30"
            ry="15.5"
            fill="none"
            stroke="hsl(var(--gold) / 0.08)"
            strokeWidth="0.2"
          />
        </svg>

        {/* What the held element reads as, in the middle of its own cycle. */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-[24%] z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              className="text-center"
            >
              <p className="font-display text-2xl mb-1">{current.element}</p>
              <p className="text-xs text-gold mb-3">
                {current.organs} · {current.season}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-orbit-detail">
                {current.reads}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {elements.map((el, i) => (
          <button
            key={el.element}
            ref={(node) => {
              nodeRefs.current[i] = node;
            }}
            onMouseEnter={() => {
              setHeld(true);
              setActive(i);
            }}
            onMouseLeave={() => setHeld(false)}
            onFocus={() => {
              setHeld(true);
              setActive(i);
            }}
            onBlur={() => setHeld(false)}
            onClick={() => setActive(i)}
            aria-label={`${el.element} — ${el.organs}, ${el.season}`}
            aria-pressed={i === active}
            className="absolute flex flex-col items-center gap-2 group"
            style={{ left: "50%", top: "50%" }}
            data-testid={`orbit-node-${i}`}
          >
            <span
              className="h-4 w-4 rounded-full border border-white/10 transition-shadow duration-300 group-hover:shadow-gold-medium"
              style={{ backgroundColor: `hsl(${el.color})` }}
            />
            <span className="text-[11px] sm:text-xs whitespace-nowrap text-muted-foreground group-hover:text-foreground transition-colors">
              {el.season}
            </span>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Five stations of one cycle. Hover to hold it.
      </p>
    </div>
  );
}
