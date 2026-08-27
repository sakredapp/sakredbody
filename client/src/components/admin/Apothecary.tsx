/**
 * Admin — The Apothecary
 *
 * Two panes. Left: the shelf. Right: the selected product's editor, its buy
 * links, and which protocols it's attached to.
 *
 * Attachment is the part that actually matters — a product nobody's protocol
 * asks for is inventory, not supply.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, ExternalLink, Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PRODUCT_CATEGORIES } from "@shared/schema";
import type { Product, ProductLink, RoutineProduct, WellnessRoutine } from "@shared/schema";

type ProductWithLinks = Product & { links: ProductLink[] };

const PHASES = ["prepare", "clear", "rebuild"] as const;

interface FormState {
  name: string;
  brand: string;
  category: string;
  description: string;
  whyThisOne: string;
  sourcingNotes: string;
  imageUrl: string;
  priceDollars: string;
  priceNote: string;
  isFeatured: boolean;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: "",
  brand: "",
  category: PRODUCT_CATEGORIES[0],
  description: "",
  whyThisOne: "",
  sourcingNotes: "",
  imageUrl: "",
  priceDollars: "",
  priceNote: "",
  isFeatured: false,
  isActive: true,
};

function toForm(p: Product): FormState {
  return {
    name: p.name,
    brand: p.brand ?? "",
    category: p.category,
    description: p.description ?? "",
    whyThisOne: p.whyThisOne ?? "",
    sourcingNotes: p.sourcingNotes ?? "",
    imageUrl: p.imageUrl ?? "",
    priceDollars: p.priceCents == null ? "" : String(p.priceCents / 100),
    priceNote: p.priceNote ?? "",
    isFeatured: p.isFeatured,
    isActive: p.isActive,
  };
}

/** Dollars in the form, cents in the database — never floats in the column. */
function toPayload(f: FormState) {
  const dollars = parseFloat(f.priceDollars);
  return {
    name: f.name.trim(),
    brand: f.brand.trim() || null,
    category: f.category,
    description: f.description.trim() || null,
    whyThisOne: f.whyThisOne.trim() || null,
    sourcingNotes: f.sourcingNotes.trim() || null,
    imageUrl: f.imageUrl.trim() || null,
    priceCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : null,
    priceNote: f.priceNote.trim() || null,
    isFeatured: f.isFeatured,
    isActive: f.isActive,
  };
}

export function ApothecaryAdmin({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [creating, setCreating] = useState(false);

  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPrice, setLinkPrice] = useState("");

  const [attachRoutineId, setAttachRoutineId] = useState("");
  const [attachPhase, setAttachPhase] = useState<(typeof PHASES)[number]>("prepare");
  const [attachNote, setAttachNote] = useState("");

  const productsQuery = useQuery<ProductWithLinks[]>({
    queryKey: ["/api/admin/apothecary/products"],
    enabled,
  });

  const routinesQuery = useQuery<WellnessRoutine[]>({
    queryKey: ["/api/admin/routines"],
    enabled,
  });

  const selected = useMemo(
    () => productsQuery.data?.find((p) => p.id === selectedId) ?? null,
    [productsQuery.data, selectedId],
  );

  const attachmentsQuery = useQuery<{ attachment: RoutineProduct; product: Product }[]>({
    queryKey: ["/api/admin/apothecary/routine-products", attachRoutineId],
    enabled: enabled && !!attachRoutineId,
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["/api/admin/apothecary/products"] });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setSelectedId(null);
    setForm(emptyForm);
    setCreating(true);
  };

  const openExisting = (p: ProductWithLinks) => {
    setSelectedId(p.id);
    setForm(toForm(p));
    setCreating(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form);
      if (creating) {
        return apiRequest("POST", "/api/admin/apothecary/products", payload);
      }
      return apiRequest("PUT", `/api/admin/apothecary/products/${selectedId}`, payload);
    },
    onSuccess: async (res: Response) => {
      const saved = await res.json();
      await refresh();
      setSelectedId(saved.id);
      setCreating(false);
      toast({ title: creating ? "Added to the shelf" : "Saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/apothecary/products/${selectedId}`),
    onSuccess: async () => {
      await refresh();
      setSelectedId(null);
      setForm(emptyForm);
      toast({ title: "Removed" });
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: () => {
      const dollars = parseFloat(linkPrice);
      return apiRequest("POST", `/api/admin/apothecary/products/${selectedId}/links`, {
        label: linkLabel.trim(),
        url: linkUrl.trim(),
        priceCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : null,
        // First link for a product becomes the primary one automatically.
        isPrimary: (selected?.links.length ?? 0) === 0,
      });
    },
    onSuccess: async () => {
      await refresh();
      setLinkLabel("");
      setLinkUrl("");
      setLinkPrice("");
    },
    onError: (err: Error) => toast({ title: "Could not add link", description: err.message, variant: "destructive" }),
  });

  const removeLinkMutation = useMutation({
    mutationFn: (linkId: string) => apiRequest("DELETE", `/api/admin/apothecary/links/${linkId}`),
    onSuccess: refresh,
  });

  const attachMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/apothecary/routine-products", {
        routineId: attachRoutineId,
        productId: selectedId,
        phase: attachPhase,
        note: attachNote.trim() || null,
        isEssential: true,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/admin/apothecary/routine-products", attachRoutineId] });
      setAttachNote("");
      toast({ title: "Attached to protocol" });
    },
    onError: (err: Error) => toast({ title: "Could not attach", description: err.message, variant: "destructive" }),
  });

  const detachMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/apothecary/routine-products/${id}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["/api/admin/apothecary/routine-products", attachRoutineId] }),
  });

  const canSave = form.name.trim().length > 0 && (creating || !!selectedId);
  const editing = creating || !!selected;

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-8">
      {/* ── The shelf ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg">The Shelf</h3>
          <Button size="sm" variant="outline" onClick={openNew} data-testid="button-new-product">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {productsQuery.isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (productsQuery.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the shelf yet.</p>
        ) : (
          <div className="space-y-0.5 max-h-[70vh] overflow-y-auto pr-1">
            {productsQuery.data!.map((p) => (
              <button
                key={p.id}
                onClick={() => openExisting(p)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-md transition-colors",
                  selectedId === p.id ? "bg-muted" : "hover:bg-muted/50",
                  !p.isActive && "opacity-50",
                )}
                data-testid={`admin-product-${p.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate">{p.name}</span>
                  {p.isFeatured && <Star className="w-3 h-3 shrink-0 text-gold" />}
                </div>
                <span className="text-xs text-muted-foreground">{p.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Editor ── */}
      {!editing ? (
        <p className="text-sm text-muted-foreground pt-10">
          Select a product, or add one.
        </p>
      ) : (
        <div className="space-y-8 max-w-2xl">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="input-product-name" />
            </div>
            <div>
              <Label>Brand</Label>
              <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Price (USD)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.priceDollars}
                onChange={(e) => set("priceDollars", e.target.value)}
                placeholder="24.00"
              />
            </div>
            <div>
              <Label>Price note</Label>
              <Input value={form.priceNote} onChange={(e) => set("priceNote", e.target.value)} placeholder="per 8oz" />
            </div>
            <div className="sm:col-span-2">
              <Label>Image URL</Label>
              <Input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Why this one</Label>
              <Textarea
                rows={3}
                value={form.whyThisOne}
                onChange={(e) => set("whyThisOne", e.target.value)}
                placeholder="The argument for this specific product over the alternatives."
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Sourcing notes</Label>
              <Textarea
                rows={2}
                value={form.sourcingNotes}
                onChange={(e) => set("sourcingNotes", e.target.value)}
                placeholder="What to avoid. Fillers, adulteration, the cheap version that doesn't work."
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isFeatured} onCheckedChange={(v) => set("isFeatured", v)} />
              <Label className="mb-0">Featured</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
              <Label className="mb-0">Active</Label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              data-testid="button-save-product"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {creating ? "Add" : "Save"}
            </Button>
            {!creating && selectedId && (
              <Button variant="ghost" onClick={() => deleteMutation.mutate()} className="text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Links and attachments only make sense once the row exists. */}
          {!creating && selected && (
            <>
              <div className="border-t border-border/50 pt-6">
                <h4 className="text-sm uppercase tracking-widest text-gold mb-4">
                  Where to buy it
                </h4>

                {selected.links.length > 0 && (
                  <div className="space-y-1 mb-4">
                    {selected.links.map((l) => (
                      <div key={l.id} className="flex items-center gap-3 py-2 border-b border-border/40">
                        <span className="text-sm flex-1">{l.label}</span>
                        {l.isPrimary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => removeLinkMutation.mutate(l.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid sm:grid-cols-[1fr_2fr_100px_auto] gap-2 items-end">
                  <Input placeholder="Label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
                  <Input placeholder="https://" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                  <Input placeholder="Price" type="number" step="0.01" value={linkPrice} onChange={(e) => setLinkPrice(e.target.value)} />
                  <Button
                    variant="outline"
                    onClick={() => addLinkMutation.mutate()}
                    disabled={!linkLabel.trim() || !linkUrl.trim() || addLinkMutation.isPending}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="border-t border-border/50 pt-6">
                <h4 className="text-sm uppercase tracking-widest text-gold mb-4">
                  Attach to a protocol
                </h4>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Select value={attachRoutineId} onValueChange={setAttachRoutineId}>
                    <SelectTrigger><SelectValue placeholder="Protocol" /></SelectTrigger>
                    <SelectContent>
                      {(routinesQuery.data ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={attachPhase} onValueChange={(v) => setAttachPhase(v as typeof attachPhase)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PHASES.map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="sm:col-span-2"
                    placeholder="Note — dosage, timing, how much to get"
                    value={attachNote}
                    onChange={(e) => setAttachNote(e.target.value)}
                  />
                </div>

                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => attachMutation.mutate()}
                  disabled={!attachRoutineId || attachMutation.isPending}
                  data-testid="button-attach-product"
                >
                  Attach
                </Button>

                {attachRoutineId && (attachmentsQuery.data?.length ?? 0) > 0 && (
                  <div className="mt-6">
                    <p className="text-xs text-muted-foreground mb-2">
                      Already on this protocol
                    </p>
                    {attachmentsQuery.data!.map(({ attachment, product }) => (
                      <div key={attachment.id} className="flex items-center gap-3 py-2 border-b border-border/40">
                        <span className="text-sm flex-1">{product.name}</span>
                        <Badge variant="secondary" className="text-[10px] capitalize">{attachment.phase}</Badge>
                        <button
                          onClick={() => detachMutation.mutate(attachment.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <GuidanceLinks enabled={enabled} products={productsQuery.data ?? []} />
    </div>
  );
}

/**
 * Attaching a product to a piece of guidance.
 *
 * ── Two content layers, kept apart ────────────────────────────────────────
 *
 * The primitives are a constant in shared/models/apothecary.ts — versioned
 * with the code, reviewable in a diff, and not editable here on purpose. The
 * products are data. This screen is the join between them and nothing else:
 * unlinking a product never alters the guidance, and deactivating a product
 * never touches a link row. Both disappear from the member's screen by the
 * same mechanism, which is the server filtering on is_active.
 *
 * ── Why the empty state is the important one ──────────────────────────────
 *
 * Most primitives will never have a product and must not look poorer for it.
 * A ten-minute breathing downshift has nothing to sell and is one of the best
 * things on the list. So "no product" reads as a normal, finished state here,
 * exactly as it renders as one in the app.
 */
function GuidanceLinks({
  enabled,
  products,
}: {
  enabled: boolean;
  products: ProductWithLinks[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pick, setPick] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});

  const primitives = useQuery<
    { id: string; title: string; type: string; evidence: string; conditions: string[] }[]
  >({ queryKey: ["/api/admin/apothecary/primitives"], enabled });

  const links = useQuery<
    { id?: string; supportId: string; productId: string; name: string; note: string | null }[]
  >({ queryKey: ["/api/apothecary/guidance-links"], enabled });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/apothecary/guidance-links"] });
  };

  const attach = useMutation({
    mutationFn: (body: { supportId: string; productId: string; note?: string | null }) =>
      apiRequest("POST", "/api/admin/apothecary/guidance-links", body),
    onSuccess: () => {
      refresh();
      toast({ title: "Linked." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const detach = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/apothecary/guidance-links/${id}`),
    onSuccess: () => {
      refresh();
      toast({ title: "Unlinked. The guidance is unchanged." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!enabled) return null;

  return (
    <div className="mt-8 space-y-3">
      <div>
        <h3 className="text-lg font-display">Guidance links</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Attach a product to a recommendation. Anything without one shows the practice on its
          own — no button, no placeholder. Deactivating a product hides its link everywhere
          without changing the guidance.
        </p>
      </div>

      <div className="space-y-2">
        {(primitives.data ?? []).map((p) => {
          const linked = (links.data ?? []).filter((l) => l.supportId === p.id);
          return (
            <div key={p.id} className="rounded-lg border border-border/40 p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{p.title}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {p.type} · {p.evidence}
                </span>
              </div>

              {linked.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No product attached — members see the guidance only.
                </p>
              ) : (
                linked.map((l) => (
                  <div
                    key={l.productId}
                    className="flex items-center gap-2 rounded border border-[hsl(var(--gold))]/20 px-2 py-1"
                  >
                    <span className="text-xs flex-1 truncate">{l.name}</span>
                    {l.note && (
                      <span
                        className="text-[10px] text-gold/70 truncate"
                        title="Shown to members under this product"
                      >
                        “{l.note}”
                      </span>
                    )}
                    <button
                      onClick={() => l.id && detach.mutate(l.id)}
                      disabled={!l.id || detach.isPending}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Unlink ${l.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}

              {/* A picker of real products. No ids typed by hand. */}
              <div className="flex gap-2">
                <select
                  value={pick[p.id] ?? ""}
                  onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })}
                  className="flex-1 h-8 rounded border border-border/50 bg-transparent text-base md:text-xs px-2"
                >
                  <option value="">Attach a product…</option>
                  {products
                    .filter((prod) => prod.isActive !== false)
                    .map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.brand ? `${prod.brand} — ` : ""}
                        {prod.name}
                      </option>
                    ))}
                </select>
                {/*
                  Member-facing, and named so nobody has to guess.

                  This string is returned by the member endpoint and rendered
                  under the product on the card. One free-text field must not
                  become both curation context and member copy — if internal
                  notes are wanted later they need their own column, not this
                  one wearing two hats.
                */}
                <Input
                  value={note[p.id] ?? ""}
                  onChange={(e) => setNote({ ...note, [p.id]: e.target.value })}
                  placeholder="Member note — shown in the app"
                  className="h-8 text-base md:text-xs flex-1"
                />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!pick[p.id] || attach.isPending}
                  onClick={() =>
                    attach.mutate({
                      supportId: p.id,
                      productId: pick[p.id],
                      note: note[p.id]?.trim() || null,
                    })
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
