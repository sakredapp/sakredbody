import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * How the reading is assembled — four sources, one terrain, two directions.
 *
 * ── The one rule this diagram exists to keep ──────────────────────────────
 *
 * The sources stay on screen after they converge. Every product in this
 * category draws inputs vanishing into a box and a number coming out, which
 * is the shape of an oracle: you are told the conclusion and cannot audit it.
 * Sakred's whole argument is the opposite — the app shows its working, the
 * member's own report can outvote a wearable, and the reading is allowed to
 * change its mind at four in the afternoon.
 *
 * So the columns remain visible beside the reading rather than being consumed
 * by it, and each one keeps its own label. A visitor should be able to point
 * at "energy" and say which side of the diagram it came from.
 *
 * ── The animation target ──────────────────────────────────────────────────
 *
 * This is deliberately a static composition for now. When the intelligence
 * animation is built, this is the component it replaces: signals travel from
 * each column into the reading, the reading brightens, and a charge leaves it
 * toward whichever direction the day is asking for. Nothing about the markup
 * below assumes stillness, and the source lists are already data.
 */

export interface ChainSource {
  label: string;
  kind: string;
  items: string[];
}

export const CHAIN_SOURCES: ChainSource[] = [
  {
    label: "Measured",
    kind: "What an instrument can observe",
    items: ["Sleep", "HRV", "Resting heart rate", "Movement", "Training load"],
  },
  {
    label: "Reported",
    kind: "What only you can know",
    items: ["Energy", "Recovery", "Nervous system", "Digestion", "Clarity", "Drive"],
  },
  {
    label: "Rhythm",
    kind: "What today is, regardless of you",
    items: ["The day you're on", "Season", "Moon", "Cycle"],
  },
  {
    label: "Practice",
    kind: "What you're actually running",
    items: ["Habits", "Routines", "Coach's plan", "Sessions logged"],
  },
];

export function SignalChain({ className, testId }: { className?: string; testId?: string }) {
  return (
    <div className={cn("max-w-4xl mx-auto", className)} data-testid={testId}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CHAIN_SOURCES.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
            className="rounded-lg border border-gold/15 bg-black/20 p-4"
            data-testid={`chain-source-${s.label.toLowerCase()}`}
          >
            <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gold mb-1">{s.label}</p>
            <p className="text-[0.7rem] text-muted-foreground leading-snug mb-3">{s.kind}</p>
            <ul className="space-y-1">
              {s.items.map((it) => (
                <li key={it} className="text-xs text-foreground/85">
                  {it}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <Arrow />

      {/* The reading. Not a score — see TerrainToday in the app for the same
          argument made in the product: a single number is the one thing this
          category over-claims, and it is what makes a reading unarguable. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="rounded-lg border border-gold/35 bg-gold/[0.06] px-6 py-5 text-center shadow-gold-subtle"
        data-testid="chain-reading"
      >
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gold mb-2">Terrain now</p>
        <p className="font-display text-2xl md:text-3xl leading-snug">
          What this body is asking for <span className="text-gold">today.</span>
        </p>
        <p className="text-xs text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
          Stated as a lean with its reasons shown, not a score. You can see which fact pulled which way.
        </p>
      </motion.div>

      <Arrow />

      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { name: "Restore", body: "Clear, drain, regulate, rebuild." },
          { name: "Build", body: "Load, challenge, adapt, repeat." },
        ].map((d, i) => (
          <motion.div
            key={d.name}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.45, delay: i * 0.1, ease: "easeOut" }}
            className="rounded-lg border border-gold/15 px-5 py-4 text-center"
            data-testid={`chain-direction-${d.name.toLowerCase()}`}
          >
            <p className="font-display text-xl mb-1">{d.name}</p>
            <p className="text-xs text-muted-foreground">{d.body}</p>
          </motion.div>
        ))}
      </div>

      {/* The loop closes. A chain that ends at "do this" is a prescription; the
          thing that makes it a practice is that the result comes back in as
          tomorrow's Reported column. */}
      <div className="mt-5 flex items-center justify-center gap-3 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-px w-8 bg-gold/30" aria-hidden="true" />
        Notice the response · adjust · read again
        <span className="h-px w-8 bg-gold/30" aria-hidden="true" />
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center py-4" aria-hidden="true">
      <span className="h-8 w-px bg-gradient-to-b from-gold/40 to-gold/10" />
    </div>
  );
}
