import { useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlipCard {
  /** The face. Short — a name, a step, a quality. */
  title: string;
  /** The back. The explanation nobody needs until they ask for it. */
  body: ReactNode;
  /** Small line above the title on the face: a step number, a season. */
  meta?: string;
  /** An `hsl()` triplet or `var(--…)`. Tints the edge and the turn mark. */
  accent?: string;
}

/**
 * A list of concepts you handle instead of scroll past.
 *
 * The pattern this replaces is six headed paragraphs stacked down the page:
 * two thousand pixels of column that states everything at once and therefore
 * emphasises nothing. The claims are short and the explanations are long, so
 * they belong on opposite faces of the same object — the name is what you scan
 * and the reasoning is what you ask for.
 *
 * ── On sizing ─────────────────────────────────────────────────────────────
 *
 * Both faces occupy the same grid cell rather than being absolutely
 * positioned. That one decision does the work: the card's height becomes the
 * taller of its two faces, so a long explanation can't spill out of a box cut
 * to fit a short title, and the whole rail settles at one height because the
 * cards are stretched by their row. The first version pinned both faces to a
 * fixed 15rem and clipped anything that didn't fit.
 */
export function FlipCards({
  cards,
  className,
  /** Cards visible at once on a wide screen. */
  columns = 3,
  testId,
}: {
  cards: FlipCard[];
  className?: string;
  columns?: 2 | 3 | 4;
  testId?: string;
}) {
  const [turned, setTurned] = useState<Set<number>>(new Set());
  const railRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const toggle = (i: number) =>
    setTurned((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const nudge = (dir: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: dir * rail.clientWidth * 0.72, behavior: "smooth" });
  };

  // Reduced motion gets the same content with both faces open and no turning.
  if (reduced) {
    return (
      <div
        className={cn("grid gap-5 sm:grid-cols-2", columns >= 3 && "lg:grid-cols-3", className)}
        data-testid={testId}
      >
        {cards.map((c) => (
          <article key={c.title} className="rounded-2xl border border-border bg-card p-6">
            {c.meta && <p className="text-[10px] uppercase tracking-[0.2em] text-gold mb-2">{c.meta}</p>}
            <h3 className="font-display text-xl mb-2.5">{c.title}</h3>
            <div className="text-sm text-muted-foreground leading-relaxed">{c.body}</div>
          </article>
        ))}
      </div>
    );
  }

  const width =
    columns === 2
      ? "w-[84%] sm:w-[calc(50%-0.625rem)]"
      : columns === 4
        ? "w-[84%] sm:w-[calc(50%-0.625rem)] lg:w-[calc(25%-0.94rem)]"
        : "w-[84%] sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.834rem)]";

  return (
    <div className={cn("relative", className)} data-testid={testId}>
      <div
        ref={railRef}
        className="flex items-stretch gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0"
        style={{ perspective: "1800px" }}
      >
        {cards.map((card, i) => {
          const open = turned.has(i);
          const accent = card.accent ?? "var(--gold)";
          const edge = `hsl(${accent} / ${open ? 0.42 : 0.22})`;
          return (
            <div key={card.title} className={cn("shrink-0 snap-start", width)}>
              <motion.button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={open}
                aria-label={`${card.title}. Turn for the reason.`}
                className="group grid h-full w-full text-left cursor-pointer rounded-2xl"
                style={{ transformStyle: "preserve-3d" }}
                animate={{ rotateY: open ? 180 : 0 }}
                whileHover={{ y: -3 }}
                transition={{
                  rotateY: { type: "spring", stiffness: 190, damping: 23, mass: 0.65 },
                  y: { duration: 0.2 },
                }}
              >
                {/* Both faces share one grid cell, so the card is as tall as
                    the taller of them and nothing is ever clipped. */}
                <span
                  className="[grid-area:1/1] rounded-2xl border bg-card flex flex-col items-center text-center gap-5 p-6 min-h-[13rem]"
                  style={{
                    backfaceVisibility: "hidden",
                    borderColor: edge,
                    background:
                      "linear-gradient(160deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
                  }}
                >
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gold">
                    {card.meta ?? String(i + 1).padStart(2, "0")}
                  </span>

                  <span className="flex-1 flex items-center justify-center">
                    <span className="block font-display text-2xl leading-tight">{card.title}</span>
                  </span>

                  <span className="flex items-center justify-center gap-2.5">
                    <span
                      className="h-px w-8 transition-opacity duration-300 opacity-40 group-hover:opacity-100"
                      style={{ background: `hsl(${accent} / 0.7)` }}
                    />
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground group-hover:text-gold transition-colors">
                      Why
                    </span>
                    <span
                      className="h-px w-8 transition-opacity duration-300 opacity-40 group-hover:opacity-100"
                      style={{ background: `hsl(${accent} / 0.7)` }}
                    />
                  </span>
                </span>

                <span
                  className="[grid-area:1/1] rounded-2xl border bg-card flex flex-col items-center text-center gap-5 p-6"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    borderColor: `hsl(${accent} / 0.42)`,
                    background:
                      "linear-gradient(160deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
                  }}
                >
                  <span className="flex-1 flex items-center justify-center">
                    <span className="block text-sm text-muted-foreground leading-relaxed">
                      {card.body}
                    </span>
                  </span>
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="h-px w-8" style={{ background: `hsl(${accent} / 0.7)` }} />
                    <span className="text-[10px] uppercase tracking-[0.18em] text-gold">Back</span>
                    <span className="h-px w-8" style={{ background: `hsl(${accent} / 0.7)` }} />
                  </span>
                </span>
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* One rail of controls, mirroring the deck. Hidden once every card
          fits — a scroller with nowhere to scroll is a lie about the content. */}
      {cards.length > columns && (
        <div className="flex items-center justify-center gap-4 mt-7">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Previous"
            className="h-9 w-9 rounded-full border border-gold/30 text-gold flex items-center justify-center gold-outline-lift"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {cards.length} cards · turn any
          </p>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Next"
            className="h-9 w-9 rounded-full border border-gold/30 text-gold flex items-center justify-center gold-outline-lift"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
