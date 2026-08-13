/**
 * Building a Coach's Plan.
 *
 * ── Nothing here is live until somebody says so ───────────────────────────
 *
 * Every edit writes to a draft. A coach thinking out loud on a Tuesday
 * afternoon is not changing what their client is asked to do that evening, one
 * click at a time — which is what an editor that wrote straight through to
 * habit phases would do.
 *
 * ── And the review is not a summary ───────────────────────────────────────
 *
 * The Review step renders the exact object activation then executes. It is not
 * a preview generated separately and hoped to match; if it says "Protein 140 →
 * 165", that is because the server resolved it that way and will do that.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, AlertTriangle, Info, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type CatalogueHabit = {
  id: string;
  title: string;
  shortDescription: string | null;
  emphasis: string | null;
  trackingType: string;
  defaultTarget: number | null;
  loadClass: string | null;
  terrainFit: string | null;
  maxPerWeek: number | null;
};

type PlanItem = {
  routineHabitId: string;
  intent: "add" | "change" | "end";
  target: number | null;
  schedule: { kind: string; days?: number[]; count?: number } | null;
  memberReason: string | null;
};

type Plan = {
  id: string;
  title: string;
  focus: string | null;
  memberVisibleNote: string | null;
  internalNote: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
  items: {
    routineHabitId: string;
    intent: string;
    target: number | null;
    scheduleKind: string | null;
    scheduleCount: number | null;
    memberReason: string | null;
    title: string;
  }[];
};

type Review = {
  changes: { routineHabitId: string; title: string; action: string; from: string | null; to: string | null }[];
  findings: { level: "block" | "warn"; routineHabitId: string | null; message: string }[];
  canActivate: boolean;
  checked: {
    catalogueLimits: boolean;
    terrainFit: boolean;
    stressLoad: boolean;
    declaredConflicts: boolean;
  };
};

const ACTION_LABEL: Record<string, string> = {
  add: "Add",
  change: "Change",
  end: "End",
  keep: "Keep",
};

const ACTION_TONE: Record<string, string> = {
  add: "text-[hsl(var(--gold))]",
  change: "text-[hsl(var(--gold))]",
  end: "text-muted-foreground",
  keep: "text-muted-foreground/60",
};

// ─── Choosing a practice ───────────────────────────────────────────────────

/**
 * The catalogue, and only the catalogue.
 *
 * There is deliberately no "or type your own". The Habit OS runs on defined
 * practices carrying a load class, a terrain fit and a tracking contract; a
 * name typed into a box has none of those, so it cannot be scheduled, graded,
 * measured against a health metric, or weighed by the safety check. A coach who
 * needs something that isn't here needs the catalogue changed — which is a
 * decision about everybody, not one member.
 */
function HabitPicker({
  chosen,
  onPick,
  onClose,
}: {
  chosen: Set<string>;
  onPick: (h: CatalogueHabit) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<"all" | "yin" | "yang">("all");

  const { data, isLoading } = useQuery<{ habits: CatalogueHabit[] }>({
    queryKey: ["/api/coach/catalogue"],
    queryFn: async () => {
      const res = await fetch("/api/coach/catalogue", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the catalogue.");
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.habits ?? []).filter((h) => {
      if (chosen.has(h.id)) return false;
      if (side !== "all" && h.emphasis !== side) return false;
      if (q && !h.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, query, side, chosen]);

  return (
    <div className="rounded-xl border border-[hsl(var(--gold))]/20 bg-card/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Add a practice
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search practices"
            className="pl-9 h-9 text-sm"
            data-testid="plan-habit-search"
          />
        </div>
        {(["all", "yin", "yang"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs transition-colors tap-clean",
              side === s
                ? "bg-[hsl(var(--gold))]/12 text-[hsl(var(--gold))]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "all" ? "All" : s === "yin" ? "Restore" : "Build"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nothing matches that.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1.5 scrollbar-thin">
          {shown.map((h) => (
            <button
              key={h.id}
              onClick={() => onPick(h)}
              className="w-full text-left rounded-lg border border-border/30 px-3 py-2 hover:border-border/60 transition-colors tap-clean"
              data-testid={`plan-pick-${h.id}`}
            >
              <p className="text-sm">{h.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {[
                  h.emphasis === "yin" ? "Restore" : h.emphasis === "yang" ? "Build" : null,
                  h.loadClass,
                  h.maxPerWeek ? `max ${h.maxPerWeek}/week` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── One row in the plan ───────────────────────────────────────────────────

function ItemRow({
  item,
  habit,
  onChange,
  onRemove,
}: {
  item: PlanItem;
  habit: CatalogueHabit | undefined;
  onChange: (next: PlanItem) => void;
  onRemove: () => void;
}) {
  const boolean = habit?.trackingType === "boolean";
  const frequency =
    item.schedule?.kind === "times_per_week" ? item.schedule.count ?? 7 : 7;

  return (
    <div className="rounded-lg border border-border/30 px-3 py-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">{habit?.title ?? "Practice"}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {[
              habit?.emphasis === "yin" ? "Restore" : habit?.emphasis === "yang" ? "Build" : null,
              habit?.loadClass,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground p-1 shrink-0"
          aria-label="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Only what this tracking type actually has. A boolean habit has no
            number to aim at, and offering one would invent a contract. */}
        {!boolean && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Target
            <Input
              type="number"
              value={item.target ?? habit?.defaultTarget ?? ""}
              onChange={(e) =>
                onChange({ ...item, target: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="h-8 w-24 text-sm"
              data-testid={`plan-target-${item.routineHabitId}`}
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Per week
          <Input
            type="number"
            min={1}
            max={7}
            value={frequency}
            onChange={(e) => {
              const n = Math.max(1, Math.min(7, Number(e.target.value) || 7));
              onChange({
                ...item,
                schedule: n >= 7 ? { kind: "daily" } : { kind: "times_per_week", count: n },
              });
            }}
            className="h-8 w-16 text-sm"
            data-testid={`plan-frequency-${item.routineHabitId}`}
          />
        </label>

        {/* The catalogue's own ceiling, said before the review refuses it. */}
        {habit?.maxPerWeek != null && (
          <span className="text-[10px] text-muted-foreground/70">max {habit.maxPerWeek}</span>
        )}
      </div>

      {/*
        The member's "why", not the coach's note. Two audiences, two fields —
        the internal note lives at the plan level and never comes down this
        pipe.
      */}
      <Textarea
        value={item.memberReason ?? ""}
        onChange={(e) => onChange({ ...item, memberReason: e.target.value || null })}
        placeholder="Why this, for them to read…"
        rows={2}
        className="text-sm resize-none"
        data-testid={`plan-reason-${item.routineHabitId}`}
      />
    </div>
  );
}

// ─── The editor ────────────────────────────────────────────────────────────

export function PlanEditor({
  memberId,
  memberName,
  plan,
  onDone,
}: {
  memberId: string;
  memberName: string;
  plan: Plan;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [picking, setPicking] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const [title, setTitle] = useState(plan.title);
  const [focus, setFocus] = useState(plan.focus ?? "");
  const [note, setNote] = useState(plan.memberVisibleNote ?? "");
  const [internal, setInternal] = useState(plan.internalNote ?? "");
  const [endsOn, setEndsOn] = useState(plan.endsOn ?? "");
  const [items, setItems] = useState<PlanItem[]>(() =>
    plan.items.map((i) => ({
      routineHabitId: i.routineHabitId,
      intent: i.intent as PlanItem["intent"],
      target: i.target,
      schedule:
        i.scheduleKind === "times_per_week"
          ? { kind: "times_per_week", count: i.scheduleCount ?? 7 }
          : { kind: "daily" },
      memberReason: i.memberReason,
    })),
  );

  const catalogue = useQuery<{ habits: CatalogueHabit[] }>({
    queryKey: ["/api/coach/catalogue"],
    queryFn: async () => {
      const res = await fetch("/api/coach/catalogue", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the catalogue.");
      return res.json();
    },
    staleTime: 10 * 60_000,
  });
  const habitById = useMemo(
    () => new Map((catalogue.data?.habits ?? []).map((h) => [h.id, h])),
    [catalogue.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/coach/plans/${plan.id}`, {
        title,
        focus: focus || null,
        memberVisibleNote: note || null,
        internalNote: internal || null,
        endsOn: endsOn || null,
      });
      await apiRequest("PUT", `/api/coach/plans/${plan.id}/items`, { items });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/clients", memberId, "plans"] });
      toast({ title: "Draft saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const review = useQuery<Review>({
    queryKey: ["/api/coach/plans", plan.id, "review"],
    queryFn: async () => {
      const res = await fetch(`/api/coach/plans/${plan.id}/review`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not review this plan.");
      return res.json();
    },
    enabled: reviewing,
  });

  const activate = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/coach/plans/${plan.id}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/clients", memberId, "plans"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/clients", memberId, "habits"] });
      toast({ title: "Plan activated" });
      onDone();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const discard = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/coach/plans/${plan.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/clients", memberId, "plans"] });
      onDone();
    },
  });

  /** Save first, then review — the review reads the server's copy, not this one. */
  async function openReview() {
    await save.mutateAsync();
    setReviewing(true);
    qc.invalidateQueries({ queryKey: ["/api/coach/plans", plan.id, "review"] });
  }

  if (reviewing) {
    const r = review.data;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Review plan
          </p>
          <button
            onClick={() => setReviewing(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back to editing
          </button>
        </div>

        {review.isLoading || !r ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <>
            {/*
              What will actually happen, grouped by what it does. A generic
              "Save" gives a coach no way to notice that a target they meant to
              nudge is about to end a practice.
            */}
            {(["add", "change", "end", "keep"] as const).map((action) => {
              const lines = r.changes.filter((c) => c.action === action);
              if (!lines.length) return null;
              return (
                <div key={action}>
                  <p className={cn("text-[10px] uppercase tracking-widest", ACTION_TONE[action])}>
                    {ACTION_LABEL[action]}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {lines.map((c) => (
                      <p key={c.routineHabitId} className="text-sm">
                        {c.title}
                        {c.action === "change" && c.from && c.to && (
                          <span className="text-muted-foreground"> · {c.from} → {c.to}</span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="rounded-lg border border-border/30 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Safety</p>
              {r.findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing flagged by the checks below.
                </p>
              ) : (
                r.findings.map((f, i) => (
                  <p
                    key={i}
                    className={cn(
                      "flex items-start gap-2 text-sm",
                      f.level === "block" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {f.level === "block" ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    )}
                    {f.message}
                  </p>
                ))
              )}
              {/*
                Which questions were actually asked, one line each, in the
                engine's own terms.

                The line that matters is the last one. `habit_relations` — the
                table that would say cold plunging and an extended fast are a bad
                pair — is empty, so pairwise checking currently has nothing to
                check. "No conflicts found" would be a true sentence read as a
                clean bill of health, which is worse than saying nothing: a coach
                would take it as evidence the pairing was considered.

                So it says what is actually true — nothing is declared about
                these practices — and it stays a small grey line rather than a
                reassuring green one, because an unpopulated check has not earned
                any prominence.
              */}
              <div className="pt-1.5 space-y-0.5 text-[10px] text-muted-foreground/60">
                <p>Weekly frequency limits · {r.checked.catalogueLimits ? "checked" : "none apply"}</p>
                <p>Stressor stacking · {r.checked.stressLoad ? "checked" : "not checked"}</p>
                <p>
                  Terrain fit ·{" "}
                  {r.checked.terrainFit ? "checked" : "not checked — no synced health data"}
                </p>
                <p>
                  Catalogue conflicts ·{" "}
                  {r.checked.declaredConflicts
                    ? "checked"
                    : "none declared for these practices"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                disabled={!r.canActivate || activate.isPending}
                onClick={() => activate.mutate()}
                data-testid="plan-activate"
              >
                {activate.isPending ? "Activating…" : "Activate"}
              </Button>
              {!r.canActivate && (
                <span className="text-xs text-muted-foreground">
                  Resolve what's flagged first.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const chosen = new Set(items.map((i) => i.routineHabitId));

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Plan focus"
          className="text-sm"
          data-testid="plan-title"
        />
        <Input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="One line on what this is for"
          className="text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Through
          <Input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="h-8 w-40 text-sm"
            data-testid="plan-ends-on"
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Practices</p>
        {items.map((item, i) => (
          <ItemRow
            key={item.routineHabitId}
            item={item}
            habit={habitById.get(item.routineHabitId)}
            onChange={(next) => setItems(items.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setItems(items.filter((_, j) => j !== i))}
          />
        ))}

        {picking ? (
          <HabitPicker
            chosen={chosen}
            onClose={() => setPicking(false)}
            onPick={(h) => {
              setItems([
                ...items,
                {
                  routineHabitId: h.id,
                  intent: "add",
                  target: h.defaultTarget,
                  schedule: { kind: "daily" },
                  memberReason: null,
                },
              ]);
              setPicking(false);
            }}
          />
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="flex items-center gap-1.5 text-xs text-[hsl(var(--gold))] hover:text-[hsl(var(--gold-light))] transition-colors tap-clean py-1"
            data-testid="plan-add-practice"
          >
            <Plus className="h-3.5 w-3.5" />
            Add practice
          </button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Guidance for {memberName.split(" ")[0] || memberName}
        </p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="They will read this."
          rows={3}
          className="text-sm resize-none"
          data-testid="plan-member-note"
        />
      </div>

      {/* The coach's own. Never reaches the member — a different field, not a
          different formatting of the same one. */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Your note · private
        </p>
        <Textarea
          value={internal}
          onChange={(e) => setInternal(e.target.value)}
          placeholder="Only you see this."
          rows={2}
          className="text-sm resize-none"
          data-testid="plan-internal-note"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save draft"}
        </Button>
        <Button
          size="sm"
          disabled={!title.trim() || items.length === 0 || save.isPending}
          onClick={openReview}
          data-testid="plan-review"
        >
          Review &amp; activate
        </Button>
        <button
          onClick={() => discard.mutate()}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
