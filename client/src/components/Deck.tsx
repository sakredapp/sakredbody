import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { responsive, SIZES_CARD } from "@/lib/img";

export interface DeckCard {
  title: string;
  body: ReactNode;
  /** Small line above the title — a season, a length, a pairing. */
  meta?: string;
  /** An `hsl()` triplet or `var(--…)`. Tints the card's edge and its dot. */
  accent?: string;
  /** Optional photograph. A deck with images beats a deck without. */
  image?: string;
  imageAlt?: string;
}

/**
 * A grid of six cards, turned into one object you can handle.
 *
 * Six boxes in a row is the shape every page defaults to and the shape that
 * collapses worst on a phone — a column of clunky rectangles nobody reads to
 * the bottom of. Here the same six sit on an arc in real perspective: the held
 * card faces you, its neighbours turn away and recede, and everything past
 * them fades into the dark.
 *
 * Drag it, click a neighbour, use the arrow keys, or let it turn on its own.
 * Depth is done with `rotateY` and `translateZ` against a real perspective,
 * not with scale pretending to be distance.
 */
export function Deck({
  cards,
  className,
  /** Turn on its own until touched. */
  autoAdvanceMs = 0,
  testId,
}: {
  cards: DeckCard[];
  className?: string;
  autoAdvanceMs?: number;
  testId?: string;
}) {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const reduced = useReducedMotion();
  const total = cards.length;
  const hostRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: number) => setActive(((next % total) + total) % total),
    [total],
  );

  useEffect(() => {
    if (!autoAdvanceMs || touched || reduced) return;
    const timer = setTimeout(() => go(active + 1), autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [active, autoAdvanceMs, touched, reduced, go]);

  // Shortest way round, so wrapping doesn't sweep the whole deck past you.
  const offsetOf = (i: number) => {
    let d = i - active;
    if (d > total / 2) d -= total;
    if (d < -total / 2) d += total;
    return d;
  };

  if (reduced) {
    return (
      <div className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3", className)} data-testid={testId}>
        {cards.map((c) => (
          <article key={c.title} className="rounded-2xl border border-gold-subtle p-6">
            {c.meta && <p className="text-[10px] uppercase tracking-widest text-gold mb-2">{c.meta}</p>}
            <h3 className="font-display text-xl mb-2">{c.title}</h3>
            <div className="text-sm text-muted-foreground leading-relaxed">{c.body}</div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("relative select-none", className)}
      data-testid={testId}
      role="group"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          setTouched(true);
          go(active + 1);
        }
        if (e.key === "ArrowLeft") {
          setTouched(true);
          go(active - 1);
        }
      }}
      ref={hostRef}
    >
      {/* The neighbours sit 130–260px off centre and are wider than a phone.
          Without a clip here they push the document past the viewport, and
          the whole site scrolls sideways — every page, not just this one.
          `clip` rather than `hidden` so the vertical axis stays visible and
          the held card's drop shadow isn't sheared off. */}
      <div
        className="relative min-h-[24rem] sm:min-h-[22rem] flex items-stretch overflow-x-clip"
        style={{ perspective: "1400px", perspectiveOrigin: "50% 45%" }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.14}
          onDragStart={() => setTouched(true)}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) go(active + 1);
            else if (info.offset.x > 60) go(active - 1);
          }}
        >
          {cards.map((card, i) => {
            const off = offsetOf(i);
            const far = Math.abs(off) > 2;
            return (
              <motion.button
                key={card.title}
                type="button"
                onClick={() => {
                  setTouched(true);
                  go(i);
                }}
                aria-label={card.title}
                aria-current={off === 0}
                tabIndex={off === 0 ? 0 : -1}
                className="absolute left-1/2 top-0 bottom-0 w-[19rem] sm:w-[21rem] -ml-[9.5rem] sm:-ml-[10.5rem] text-left cursor-pointer"
                style={{ transformStyle: "preserve-3d" }}
                animate={{
                  x: off * 132,
                  z: -Math.abs(off) * 190,
                  rotateY: off * -26,
                  opacity: far ? 0 : 1 - Math.abs(off) * 0.24,
                  filter: `brightness(${1 - Math.abs(off) * 0.28})`,
                }}
                transition={{ type: "spring", stiffness: 190, damping: 26, mass: 0.7 }}
                initial={false}
              >
                <div
                  className={cn(
                    "h-full rounded-2xl border overflow-hidden flex flex-col",
                    "bg-gradient-to-b from-[hsl(30_9%_14%)] to-[hsl(30_10%_9%)]",
                    off === 0 ? "shadow-lift" : "shadow-none",
                  )}
                  style={{
                    borderColor: card.accent
                      ? `hsl(${card.accent} / ${off === 0 ? 0.55 : 0.2})`
                      : `hsl(var(--gold) / ${off === 0 ? 0.45 : 0.15})`,
                  }}
                >
                  {card.image && (
                    <div className="relative h-40 shrink-0 overflow-hidden">
                      <img
                        {...responsive(card.image, SIZES_CARD)}
                        alt={card.imageAlt ?? ""}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(30_10%_9%)] via-transparent to-transparent" />
                    </div>
                  )}

                  <div className="p-6 flex flex-col gap-2.5 flex-1">
                    {card.meta && (
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gold">{card.meta}</p>
                    )}
                    <h3 className="font-display text-2xl leading-tight">{card.title}</h3>
                    <div className="text-sm text-muted-foreground leading-relaxed">{card.body}</div>
                  </div>

                  {/* A gilt hairline along the held card's foot. */}
                  <div
                    className="h-px mx-6 mb-6 transition-opacity duration-500"
                    style={{
                      opacity: off === 0 ? 1 : 0,
                      background: `linear-gradient(90deg, transparent, hsl(${card.accent ?? "var(--gold)"} / 0.7), transparent)`,
                    }}
                  />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Controls: one rail, uniform marks, so the row never sits off-centre.
          Every control here carries a 44px hit box while the mark inside it
          stays the size the design wants — a 4px-tall bar is a coin-flip for
          a thumb, and both stores look at this in review. */}
      <div className="flex items-center justify-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => {
            setTouched(true);
            go(active - 1);
          }}
          aria-label="Previous"
          className="tap grid place-items-center rounded-full"
        >
          <span className="h-9 w-9 rounded-full border border-gold/30 text-gold flex items-center justify-center hover-elevate gold-outline-lift">
            <ChevronLeft className="h-4 w-4" />
          </span>
        </button>

        <div className="flex items-center">
          {cards.map((c, i) => (
            <button
              key={c.title}
              type="button"
              onClick={() => {
                setTouched(true);
                go(i);
              }}
              aria-label={`Show ${c.title}`}
              aria-current={i === active}
              className="group tap grid place-items-center px-1 rounded-md"
            >
              <span
                className={cn(
                  "h-1 w-6 rounded-full transition-all duration-500",
                  i === active ? "bg-gold" : "bg-gold/20 group-hover:bg-gold/45",
                )}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setTouched(true);
            go(active + 1);
          }}
          aria-label="Next"
          className="tap grid place-items-center rounded-full"
        >
          <span className="h-9 w-9 rounded-full border border-gold/30 text-gold flex items-center justify-center hover-elevate gold-outline-lift">
            <ChevronRight className="h-4 w-4" />
          </span>
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {cards[active].title}, {active + 1} of {total}
      </p>
    </div>
  );
}
