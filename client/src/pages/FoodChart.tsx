import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Section } from "@/components/Section";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FOOD_CATEGORIES.map((cat) => ({
      ...cat,
      foods: cat.foods.filter(
        (f) =>
          (!q || f.name.toLowerCase().includes(q)) &&
          (activeRatings.size === 0 || activeRatings.has(f.rating)),
      ),
    })).filter((cat) => cat.foods.length > 0);
  }, [query, activeRatings]);

  const shown = filtered.reduce((n, c) => n + c.foods.length, 0);
  const isFiltering = query.trim() !== "" || activeRatings.size > 0;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <SiteHeader overHero={false} />

      {/* ── Header ───────────────────────────────────────────── */}
      <section className="bg-ink text-ink-foreground pt-32 pb-16">
        <div className="container max-w-6xl mx-auto px-4 text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
            <p className="text-xs uppercase tracking-widest text-gold mb-4 rule-gold rule-gold-center">
              Food
            </p>
            <h1
              className="text-4xl md:text-6xl font-display font-normal mb-6 tracking-tight"
              data-testid="text-foodchart-headline"
            >
              The Anti-Inflammatory <span className="text-gold">Food Chart</span>
            </h1>
            <p className="text-ink-foreground/60 leading-relaxed max-w-2xl mx-auto">
              {TOTAL_FOODS} everyday foods rated on a seven-point scale, from strongly anti-inflammatory to
              highly inflammatory. Chronic inflammation is a shared driver across metabolic, cardiovascular,
              and digestive conditions — and diet is one of the few inputs you control every day.
            </p>
            <p className="text-ink-foreground/45 leading-relaxed max-w-2xl mx-auto mt-4 text-sm">
              Both ends of this scale have a place in a balanced diet. Awareness is the goal, not restriction.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── The scale ────────────────────────────────────────── */}
      <Section tone="ink-soft" className="border-y border-ink-line py-10">
        <p className="text-xs uppercase tracking-widest text-gold mb-6 text-center">The Scale</p>
        <div className="flex flex-wrap justify-center gap-2.5">
          {FOOD_RATINGS.map((r) => (
            <div
              key={r}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-ink-line text-xs text-ink-foreground/70"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: `hsl(${RATING_META[r].color})` }}
              />
              {r}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Controls ─────────────────────────────────────────── */}
      <Section tone="muted" className="py-10">
        <div className="max-w-3xl mx-auto">
          <div className="relative mb-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a food…"
              className="pl-10 pr-10 h-11"
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

          <div className="flex flex-wrap justify-center gap-2">
            {FOOD_RATINGS.map((r) => {
              const active = activeRatings.has(r);
              return (
                <button
                  key={r}
                  onClick={() => toggleRating(r)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs transition-colors hover-elevate",
                    active
                      ? "border-gold bg-gold/10 text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                  data-testid={`filter-${RATING_META[r].short.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: `hsl(${RATING_META[r].color})` }}
                  />
                  {r}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-4 mt-6">
            <p className="text-sm text-muted-foreground" data-testid="text-result-count">
              Showing <span className="text-foreground">{shown}</span> of {TOTAL_FOODS}
            </p>
            {isFiltering && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setActiveRatings(new Set());
                }}
                data-testid="button-clear-filters"
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </Section>

      {/* ── Categories ───────────────────────────────────────── */}
      <Section tone="light">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-16" data-testid="text-no-results">
            No foods match that search. Try a different term or clear the filters.
          </p>
        ) : (
          <div className="space-y-16">
            {filtered.map((cat) => (
              <div key={cat.name} data-testid={`category-${cat.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                <div className="text-center max-w-2xl mx-auto mb-8">
                  <h2 className="text-2xl md:text-3xl font-display font-normal mb-2">{cat.name}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">{cat.description}</p>
                  <p className="text-xs text-gold mt-2">{cat.foods.length} items</p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-px max-w-5xl mx-auto">
                  {cat.foods.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center gap-3 py-3 border-b border-border/50"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: `hsl(${RATING_META[f.rating].color})` }}
                        title={f.rating}
                      />
                      <span className="text-sm text-foreground flex-1">{f.name}</span>
                      <span className="text-[11px] text-muted-foreground text-right shrink-0">
                        {RATING_META[f.rating].short}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground max-w-2xl mx-auto text-center mt-16 leading-relaxed">
          This chart is general education, not medical or nutritional advice. Individual responses to food
          vary, and ratings reflect typical inflammatory potential rather than a judgment about any single
          diet. Talk to a qualified provider before making significant dietary changes.
        </p>
      </Section>

      <SiteFooter />
    </div>
  );
}
