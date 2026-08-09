import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Trash2, MapPin, Users, BedDouble } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Retreats, and the properties inside them.
 *
 * Both tables were read-only for their whole life — the rows came from
 * server/seed.ts, so changing a date meant a deploy. The write routes are new
 * (server/retreats/routes.ts) and this is the surface over them.
 *
 * Properties are nested under their retreat rather than given their own tab.
 * A property has no meaning apart from the retreat it belongs to, and there
 * is no foreign key stopping an orphan, so the UI never offers a way to make
 * one: you add a property from inside a retreat or not at all.
 */

interface Retreat {
  id: number;
  name: string;
  location: string;
  description: string;
  startDate: string;
  endDate: string;
  capacity: number;
  imageUrl: string | null;
  active: boolean;
}

interface Property {
  id: number;
  retreatId: number;
  name: string;
  tier: string;
  description: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  pricePerNight: number;
  imageUrl: string | null;
  amenities: string[] | null;
  available: boolean;
}

const BLANK_RETREAT = {
  name: "",
  location: "",
  description: "",
  startDate: "",
  endDate: "",
  capacity: 12,
  imageUrl: "",
  active: false,
};

const BLANK_PROPERTY = {
  name: "",
  tier: "essential",
  description: "",
  bedrooms: 1,
  bathrooms: 1,
  maxGuests: 2,
  pricePerNight: 0,
  imageUrl: "",
  available: true,
};

const TIERS = ["essential", "premium", "elite"] as const;

export function RetreatsAdmin({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ ...BLANK_RETREAT });
  const [propertyDraft, setPropertyDraft] = useState<Record<number, typeof BLANK_PROPERTY>>({});

  const retreatsQuery = useQuery<Retreat[]>({ queryKey: ["/api/admin/retreats"], enabled });
  const propertiesQuery = useQuery<Property[]>({ queryKey: ["/api/admin/properties"], enabled });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/retreats"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/properties"] });
    // The public list is filtered to active, so flipping that changes it.
    qc.invalidateQueries({ queryKey: ["/api/retreats"] });
  };

  const fail = (title: string) => (error: unknown) =>
    toast({
      title,
      description: error instanceof Error ? error.message.replace(/^\d+:\s*/, "") : undefined,
      variant: "destructive",
    });

  const createRetreat = useMutation({
    mutationFn: async (body: typeof BLANK_RETREAT) => {
      const res = await apiRequest("POST", "/api/admin/retreats", {
        ...body,
        imageUrl: body.imageUrl || null,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setDraft({ ...BLANK_RETREAT });
      toast({ title: "Retreat created", description: "It's a draft until you make it active." });
    },
    onError: fail("Couldn't create it"),
  });

  const updateRetreat = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Retreat> & { id: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/retreats/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Saved" });
    },
    onError: fail("Couldn't save"),
  });

  const deleteRetreat = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/retreats/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Deleted" });
    },
    onError: fail("Couldn't delete"),
  });

  const createProperty = useMutation({
    mutationFn: async ({ retreatId, ...body }: typeof BLANK_PROPERTY & { retreatId: number }) => {
      const res = await apiRequest("POST", "/api/admin/properties", {
        ...body,
        retreatId,
        imageUrl: body.imageUrl || null,
      });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      invalidate();
      setPropertyDraft((d) => {
        const next = { ...d };
        delete next[vars.retreatId];
        return next;
      });
      toast({ title: "Property added" });
    },
    onError: fail("Couldn't add it"),
  });

  const updateProperty = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Property> & { id: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/properties/${id}`, data);
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: fail("Couldn't save"),
  });

  const deleteProperty = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/properties/${id}`);
    },
    onSuccess: () => invalidate(),
    onError: fail("Couldn't delete"),
  });

  const retreats = retreatsQuery.data ?? [];

  const propertiesByRetreat = useMemo(() => {
    const m = new Map<number, Property[]>();
    for (const p of propertiesQuery.data ?? []) {
      m.set(p.retreatId, [...(m.get(p.retreatId) ?? []), p]);
    }
    return m;
  }, [propertiesQuery.data]);

  if (retreatsQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (retreatsQuery.isError) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Couldn't load retreats.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-retreats">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            {retreats.filter((r) => r.active).length} live · {retreats.length} total
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)} data-testid="button-new-retreat">
          <Plus className="h-4 w-4 mr-2" /> New retreat
        </Button>
      </div>

      {creating && (
        <div className="border border-gold/40 rounded-lg p-5 space-y-4 bg-card/40">
          <h3 className="font-display text-lg">New retreat</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Winter Reset"
                data-testid="input-retreat-name"
              />
            </Field>
            <Field label="Location">
              <Input
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="Costa Rica"
              />
            </Field>
            {/* Stored as text, not a date — the marketing pages print things
                like "March 2026" alongside real ISO dates. */}
            <Field label="Starts" hint="Free text — “2026-03-04” or “March 2026”">
              <Input
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
              />
            </Field>
            <Field label="Ends">
              <Input
                value={draft.endDate}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
              />
            </Field>
            <Field label="Capacity">
              <Input
                type="number"
                inputMode="numeric"
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Image URL" hint="Optional">
              <Input
                value={draft.imageUrl}
                onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                placeholder="/images/…"
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              onClick={() => createRetreat.mutate(draft)}
              disabled={createRetreat.isPending || !draft.name.trim()}
            >
              {createRetreat.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {retreats.length === 0 && !creating ? (
        <div className="text-center py-16">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No retreats yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {retreats.map((r) => {
            const open = expanded === r.id;
            const props = propertiesByRetreat.get(r.id) ?? [];
            const pd = propertyDraft[r.id];
            return (
              <div
                key={r.id}
                className="border border-border rounded-lg overflow-hidden"
                data-testid={`retreat-${r.id}`}
              >
                <button
                  onClick={() => setExpanded(open ? null : r.id)}
                  className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left hover-elevate"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          r.active ? "border-green-600/40 text-green-700 dark:text-green-400" : "text-muted-foreground",
                        )}
                      >
                        {r.active ? "live" : "draft"}
                      </Badge>
                      {props.length > 0 && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {props.length} {props.length === 1 ? "property" : "properties"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {r.location} · {r.startDate}–{r.endDate}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")}
                  />
                </button>

                {open && (
                  <div className="border-t border-border p-5 space-y-6 bg-card/40">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Name">
                        <Input
                          defaultValue={r.name}
                          onBlur={(e) =>
                            e.target.value !== r.name && updateRetreat.mutate({ id: r.id, name: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Location">
                        <Input
                          defaultValue={r.location}
                          onBlur={(e) =>
                            e.target.value !== r.location &&
                            updateRetreat.mutate({ id: r.id, location: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Starts">
                        <Input
                          defaultValue={r.startDate}
                          onBlur={(e) =>
                            e.target.value !== r.startDate &&
                            updateRetreat.mutate({ id: r.id, startDate: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Ends">
                        <Input
                          defaultValue={r.endDate}
                          onBlur={(e) =>
                            e.target.value !== r.endDate &&
                            updateRetreat.mutate({ id: r.id, endDate: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Capacity">
                        <Input
                          type="number"
                          inputMode="numeric"
                          defaultValue={r.capacity}
                          onBlur={(e) =>
                            Number(e.target.value) !== r.capacity &&
                            updateRetreat.mutate({ id: r.id, capacity: Number(e.target.value) || 0 })
                          }
                        />
                      </Field>
                      <Field label="Image URL">
                        <Input
                          defaultValue={r.imageUrl ?? ""}
                          onBlur={(e) =>
                            e.target.value !== (r.imageUrl ?? "") &&
                            updateRetreat.mutate({ id: r.id, imageUrl: e.target.value || null })
                          }
                        />
                      </Field>
                    </div>

                    <Field label="Description">
                      <Textarea
                        defaultValue={r.description}
                        rows={3}
                        onBlur={(e) =>
                          e.target.value !== r.description &&
                          updateRetreat.mutate({ id: r.id, description: e.target.value })
                        }
                      />
                    </Field>

                    <div className="flex items-center gap-3">
                      <Switch
                        checked={r.active}
                        onCheckedChange={(active) => updateRetreat.mutate({ id: r.id, active })}
                        id={`active-${r.id}`}
                        data-testid={`switch-active-${r.id}`}
                      />
                      <Label htmlFor={`active-${r.id}`} className="cursor-pointer">
                        Live on the site
                      </Label>
                    </div>

                    {/* ── Properties ─────────────────────────────────── */}
                    <div className="pt-4 border-t border-border space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm uppercase tracking-wider text-muted-foreground">
                          Properties
                        </h4>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPropertyDraft((d) => ({
                              ...d,
                              [r.id]: d[r.id] ? d[r.id] : { ...BLANK_PROPERTY },
                            }))
                          }
                        >
                          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
                        </Button>
                      </div>

                      {props.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-md border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{p.name}</span>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {p.tier}
                              </Badge>
                              {!p.available && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                  unavailable
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                              <span className="flex items-center gap-1">
                                <BedDouble className="h-3 w-3" /> {p.bedrooms} bd · {p.bathrooms} ba
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" /> up to {p.maxGuests}
                              </span>
                              <span>${p.pricePerNight}/night</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch
                              checked={p.available}
                              onCheckedChange={(available) =>
                                updateProperty.mutate({ id: p.id, available })
                              }
                              aria-label={`${p.name} available`}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="tap text-muted-foreground hover:text-destructive"
                              onClick={() => deleteProperty.mutate(p.id)}
                              aria-label={`Delete ${p.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {pd && (
                        <div className="rounded-md border border-gold/40 p-4 space-y-3">
                          <div className="grid sm:grid-cols-2 gap-3">
                            <Field label="Name">
                              <Input
                                value={pd.name}
                                onChange={(e) =>
                                  setPropertyDraft((d) => ({ ...d, [r.id]: { ...pd, name: e.target.value } }))
                                }
                                placeholder="Casa Verde"
                              />
                            </Field>
                            <Field label="Tier">
                              <select
                                value={pd.tier}
                                onChange={(e) =>
                                  setPropertyDraft((d) => ({ ...d, [r.id]: { ...pd, tier: e.target.value } }))
                                }
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm capitalize"
                              >
                                {TIERS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Bedrooms">
                              <Input
                                type="number"
                                inputMode="numeric"
                                value={pd.bedrooms}
                                onChange={(e) =>
                                  setPropertyDraft((d) => ({
                                    ...d,
                                    [r.id]: { ...pd, bedrooms: Number(e.target.value) || 0 },
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Bathrooms">
                              <Input
                                type="number"
                                inputMode="numeric"
                                value={pd.bathrooms}
                                onChange={(e) =>
                                  setPropertyDraft((d) => ({
                                    ...d,
                                    [r.id]: { ...pd, bathrooms: Number(e.target.value) || 0 },
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Max guests">
                              <Input
                                type="number"
                                inputMode="numeric"
                                value={pd.maxGuests}
                                onChange={(e) =>
                                  setPropertyDraft((d) => ({
                                    ...d,
                                    [r.id]: { ...pd, maxGuests: Number(e.target.value) || 1 },
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Price per night" hint="Whole dollars">
                              <Input
                                type="number"
                                inputMode="numeric"
                                value={pd.pricePerNight}
                                onChange={(e) =>
                                  setPropertyDraft((d) => ({
                                    ...d,
                                    [r.id]: { ...pd, pricePerNight: Number(e.target.value) || 0 },
                                  }))
                                }
                              />
                            </Field>
                          </div>
                          <Field label="Description">
                            <Textarea
                              value={pd.description}
                              rows={2}
                              onChange={(e) =>
                                setPropertyDraft((d) => ({
                                  ...d,
                                  [r.id]: { ...pd, description: e.target.value },
                                }))
                              }
                            />
                          </Field>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => createProperty.mutate({ ...pd, retreatId: r.id })}
                              disabled={createProperty.isPending || !pd.name.trim()}
                            >
                              Add property
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setPropertyDraft((d) => {
                                  const next = { ...d };
                                  delete next[r.id];
                                  return next;
                                })
                              }
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {props.length === 0 && !pd && (
                        <p className="text-sm text-muted-foreground">No properties on this retreat yet.</p>
                      )}
                    </div>

                    {/* Deleting takes the properties with it. Retiring is
                        almost always what you actually want, so it leads. */}
                    <div className="pt-4 border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const n = props.length;
                          const warning = n
                            ? `Delete “${r.name}” and its ${n} ${n === 1 ? "property" : "properties"}? Bookings are kept.`
                            : `Delete “${r.name}”? Bookings are kept.`;
                          if (window.confirm(warning)) deleteRetreat.mutate(r.id);
                        }}
                        data-testid={`button-delete-retreat-${r.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete retreat
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
