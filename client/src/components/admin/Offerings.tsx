/**
 * Admin — what's on.
 *
 * Two panes. Left: everything scheduled, drafts included. Right: the selected
 * offering, its schedule, who's leading it, and who's asked to come.
 *
 * The roster is the part that actually matters. An offering with no decisions
 * made on it is a list of people waiting to hear back, and that is the thing
 * most likely to be forgotten.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip, LabelWithInfo } from "@/components/ui/info-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Check, X, Users, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OFFERING_KIND_LABELS,
  OFFERING_FORMAT_LABELS,
  TIER_RANKS,
  type Offering,
  type OfferingSession,
  type Host,
  type OfferingKind,
  type RegistrationStatus,
} from "@shared/schema";

type OfferingRow = Offering & {
  hosts: (Host & { role: string })[];
  counts: Record<string, number>;
};

interface RosterRow {
  registration: {
    id: string;
    status: RegistrationStatus;
    note: string | null;
    reviewNote: string | null;
    appliedAt: string | null;
  };
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

const KINDS = Object.keys(OFFERING_KIND_LABELS) as OfferingKind[];

const TIERS = [
  { rank: TIER_RANKS.free, label: "Everyone" },
  { rank: TIER_RANKS.member, label: "Member and above" },
  { rank: TIER_RANKS.inner, label: "Inner circle and above" },
  { rank: TIER_RANKS.executive, label: "Executive only" },
];

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Editor ────────────────────────────────────────────────────────────────

function Editor({
  offering,
  onDone,
}: {
  offering: Partial<Offering> | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isNew = !offering?.id;

  const [d, setD] = useState({
    slug: offering?.slug ?? "",
    name: offering?.name ?? "",
    kind: (offering?.kind ?? "webinar") as string,
    summary: offering?.summary ?? "",
    description: offering?.description ?? "",
    coverUrl: offering?.coverUrl ?? "",
    startDate: offering?.startDate ?? "",
    endDate: offering?.endDate ?? "",
    format: offering?.format ?? "virtual",
    location: offering?.location ?? "",
    timezone: offering?.timezone ?? "America/New_York",
    registrationMode: offering?.registrationMode ?? "open",
    capacity: offering?.capacity == null ? "" : String(offering.capacity),
    priceCents: offering?.priceCents == null ? "" : String(offering.priceCents / 100),
    priceNote: offering?.priceNote ?? "",
    minTierRank: offering?.minTierRank ?? 0,
    meetingUrl: offering?.meetingUrl ?? "",
    status: offering?.status ?? "draft",
    isFeatured: offering?.isFeatured ?? false,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...d,
        summary: d.summary.trim() || null,
        description: d.description.trim() || null,
        coverUrl: d.coverUrl.trim() || null,
        location: d.location.trim() || null,
        meetingUrl: d.meetingUrl.trim() || null,
        priceNote: d.priceNote.trim() || null,
        startDate: d.startDate || null,
        endDate: d.endDate || null,
        // Empty means unlimited, which is a real state, not a missing value.
        capacity: d.capacity === "" ? null : Number(d.capacity),
        // Money is entered in dollars and stored in cents — rounded here so a
        // stray 19.999 can't become 1999.9 cents.
        priceCents: d.priceCents === "" ? null : Math.round(Number(d.priceCents) * 100),
      };
      const res = isNew
        ? await apiRequest("POST", "/api/admin/offerings", body)
        : await apiRequest("PUT", `/api/admin/offerings/${offering!.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/offerings"] });
      qc.invalidateQueries({ queryKey: ["/api/offerings"] });
      onDone();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const online = d.format !== "in_person";

  return (
    <div className="space-y-5 border border-border/60 rounded-md p-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input
            value={d.name}
            onChange={(e) =>
              setD({ ...d, name: e.target.value, ...(isNew ? { slug: slugify(e.target.value) } : {}) })
            }
            placeholder="Where Energy Actually Goes"
            data-testid="input-offering-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Slug</Label>
          <Input value={d.slug} onChange={(e) => setD({ ...d, slug: slugify(e.target.value) })} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Summary</Label>
        <Input
          value={d.summary}
          onChange={(e) => setD({ ...d, summary: e.target.value })}
          placeholder="One line. This is what the card says."
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Textarea
          value={d.description}
          onChange={(e) => setD({ ...d, description: e.target.value })}
          rows={4}
          className="resize-none"
          placeholder="The full thing. Sits behind a disclosure on the page."
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Kind</Label>
          <Select value={d.kind} onValueChange={(v) => setD({ ...d, kind: v })}>
            <SelectTrigger data-testid="select-offering-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>{OFFERING_KIND_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Format</Label>
          <Select value={d.format} onValueChange={(v) => setD({ ...d, format: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(OFFERING_FORMAT_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            <LabelWithInfo label="Status" title="What each status does">
              Draft is invisible to everyone. Open accepts registrations.
              Running is under way and still joinable. Closed and complete both
              stop new people getting in.
            </LabelWithInfo>
          </Label>
          <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v })}>
            <SelectTrigger data-testid="select-offering-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["draft", "open", "closed", "running", "complete"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Starts</Label>
          <Input type="date" value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ends</Label>
          <Input type="date" value={d.endDate} onChange={(e) => setD({ ...d, endDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            <LabelWithInfo label="Timezone" title="Whose hour?">
              Session times are stored absolutely and shown to each member in
              their own zone. This is the canonical one, so "7pm ET" still
              reads as 7pm ET on the page.
            </LabelWithInfo>
          </Label>
          <Input value={d.timezone} onChange={(e) => setD({ ...d, timezone: e.target.value })} />
        </div>
      </div>

      {online ? (
        <div className="space-y-1.5">
          <Label className="text-xs">
            <LabelWithInfo label="Meeting link" title="Who sees this">
              Only members whose registration is confirmed. It is stripped from
              every other response on the server, not hidden in the interface.
            </LabelWithInfo>
          </Label>
          <Input
            value={d.meetingUrl}
            onChange={(e) => setD({ ...d, meetingUrl: e.target.value })}
            placeholder="https://zoom.us/j/…"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Where</Label>
          <Input
            value={d.location}
            onChange={(e) => setD({ ...d, location: e.target.value })}
            placeholder="Rincón, Puerto Rico"
          />
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">
            <LabelWithInfo label="How to join" title="Three ways in">
              Open takes them straight in, or waitlists them if it's full.
              Application asks for a paragraph and waits for your decision.
              Invite means only you can add someone.
            </LabelWithInfo>
          </Label>
          <Select value={d.registrationMode} onValueChange={(v) => setD({ ...d, registrationMode: v })}>
            <SelectTrigger data-testid="select-registration-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open — register and you're in</SelectItem>
              <SelectItem value="application">Application</SelectItem>
              <SelectItem value="invite">Invitation only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            <LabelWithInfo label="Capacity" title="Leave it empty">
              An empty capacity means unlimited, which is usually right for a
              webinar and never right for a mastermind.
            </LabelWithInfo>
          </Label>
          <Input
            type="number"
            value={d.capacity}
            onChange={(e) => setD({ ...d, capacity: e.target.value })}
            placeholder="Unlimited"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Who can see it</Label>
          <Select
            value={String(d.minTierRank)}
            onValueChange={(v) => setD({ ...d, minTierRank: Number(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t.rank} value={String(t.rank)}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Price (dollars)</Label>
          <Input
            type="number"
            value={d.priceCents}
            onChange={(e) => setD({ ...d, priceCents: e.target.value })}
            placeholder="0 for free"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Price note</Label>
          <Input value={d.priceNote} onChange={(e) => setD({ ...d, priceNote: e.target.value })} placeholder="per person" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cover image URL</Label>
          <Input value={d.coverUrl} onChange={(e) => setD({ ...d, coverUrl: e.target.value })} placeholder="/images/cliffs-sea.jpg" />
        </div>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <Switch checked={d.isFeatured} onCheckedChange={(v) => setD({ ...d, isFeatured: v })} />
        <span className="text-sm">Feature it — sorts to the top</span>
      </label>

      <div className="flex gap-2">
        <Button
          onClick={() => save.mutate()}
          disabled={!d.name.trim() || !d.slug.trim() || save.isPending}
          className="bg-gold border-gold-border text-white"
          data-testid="button-save-offering"
        >
          {isNew ? "Create" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Sessions ──────────────────────────────────────────────────────────────

function Sessions({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [minutes, setMinutes] = useState("60");

  const detail = useQuery<Offering & { sessions: OfferingSession[] }>({
    queryKey: ["/api/offerings", offeringId],
    queryFn: async () => {
      const res = await fetch(`/api/offerings/${offeringId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load the schedule");
      return res.json();
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/offerings", offeringId] });

  const add = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/offerings/${offeringId}/sessions`, {
        title,
        // A local datetime-local value becomes an absolute instant here, which
        // is what the column stores.
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        durationMinutes: minutes ? Number(minutes) : null,
      }).then((r) => r.json()),
    onSuccess: () => {
      setTitle("");
      setStartsAt("");
      refresh();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/sessions/${id}`),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Schedule</p>

      {detail.data?.sessions?.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-3 border border-border/50 rounded-md px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-sm">{s.title}</p>
            <p className="text-xs text-muted-foreground">
              {s.startsAt
                ? new Date(String(s.startsAt)).toLocaleString(undefined, {
                    weekday: "short", month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                  })
                : "No time set"}
              {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
          </Button>
        </div>
      ))}

      <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <Input placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <Input type="number" className="w-24" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        <Button
          variant="outline"
          onClick={() => add.mutate()}
          disabled={!title.trim() || add.isPending}
          data-testid="button-add-session"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Roster ────────────────────────────────────────────────────────────────

function Roster({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const roster = useQuery<RosterRow[]>({
    queryKey: ["/api/admin/offerings", offeringId, "roster"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/offerings/${offeringId}/roster`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Couldn't load the roster");
      return res.json();
    },
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; status: RegistrationStatus }) =>
      apiRequest("PATCH", `/api/admin/offerings/registrations/${input.id}`, {
        status: input.status,
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/offerings", offeringId, "roster"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/offerings"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (roster.isLoading) return <Skeleton className="h-24 w-full" />;

  const rows = roster.data ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody yet.</p>;
  }

  // Undecided first — the whole reason to open this screen.
  const order: Record<string, number> = {
    applied: 0, waitlist: 1, invited: 2, confirmed: 3, declined: 4, withdrawn: 5,
  };
  const sorted = [...rows].sort(
    (a, b) => (order[a.registration.status] ?? 9) - (order[b.registration.status] ?? 9),
  );

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Roster</p>
      {sorted.map(({ registration, firstName, lastName, email }) => {
        const name = [firstName, lastName].filter(Boolean).join(" ") || email || "Someone";
        const pending = registration.status === "applied" || registration.status === "waitlist";
        return (
          <div
            key={registration.id}
            className={cn(
              "border rounded-md p-3 space-y-2",
              pending ? "border-[hsl(var(--gold))]/40" : "border-border/50",
            )}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{email}</p>
              </div>
              <Badge variant={registration.status === "confirmed" ? "default" : "outline"} className="text-[10px]">
                {registration.status}
              </Badge>
            </div>

            {registration.note && (
              <p className="text-sm text-muted-foreground border-l-2 border-border pl-3">
                {registration.note}
              </p>
            )}

            {registration.status !== "confirmed" && (
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decide.mutate({ id: registration.id, status: "confirmed" })}
                  data-testid="button-confirm-registration"
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" /> Let them in
                </Button>
                {registration.status !== "declined" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => decide.mutate({ id: registration.id, status: "declined" })}
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" /> Not this time
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── The screen ────────────────────────────────────────────────────────────

export function OfferingsAdmin() {
  const [selected, setSelected] = useState<OfferingRow | null>(null);
  const [editing, setEditing] = useState<Partial<Offering> | null>(null);

  const list = useQuery<OfferingRow[]>({ queryKey: ["/api/admin/offerings"] });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="font-display text-2xl">What's on</h2>
          <p className="text-sm text-muted-foreground">
            Retreats, masterminds, webinars and talks. One catalogue.
          </p>
        </div>
        <Button variant="outline" onClick={() => { setEditing({}); setSelected(null); }} data-testid="button-new-offering">
          <Plus className="h-4 w-4 mr-1.5" /> New
        </Button>
      </div>

      {editing && <Editor offering={editing} onDone={() => setEditing(null)} />}

      {list.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
          <div className="space-y-2">
            {(list.data ?? []).map((o) => (
              <button
                key={o.id}
                onClick={() => setSelected(o.id === selected?.id ? null : o)}
                className={cn(
                  "w-full text-left border rounded-md p-3 transition-colors",
                  selected?.id === o.id
                    ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/5"
                    : "border-border/60 hover:border-border",
                )}
                data-testid={`admin-offering-${o.slug}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{o.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {OFFERING_KIND_LABELS[o.kind as OfferingKind] ?? o.kind}
                  </Badge>
                  {o.status === "draft" && (
                    <Badge variant="outline" className="text-[10px]">draft</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                  {o.startDate && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> {o.startDate}
                    </span>
                  )}
                  {(o.counts.applied ?? 0) > 0 && (
                    <span className="text-[hsl(var(--gold))] inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {o.counts.applied} waiting
                    </span>
                  )}
                  {(o.counts.confirmed ?? 0) > 0 && <span>{o.counts.confirmed} confirmed</span>}
                </p>
              </button>
            ))}

            {(list.data ?? []).length === 0 && !editing && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nothing scheduled. Start with a talk — it's the smallest thing
                that proves the whole flow works.
              </p>
            )}
          </div>

          {selected && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display text-xl">{selected.name}</h3>
                <Button size="sm" variant="ghost" onClick={() => setEditing(selected)}>
                  Edit
                </Button>
              </div>
              <Sessions offeringId={selected.id} />
              <Roster offeringId={selected.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
