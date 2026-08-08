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
              className="text-4xl md:text-6xl font-display font-normal mb-6 tracking-tight leading-[1.1]"
              data-testid="text-foodchart-headline"
            >
              The Anti-Inflammatory <span className="text-gold">Food Chart</span>
            </h1>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto text-base md:text-lg">
              {TOTAL_FOODS} everyday foods rated from strongly anti-inflammatory to highly inflammatory.
              Both ends of the scale have a place in a balanced diet — awareness is the goal, not
              restriction.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Sticky controls. The scale is the filter — one control, not two. ── */}
      <div className="tone-ink bg-background border-y border-border sticky top-16 z-40">
        <div className="container max-w-5xl mx-auto px-4 py-5">
          <div className="relative mb-5 max-w-md mx-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${TOTAL_FOODS} foods…`}
              className="pl-10 pr-10 h-11 text-center"
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

          <div className="max-w-md mx-auto">
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
                    className={cn(
                      "h-7 flex-1 transition-all relative",
                      dim ? "opacity-25" : "opacity-100",
                    )}
                    style={{ backgroundColor: `hsl(${RATING_META[r].color})` }}
                    data-testid={`filter-${slug(r)}`}
                  >
                    {active && <span className="absolute inset-0 ring-2 ring-inset ring-white/80" />}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Anti-inflammatory</span>
              <span>Inflammatory</span>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4" data-testid="text-result-count">
            {isFiltering ? (
              <>
                Showing <span className="text-foreground">{shown}</span> of {TOTAL_FOODS} ·{" "}
                <button
                  onClick={clearAll}
                  className="text-gold hover:underline"
                  data-testid="button-clear-filters"
                >
                  Clear
                </button>
              </>
            ) : (
              <>
                Tap the scale to filter · {TOTAL_FOODS} foods across {FOOD_CATEGORIES.length} categories
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Categories ───────────────────────────────────────── */}
      <Section tone="light" className="pt-14">
        {grouped.length === 0 ? (
          <p className="text-center text-muted-foreground py-20" data-testid="text-no-results">
            No foods match that search. Try a different term or clear the filters.
          </p>
        ) : (
          <>
            {!isFiltering && (
              <div className="flex flex-wrap justify-center gap-2 mb-16">
                {FOOD_CATEGORIES.map((c) => (
                  <a
                    key={c.name}
                    href={`#${slug(c.name)}`}
                    className="px-4 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-gold hover:border-gold/40 transition-colors"
                  >
                    {c.name}
                  </a>
                ))}
              </div>
            )}

            <div className="space-y-20">
              {grouped.map((cat) => (
                <div
                  key={cat.name}
                  id={slug(cat.name)}
                  className="scroll-mt-48"
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
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground max-w-2xl mx-auto text-center mt-20 leading-relaxed">
          This chart is general education, not medical or nutritional advice. Individual responses to food
          vary, and ratings reflect typical inflammatory potential rather than a judgment about any single
          diet. Talk to a qualified provider before making significant dietary changes.
        </p>
      </Section>

      <SiteFooter />
    </div>
  );
}
