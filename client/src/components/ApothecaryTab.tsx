/**
 * The Apothecary
 *
 * Two views, and the order matters. **Supply** is what the member's own
 * protocol needs, staged by phase so day one isn't a twenty-item shopping
 * trip. **Everything** is the full shelf, for browsing.
 *
 * We don't sell. Each product carries an argument for why it's the one we
 * stand behind, and links out to whoever actually stocks it.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useProducts,
  useSupplyList,
  useCheckoffs,
  useToggleCheckoff,
  type ProductWithLinks,
  type SupplyItem,
} from "@/hooks/use-apothecary";
import { PRODUCT_CATEGORIES } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Check, ExternalLink, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { track, trackBuyClick } from "@/lib/track";
import { SectionHeading } from "@/components/portal/Panel";

const PHASE_LABEL: Record<string, string> = {
  prepare: "Prepare",
  clear: "Clear",
  rebuild: "Rebuild",
};

function price(cents: number | null, note: string | null) {
  if (cents == null) return null;
  const amount = (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
  return note ? `${amount} ${note}` : amount;
}

// ─── Shared row ────────────────────────────────────────────────────────────

interface RowProps {
  product: ProductWithLinks;
  note?: string | null;
  essential?: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

function ProductRow({ product, note, essential, checked, onToggle, onOpen }: RowProps) {
  const primary = product.links.find((l) => l.isPrimary) ?? product.links[0];

  return (
    <div
      className={cn(
        "flex items-start gap-4 py-4 border-t border-border/50 transition-opacity",
        checked && "opacity-45",
      )}
      data-testid={`apothecary-row-${product.id}`}
    >
      <button
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={checked ? `Remove ${product.name} from your shelf` : `I have ${product.name}`}
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors",
          checked
            ? "bg-[hsl(var(--gold))] border-[hsl(var(--gold))]"
            : "border-border hover:border-[hsl(var(--gold))]",
        )}
        data-testid={`apothecary-check-${product.id}`}
      >
        {checked && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
      </button>

      <button onClick={onOpen} className="flex-1 text-left min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn("text-sm", checked && "line-through")}>{product.name}</span>
          {product.brand && (
            <span className="text-xs text-muted-foreground">{product.brand}</span>
          )}
          {essential === false && (
            <Badge variant="secondary" className="text-[10px]">Optional</Badge>
          )}
        </div>
        {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
      </button>

      <div className="flex items-center gap-3 shrink-0">
        {price(product.priceCents, product.priceNote) && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {price(product.priceCents, product.priceNote)}
          </span>
        )}
        {primary && (
          <a
            href={primary.url}
            target="_blank"
            rel="noopener noreferrer"
            /* Recorded in the click handler rather than after an await: the
               anchor's own default opens the tab, which keeps the browser's
               user-gesture semantics a deferred window.open would lose. */
            onClick={() =>
              trackBuyClick({
                productId: product.id,
                url: primary.url,
                surface: "apothecary_row",
                name: product.name,
              })
            }
            className="text-xs text-gold hover:underline inline-flex items-center gap-1"
            data-testid={`apothecary-link-${product.id}`}
          >
            Source
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Detail dialog ─────────────────────────────────────────────────────────

function ProductDialog({
  product,
  onClose,
}: {
  product: ProductWithLinks | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {product && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-normal">{product.name}</DialogTitle>
            </DialogHeader>

            {product.imageUrl && (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-48 object-cover rounded-lg"
              />
            )}

            <div className="space-y-5 text-sm">
              {product.brand && <p className="text-muted-foreground">{product.brand}</p>}
              {product.description && <p className="leading-relaxed">{product.description}</p>}

              {product.whyThisOne && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-gold mb-2">
                    Why this one
                  </p>
                  <p className="leading-relaxed text-muted-foreground">{product.whyThisOne}</p>
                </div>
              )}

              {product.sourcingNotes && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-gold mb-2">
                    Sourcing
                  </p>
                  <p className="leading-relaxed text-muted-foreground">{product.sourcingNotes}</p>
                </div>
              )}

              {product.links.length > 0 && (
                <div className="space-y-2 pt-1">
                  {product.links.map((l) => (
                    <a
                      key={l.id}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackBuyClick({
                          productId: product.id,
                          url: l.url,
                          surface: "apothecary_detail",
                          name: product.name,
                        })
                      }
                      className="flex items-center justify-between py-2.5 px-3 rounded-md border border-border/60 hover:border-[hsl(var(--gold))]/50 transition-colors"
                    >
                      <span className="text-sm">{l.label}</span>
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                        {price(l.priceCents, null)}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab ───────────────────────────────────────────────────────────────────

export function ApothecaryTab() {
  const [view, setView] = useState<"supply" | "all">("supply");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<ProductWithLinks | null>(null);

  const supply = useSupplyList();
  const catalog = useProducts({ category, q: search });
  const checkoffs = useCheckoffs();
  const toggle = useToggleCheckoff();

  const checked = new Set(checkoffs.data ?? []);
  const isChecked = (id: string) => checked.has(id);
  const flip = (id: string) => toggle.mutate({ productId: id, checked: !isChecked(id) });

  const supplyItems = supply.data?.phases.flatMap((p) => p.items) ?? [];
  const remaining = supplyItems.filter((i) => !isChecked(i.id)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <SectionHeading
          title="The Apothecary"
          subtitle={
            remaining > 0
              ? `${remaining} still to get for your protocol.`
              : "What the protocols actually call for."
          }
        />
        <div className="flex items-center bg-muted/60 rounded-full p-1 gap-0.5">
          {([
            { id: "supply" as const, label: "Your Supply" },
            { id: "all" as const, label: "Everything" },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm transition-all duration-300",
                view === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`apothecary-view-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === "supply" ? (
          <motion.div
            key="supply"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {supply.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : !supply.data?.routineId ? (
              <div className="py-16 text-center">
                <Leaf className="h-6 w-6 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Start a protocol and its supply list appears here.
                </p>
              </div>
            ) : supplyItems.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  {supply.data.routineName} needs nothing sourced.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                <p className="text-sm text-muted-foreground">
                  {supply.data.routineName} —{" "}
                  {remaining === 0 ? "everything sourced" : `${remaining} to source`}
                </p>

                {supply.data.phases.map(({ phase, items }) => (
                  <div key={phase}>
                    <p className="text-xs uppercase tracking-widest text-gold mb-1">
                      {PHASE_LABEL[phase]}
                    </p>
                    {items.map((item: SupplyItem) => (
                      <ProductRow
                        key={item.attachmentId}
                        product={item}
                        note={item.note}
                        essential={item.isEssential}
                        checked={isChecked(item.id)}
                        onToggle={() => flip(item.id)}
                        onOpen={() => {
                          setOpen(item);
                          track("product.view", {
                            surface: "apothecary_protocol",
                            subjectId: item.id,
                            props: { name: item.name },
                          });
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="all"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-5"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the shelf"
                className="pl-9"
                data-testid="input-apothecary-search"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {["all", ...PRODUCT_CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors border",
                    category === c
                      ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/15 text-gold"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`apothecary-category-${c}`}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>

            {catalog.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (catalog.data?.length ?? 0) === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Nothing here yet.
              </p>
            ) : (
              <div>
                {catalog.data!.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    checked={isChecked(p.id)}
                    onToggle={() => flip(p.id)}
                    onOpen={() => {
                      setOpen(p);
                      track("product.view", {
                        surface: "apothecary_shelf",
                        subjectId: p.id,
                        props: { name: p.name },
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ProductDialog product={open} onClose={() => setOpen(null)} />
    </div>
  );
}
