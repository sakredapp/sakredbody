import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface AscentStage {
  stage: string;
  body: string;
}

/**
 * Four stages that stand on each other, drawn standing on each other.
 *
 * As a four-across grid the capacity model read as four equivalent options,
 * which is the one thing it isn't — the section is titled "health is the
 * floor, not the ceiling", and a row of identical boxes states the opposite.
 * Rising columns put the claim in the geometry: each stage is taller than the
 * one before, and the first one is the ground the rest are standing on.
 */
export function AscentChart({ stages, testId }: { stages: AscentStage[]; testId?: string }) {
  const [active, setActive] = useState(stages.length - 1);

  return (
    <div className="max-w-3xl mx-auto" data-testid={testId}>
      <div className="flex items-end gap-2 sm:gap-4 h-56 sm:h-64">
        {stages.map((s, i) => {
          const on = i === active;
          // 42% for the floor up to full height for expression.
          const height = 42 + (i / Math.max(1, stages.length - 1)) * 58;
          return (
            <button
              key={s.stage}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-pressed={on}
              className="relative flex-1 flex flex-col justify-end group"
              style={{ height: "100%" }}
              data-testid={`ascent-${i}`}
            >
              <motion.div
                className="rounded-t-xl border-t border-x relative overflow-hidden"
                initial={{ height: 0 }}
                whileInView={{ height: `${height}%` }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.7, delay: i * 0.09, ease: "easeOut" }}
                style={{
                  borderColor: on ? "hsl(var(--gold) / 0.65)" : "hsl(var(--gold) / 0.22)",
                  background: on
                    ? "linear-gradient(to top, hsl(var(--gold) / 0.26), hsl(var(--gold) / 0.05))"
                    : "linear-gradient(to top, hsl(var(--gold) / 0.1), transparent)",
                }}
              >
                <span
                  className={`absolute inset-x-0 top-3 text-[0.62rem] sm:text-[0.7rem] uppercase tracking-[0.12em] transition-colors ${
                    on ? "text-gold" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {s.stage}
                </span>
              </motion.div>
            </button>
          );
        })}
      </div>

      {/* The floor the whole thing stands on. */}
      <div className="h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      <div className="text-center max-w-md mx-auto mt-6 min-h-[4rem]">
        <AnimatePresence mode="wait">
          <motion.p
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="text-sm text-muted-foreground leading-relaxed"
            data-testid="text-ascent-detail"
          >
            {stages[active].body}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
