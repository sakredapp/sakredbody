import { useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
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
 * The rail runs left to right and snaps, which is the gesture a phone already
 * expects. Turning is a real rotateY against a shared perspective, so a card
 * has a front and a back rather than two divs cross-fading.
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
    rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: "smooth" });
  };

  // Reduced motion gets the same content with both faces open and no turning.
  if (reduced) {
    return (
      <div
        className={cn("grid gap-5 sm:grid-cols-2", columns >= 3 && "lg:grid-cols-3", className)}
        data-testid={testId}
      >
        {cards.map((c) => (
          <article key={c.title} className="rounded-2xl border border-border p-6">
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
      ? "w-[86%] sm:w-[calc(50%-0.625rem)]"
      : columns === 4
        ? "w-[86%] sm:w-[calc(50%-0.625rem)] lg:w-[calc(25%-0.94rem)]"
        : "w-[86%] sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.834rem)]";

  return (
    <div className={cn("relative", className)} data-testid={testId}>
      <div
        ref={railRef}
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
        style={{ perspective: "1600px", scrollbarWidth: "none" }}
      >
        {cards.map((card, i) => {
          const open = turned.has(i);
          const edge = card.accent ? `hsl(${card.accent} / 0.5)` : "hsl(var(--gold) / 0.35)";
          return (
            <div key={card.title} className={cn("shrink-0 snap-start", width)}>
              <motion.button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={open}
                aria-label={`${card.title} — turn for the reason`}
                className="relative w-full min-h-[15rem] text-left cursor-pointer rounded-2xl"
                style={{ transformStyle: "preserve-3d" }}
                animate={{ rotateY: open ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 210, damping: 24, mass: 0.6 }}
              >
                {/* Face */}
                <span
                  className="absolute inset-0 rounded-2xl border bg-card flex flex-col justify-between p-6"
                  style={{ backfaceVisibility: "hidden", borderColor: edge }}
                >
                  <span className="block">
                    {card.meta && (
                      <span className="block text-[10px] uppercase tracking-[0.2em] text-gold mb-2.5">
                        {card.meta}
                      </span>
                    )}
                    <span className="block font-display text-2xl leading-tight">{card.title}</span>
                  </span>
                  <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    <RotateCw className="h-3 w-3" style={{ color: edge }} />
                    Turn
                  </span>
                </span>

                {/* Back */}
                <span
                  className="absolute inset-0 rounded-2xl border bg-card p-6 flex items-center"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    borderColor: edge,
                  }}
                >
                  <span className="block text-sm text-muted-foreground leading-relaxed">
                    {card.body}
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
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Previous"
            className="h-9 w-9 rounded-full border border-gold/30 text-gold flex items-center justify-center hover-elevate gold-outline-lift"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {cards.length} · turn any card
          </p>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Next"
            className="h-9 w-9 rounded-full border border-gold/30 text-gold flex items-center justify-center hover-elevate gold-outline-lift"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
