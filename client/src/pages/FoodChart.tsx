import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  FOOD_CATEGORIES,
  FOOD_RATINGS,
  RATING_META,
  TOTAL_FOODS,
  type FoodRating,
} from "@/data/foodChart";
import { usePageMeta } from "@/hooks/use-page-meta";

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function FoodChart() {
  usePageMeta(
    "Anti-Inflammatory Food Chart — 197 Foods Rated | Sakred Body",
    "197 everyday foods rated on a seven-point scale from strongly anti-inflammatory to highly inflammatory. Search and filter the full chart.",
  );

  const [query, setQuery] = useState("");
  const [activeRatings, setActiveRatings] = useState<Set<FoodRating>>(new Set());

  const toggleRating = (r: FoodRating) =>
    setActiveRatings((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const clearAll = () => {
    setQuery("");
    setActiveRatings(new Set());
  };

  /**
   * Categories → rating bands → foods. Grouping by rating means colour carries
   * the rating, instead of stamping a truncated label on all 197 rows.
   */
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FOOD_CATEGORIES.map((cat) => {
      const foods = cat.foods.filter(
        (f) =>
          (!q || f.name.toLowerCase().includes(q)) &&
          (activeRatings.size === 0 || activeRatings.has(f.rating)),
      );
      const bands = FOOD_RATINGS.map((rating) => ({
        rating,
        foods: foods.filter((f) => f.rating === rating),
      })).filter((b) => b.foods.length > 0);
      return { ...cat, count: foods.length, bands };
    }).filter((c) => c.count > 0);
  }, [query, activeRatings]);

  const shown = grouped.reduce((n, c) => n + c.count, 0);
  const isFiltering = query.trim() !== "" || activeRatings.size > 0;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      {/* ── Header ───────────────────────────────────────────── */}
      <section className="tone-ink bg-background pt-36 pb-14">
        <div className="container max-w-6xl mx-auto px-4 text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
            <h1
              className="text-5xl md:text-7xl font-display font-normal mb-7 tracking-[-0.03em] leading-[1.02]"
              data-testid="text-foodchart-headline"
            >
              The Anti-Inflammatory <span className="text-gold">Food Chart</span>
            </h1>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto text-base md:text-lg">
              {TOTAL_FOODS} everyday foods rated from strongly anti-inflammatory to highly inflammatory.
              Both ends of the scale have a place in a balanced diet — awareness is the goal, not
              restriction.
            </p>
            {/* Naming the axis rather than rebuilding it.
                The seven-point scale was already a polarity — one end cools
                and settles, the other heats and aggravates — which is the
                same shape as Yin and Yang everywhere else on the site. It
                needed a sentence, not a new data model.

                Carefully worded: "traditions describe" and "read as", not
                "changes your pH". Acid/alkaline is a useful traditional lens
                and a poor physiological claim — the body holds blood pH in a
                narrow band regardless of lunch — and this site disclaims
                medical advice on every page. Stating it as a lens is both
                honest and the thing that is actually true. */}
            <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto text-sm md:text-base mt-5">
              It's one axis, and it's the same one running through everything else here. One end cools and
              settles; the other heats and aggravates. Older traditions read the same split as alkaline and
              acidic, or as <span className="text-gold">Yin and Yang</span> — different vocabulary, the same
              observation. Neither end is good or bad. A body clearing a load wants one; a body being asked
              to adapt can use the other.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Controls ─────────────────────────────────────────────
          Not sticky. A pinned slab this tall meant the whole chart
          scrolled underneath it and the bar covered what you were
          reading — worse than simply scrolling back up. Search and the
          scale now share one line and stay where they were put. */}
      <div className="tone-ink bg-background">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-[hsl(30_9%_13%)] px-5 py-6 sm:px-8 sm:py-7 max-w-3xl mx-auto">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${TOTAL_FOODS} foods…`}
                className="pl-10 pr-10 h-10 text-center"
                aria-label="Search foods"
                data-testid="input-food-search"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="w-full max-w-md">
              <div className="flex rounded-full overflow-hidden border border-border">
                {FOOD_RATINGS.map((r) => {
                  const active = activeRatings.has(r);
                  const dim = activeRatings.size > 0 && !active;
                  return (
                    <button
                      key={r}
                      onClick={() => toggleRating(r)}
                      aria-pressed={active}
                      aria-label={`Filter by ${r}`}
                      title={r}
                      className={cn("h-6 flex-1 transition-all relative", dim ? "opacity-25" : "opacity-100")}
                      style={{ backgroundColor: `hsl(${RATING_META[r].color})` }}
                      data-testid={`filter-${slug(r)}`}
                    >
                      {active && <span className="absolute inset-0 ring-2 ring-inset ring-white/80" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Anti-inflammatory</span>
                <span>Inflammatory</span>
              </div>
            </div>

            {/* Tiles, not floating words. Each one is a target with edges. */}
            {!isFiltering && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full pt-1">
                {FOOD_CATEGORIES.map((c) => (
                  <a
                    key={c.name}
                    href={`#${slug(c.name)}`}
                    className="group rounded-lg border border-border/80 bg-[hsl(30_9%_16%)] px-3 py-2.5 text-center transition-colors hover:border-gold/45 hover:bg-[hsl(30_9%_19%)]"
                  >
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-muted-foreground group-hover:text-gold transition-colors leading-snug">
                      {c.name}
                    </span>
                    <span className="block text-[10px] text-muted-foreground/50 mt-0.5 tabular-nums">
                      {c.foods.length}
                    </span>
                  </a>
                ))}
              </div>
            )}

            {isFiltering && (
              <button
                onClick={clearAll}
                className="text-xs text-gold hover:underline"
                data-testid="button-clear-filters"
              >
                {shown} of {TOTAL_FOODS} · Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Categories ───────────────────────────────────────
          Each category is its own floating panel. As one section it ran
          6400px — eight screens of unbroken white, with the rounded corners
          only ever visible at the very top and very bottom. */}
      {grouped.length === 0 ? (
        <Section tone="ink">
          <p className="text-center text-muted-foreground py-10" data-testid="text-no-results">
            No foods match that search. Try a different term or clear the filters.
          </p>
        </Section>
      ) : (
        <>
          {grouped.map((cat) => (
            <Section
              key={cat.name}
              tone="ink"
              id={slug(cat.name)}
              className="py-12 md:py-14 scroll-mt-[110px]"
              data-testid={`category-${slug(cat.name)}`}
            >
              <div className="text-center max-w-2xl mx-auto mb-10">
                <h2 className="text-2xl md:text-3xl font-display font-normal mb-2">{cat.name}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{cat.description}</p>
                <p className="text-xs text-gold mt-2">{cat.count} items</p>
              </div>

              <div className="space-y-8 max-w-4xl mx-auto">
                {cat.bands.map((band) => (
                  <div key={band.rating}>
                    <div className="flex items-center justify-center gap-2.5 mb-4">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: `hsl(${RATING_META[band.rating].color})` }}
                      />
                      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                        {band.rating}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {band.foods.map((f) => (
                        <span
                          key={f.name}
                          className="px-3.5 py-1.5 rounded-full text-sm border"
                          style={{
                            borderColor: `hsl(${RATING_META[band.rating].color} / 0.35)`,
                            backgroundColor: `hsl(${RATING_META[band.rating].color} / 0.08)`,
                          }}
                        >
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </>
      )}

      <Section tone="ink" className="py-10">
        <p className="text-xs text-muted-foreground max-w-2xl mx-auto text-center leading-relaxed">
          General education, not medical or nutritional advice. Individual responses vary. Talk to a
          qualified provider before making significant dietary changes.
        </p>
      </Section>

      <SiteFooter />
    </div>
  );
}
