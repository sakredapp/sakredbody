import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Trash2, Users, CalendarDays, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  COHORT_KINDS,
  COHORT_FORMATS,
  COHORT_STATUSES,
  COHORT_MEMBER_STATUSES,
} from "@shared/models/cohorts";

/**
 * Masterminds.
 *
 * supabase/cohorts.sql created four tables, turned on RLS and wrote eight
 * policies — and then nothing referenced any of it. There was no model, no
 * route, and no screen. This is the screen.
 *
 * A cohort holds three things, and they're the three sections here: what it
 * is, who's in it, and when it meets. The roster is the part that matters
 * most day to day, so it opens first.
 */

interface Cohort {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  coverUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  format: string;
  location: string | null;
  capacity: number;
  priceCents: number | null;
  priceNote: string | null;
  applicationRequired: boolean;
  status: string;
  sortOrder: number;
  seatsTaken: number;
  pendingApplications: number;
}

interface RosterRow {
  id: string;
  cohortId: string;
  userId: string;
  status: string;
  note: string | null;
  reviewNote: string | null;
  appliedAt: string | null;
  decidedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface CohortSession {
  id: string;
  cohortId: string;
  title: string;
  agenda: string | null;
  startsAt: string | null;
  durationMinutes: number | null;
  location: string | null;
  orderIndex: number;
}

const BLANK: {
  name: string;
  kind: string;
  format: string;
  status: string;
  capacity: number;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  priceNote: string;
} = {
  name: "",
  kind: "mastermind",
  format: "hybrid",
  status: "draft",
  capacity: 12,
  startDate: "",
  endDate: "",
  location: "",
  description: "",
  priceNote: "",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "text-muted-foreground",
  open: "border-gold/50 text-gold",
  closed: "border-blue-600/40 text-blue-700 dark:text-blue-400",
  running: "border-green-600/40 text-green-700 dark:text-green-400",
  complete: "text-muted-foreground",
};

const MEMBER_STATUS_STYLES: Record<string, string> = {
  applied: "border-gold/50 text-gold",
  invited: "border-blue-600/40 text-blue-700 dark:text-blue-400",
  confirmed: "border-green-600/40 text-green-700 dark:text-green-400",
  declined: "border-destructive/40 text-destructive",
  withdrawn: "text-muted-foreground",
};

const FORMAT_LABELS: Record<string, string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid",
};

/** Cents in the column, dollars on the screen. */
const money = (cents: number | null) =>
  cents === null ? null : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function MastermindsAdmin({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pane, setPane] = useState<"roster" | "schedule" | "settings">("roster");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ ...BLANK });

  const cohortsQuery = useQuery<Cohort[]>({ queryKey: ["/api/admin/cohorts"], enabled });

  const fail = (title: string) => (error: unknown) =>
    toast({
      title,
      description: error instanceof Error ? error.message.replace(/^\d+:\s*/, "") : undefined,
      variant: "destructive",
    });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/cohorts"] });

  const createCohort = useMutation({
    mutationFn: async (body: typeof BLANK) => {
      const res = await apiRequest("POST", "/api/admin/cohorts", {
        ...body,
        startDate: body.startDate || null,
        endDate: body.endDate || null,
        location: body.location || null,
        description: body.description || null,
        priceNote: body.priceNote || null,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setDraft({ ...BLANK });
      toast({ title: "Created", description: "It's a draft — nobody can see it yet." });
    },
    onError: fail("Couldn't create it"),
  });

  const updateCohort = useMutation({
    mutationFn: async ({ id, ...data }: Record<string, unknown> & { id: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/cohorts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Saved" });
    },
    onError: fail("Couldn't save"),
  });

  const deleteCohort = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/cohorts/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Deleted" });
    },
    onError: fail("Couldn't delete"),
  });

  const cohorts = cohortsQuery.data ?? [];

  if (cohortsQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (cohortsQuery.isError) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-2">Couldn't load masterminds.</p>
        <p className="text-xs text-muted-foreground">
          If this is the first time, run <code>supabase/cohorts.sql</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-masterminds">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {cohorts.filter((c) => c.status === "open" || c.status === "running").length} active ·{" "}
          {cohorts.reduce((n, c) => n + c.pendingApplications, 0)} applications waiting
        </p>
        <Button onClick={() => setCreating((v) => !v)} data-testid="button-new-cohort">
          <Plus className="h-4 w-4 mr-2" /> New mastermind
        </Button>
      </div>

      {creating && (
        <div className="border border-gold/40 rounded-lg p-5 space-y-4 bg-card/40">
          <h3 className="font-display text-lg">New mastermind</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Spring 2026 Mastermind"
                data-testid="input-cohort-name"
              />
            </Field>
            <Field label="Kind">
              <Select value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COHORT_KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Format">
              <Select value={draft.format} onValueChange={(format) => setDraft({ ...draft, format })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COHORT_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Capacity">
              <Input
                type="number"
                inputMode="numeric"
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label="Starts" hint="YYYY-MM-DD">
              <Input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
              />
            </Field>
            <Field label="Location" hint="Optional">
              <Input
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              />
            </Field>
            <Field label="Price note" hint="Free text — “$12,000 / year, paid quarterly”">
              <Input
                value={draft.priceNote}
                onChange={(e) => setDraft({ ...draft, priceNote: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={draft.description}
              rows={3}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              onClick={() => createCohort.mutate(draft)}
              disabled={createCohort.isPending || !draft.name.trim()}
            >
              {createCohort.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {cohorts.length === 0 && !creating ? (
        <div className="text-center py-16">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No masterminds yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cohorts.map((c) => {
            const open = expanded === c.id;
            return (
              <div key={c.id} className="border border-border rounded-lg overflow-hidden" data-testid={`cohort-${c.id}`}>
                <button
                  onClick={() => {
                    setExpanded(open ? null : c.id);
                    setPane("roster");
                  }}
                  className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left hover-elevate"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name}</span>
                      <Badge variant="outline" className={cn("text-[10px] capitalize", STATUS_STYLES[c.status])}>
                        {c.status}
                      </Badge>
                      {c.pendingApplications > 0 && (
                        <Badge variant="outline" className="text-[10px] border-gold/50 text-gold">
                          {c.pendingApplications} to review
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {c.seatsTaken} of {c.capacity} seats · {FORMAT_LABELS[c.format] ?? c.format}
                      {c.startDate ? ` · from ${c.startDate}` : ""}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")}
                  />
                </button>

                {open && (
                  <div className="border-t border-border bg-card/40">
                    {/* Three panes rather than one long form — a roster and a
                        schedule are different jobs on different days. */}
                    <div className="flex gap-1 p-2 border-b border-border overflow-x-auto scrollbar-none">
                      {([
                        ["roster", `Roster (${c.seatsTaken})`, Users],
                        ["schedule", "Schedule", CalendarDays],
                        ["settings", "Settings", Sparkles],
                      ] as const).map(([key, label, Icon]) => (
                        <button
                          key={key}
                          onClick={() => setPane(key)}
                          className={cn(
                            "tap px-3 rounded-md text-sm whitespace-nowrap flex items-center gap-2 transition-colors",
                            pane === key ? "bg-gold/10 text-gold" : "text-muted-foreground hover-elevate",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </button>
                      ))}
                    </div>

                    <div className="p-5">
                      {pane === "roster" && <Roster cohortId={c.id} capacity={c.capacity} />}
                      {pane === "schedule" && <Schedule cohortId={c.id} />}
                      {pane === "settings" && (
                        <Settings
                          cohort={c}
                          onSave={(data) => updateCohort.mutate({ id: c.id, ...data })}
                          onDelete={() => {
                            if (
                              window.confirm(
                                `Delete “${c.name}”? Its roster and schedule go too — every application to it is lost.`,
                              )
                            ) {
                              deleteCohort.mutate(c.id);
                            }
                          }}
                          saving={updateCohort.isPending}
                        />
                      )}
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

/** The roster: a state machine, shown as a list with one control each. */
function Roster({ cohortId, capacity }: { cohortId: string; capacity: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery<RosterRow[]>({ queryKey: ["/api/admin/cohorts", cohortId, "members"] });

  const decide = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; reviewNote?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/cohort-members/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cohorts", cohortId, "members"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/cohorts"] });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  if (query.isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto my-6" />;
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Nobody has applied yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {rows.filter((r) => r.status === "confirmed" || r.status === "invited").length} of {capacity} seats taken
      </p>
      {rows.map((r) => {
        const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || r.userId;
        return (
          <div
            key={r.id}
            className="rounded-md border border-border p-4 flex flex-col sm:flex-row sm:items-start gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{name}</span>
                <Badge variant="outline" className={cn("text-[10px] capitalize", MEMBER_STATUS_STYLES[r.status])}>
                  {r.status}
                </Badge>
              </div>
              {r.email && <p className="text-xs text-muted-foreground mt-0.5">{r.email}</p>}
              {r.note && (
                <p className="text-sm mt-2 whitespace-pre-wrap text-muted-foreground">{r.note}</p>
              )}
            </div>
            <Select value={r.status} onValueChange={(status) => decide.mutate({ id: r.id, status })}>
              <SelectTrigger className="w-full sm:w-40 shrink-0" data-testid={`select-member-${r.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COHORT_MEMBER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

function Schedule({ cohortId }: { cohortId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", agenda: "", startsAt: "", durationMinutes: 90, location: "" });

  const key = ["/api/admin/cohorts", cohortId, "sessions"];
  const query = useQuery<CohortSession[]>({ queryKey: key });

  const create = useMutation({
    mutationFn: async (body: typeof draft) => {
      const res = await apiRequest("POST", `/api/admin/cohorts/${cohortId}/sessions`, {
        ...body,
        agenda: body.agenda || null,
        location: body.location || null,
        startsAt: body.startsAt || null,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setAdding(false);
      setDraft({ title: "", agenda: "", startsAt: "", durationMinutes: 90, location: "" });
    },
    onError: () => toast({ title: "Couldn't add it", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/cohort-sessions/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast({ title: "Couldn't delete", variant: "destructive" }),
  });

  if (query.isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto my-6" />;
  }

  const sessions = query.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add session
        </Button>
      </div>

      {adding && (
        <div className="rounded-md border border-gold/40 p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Title">
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Opening call"
              />
            </Field>
            <Field label="Starts">
              <Input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              />
            </Field>
            <Field label="Minutes">
              <Input
                type="number"
                inputMode="numeric"
                value={draft.durationMinutes}
                onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Location" hint="Or a call link">
              <Input
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Agenda">
            <Textarea
              value={draft.agenda}
              rows={2}
              onChange={(e) => setDraft({ ...draft, agenda: e.target.value })}
            />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => create.mutate(draft)} disabled={create.isPending || !draft.title.trim()}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {sessions.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-4">No sessions scheduled.</p>
      ) : (
        sessions.map((s) => (
          <div key={s.id} className="rounded-md border border-border p-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{s.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.startsAt ? new Date(s.startsAt).toLocaleString() : "Unscheduled"}
                {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                {s.location ? ` · ${s.location}` : ""}
              </p>
              {s.agenda && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{s.agenda}</p>}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="tap text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => remove.mutate(s.id)}
              aria-label={`Delete ${s.title}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

function Settings({
  cohort,
  onSave,
  onDelete,
  saving,
}: {
  cohort: Cohort;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name">
          <Input
            defaultValue={cohort.name}
            onBlur={(e) => e.target.value !== cohort.name && onSave({ name: e.target.value })}
          />
        </Field>
        <Field label="Status" hint="A draft is invisible to everyone">
          <Select value={cohort.status} onValueChange={(status) => onSave({ status })}>
            <SelectTrigger data-testid={`select-cohort-status-${cohort.id}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {COHORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Format">
          <Select value={cohort.format} onValueChange={(format) => onSave({ format })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COHORT_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Capacity">
          <Input
            type="number"
            inputMode="numeric"
            defaultValue={cohort.capacity}
            onBlur={(e) =>
              Number(e.target.value) !== cohort.capacity && onSave({ capacity: Number(e.target.value) || 1 })
            }
          />
        </Field>
        <Field label="Starts">
          <Input
            type="date"
            defaultValue={cohort.startDate ?? ""}
            onBlur={(e) => e.target.value !== (cohort.startDate ?? "") && onSave({ startDate: e.target.value || null })}
          />
        </Field>
        <Field label="Ends">
          <Input
            type="date"
            defaultValue={cohort.endDate ?? ""}
            onBlur={(e) => e.target.value !== (cohort.endDate ?? "") && onSave({ endDate: e.target.value || null })}
          />
        </Field>
        <Field label="Location">
          <Input
            defaultValue={cohort.location ?? ""}
            onBlur={(e) => e.target.value !== (cohort.location ?? "") && onSave({ location: e.target.value || null })}
          />
        </Field>
        <Field label="Price note" hint={money(cohort.priceCents) ? `Stored price: ${money(cohort.priceCents)}` : undefined}>
          <Input
            defaultValue={cohort.priceNote ?? ""}
            onBlur={(e) => e.target.value !== (cohort.priceNote ?? "") && onSave({ priceNote: e.target.value || null })}
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          defaultValue={cohort.description ?? ""}
          rows={4}
          onBlur={(e) =>
            e.target.value !== (cohort.description ?? "") && onSave({ description: e.target.value || null })
          }
        />
      </Field>

      {saving && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </p>
      )}

      <div className="pt-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          data-testid={`button-delete-cohort-${cohort.id}`}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete mastermind
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
