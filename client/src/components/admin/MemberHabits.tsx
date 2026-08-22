/**
 * What a coach can do with one member's habits.
 *
 * ── Assign, or suggest ────────────────────────────────────────────────────
 *
 * Two buttons, and the difference is not cosmetic. Assigning writes a contract
 * immediately; suggesting writes a proposal the member has to answer. Both
 * exist because both are true of coaching — some things are the plan, and some
 * things are a question — and a product that only has the first one produces
 * members who quietly stop looking at a list somebody else keeps filling.
 *
 * ── What this never touches ───────────────────────────────────────────────
 *
 * The catalogue. Setting Nick's protein target to 165g writes a phase on
 * Nick's tracked habit; the shared default every other member draws from stays
 * exactly where it was. That is the whole reason the phase exists, and it is
 * enforced by the endpoint, not by this screen being careful.
 *
 * ── And what a coach cannot do ────────────────────────────────────────────
 *
 * Edit a phase that has already been in force. Raising a target closes the old
 * contract and opens a new one, so the fortnight Nick spent hitting 140g stays
 * a fortnight he hit his target. The database refuses the alternative.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, MessageSquarePlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS, type Schedule } from "@shared/models/habitSchedule";
import type { ResolvedHabit } from "@shared/models/habitResolve";
import type { CatalogueItem, HabitConfig } from "@/components/habits/useHabits";

type Day = { onDate: string; restore: ResolvedHabit[]; build: ResolvedHabit[] };

export function MemberHabits({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState<"yin" | "yang" | null>(null);

  const day = useQuery<Day>({
    queryKey: ["/api/coach/members", userId, "habits"],
    queryFn: async () =>
      (await apiRequest("GET", `/api/coach/members/${userId}/habits`)).json(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/coach/members", userId] });

  if (day.isLoading) return <p className="text-xs text-muted-foreground">Loading habits…</p>;
  if (day.isError)
    return <p className="text-xs text-muted-foreground">Couldn't load their habits.</p>;

  return (
    <div className="space-y-4">
      {(["yin", "yang"] as const).map((emphasis) => {
        const list = emphasis === "yin" ? day.data?.restore : day.data?.build;
        return (
          <div key={emphasis} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground">
                {emphasis === "yin" ? "Restore" : "Build"}
              </h4>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setPicking(emphasis)}
                data-testid={`coach-add-${emphasis}`}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>

            {(list ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing on this side yet.</p>
            ) : (
              (list ?? []).map((h) => <CoachRow key={h.trackedHabitId} habit={h} userId={userId} />)
            )}
          </div>
        );
      })}

      {picking && (
        <AssignDialog
          userId={userId}
          emphasis={picking}
          onClose={() => {
            setPicking(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CoachRow({ habit: h, userId }: { habit: ResolvedHabit; userId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const reconfigure = useMutation({
    mutationFn: async (config: HabitConfig) =>
      (
        await apiRequest(
          "PATCH",
          `/api/coach/members/${userId}/habits/${h.trackedHabitId}`,
          config,
        )
      ).json(),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["/api/coach/members", userId] });
    },
  });

  return (
    <div
      className="rounded-md border border-border/60 px-2.5 py-2"
      data-testid={`coach-habit-${h.trackedHabitId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm">{h.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {h.progressLabel} · {h.scheduleLabel}
            {h.phaseLength ? ` · day ${h.phaseDay} of ${h.phaseLength}` : ""}
            {h.phaseSource === "member" ? " · they chose it" : " · assigned"}
            {/* Where today's number came from, because a coach reading 8,742
                should know whether a watch or a person said so. */}
            {h.valueSource === "health" && " · from their phone"}
            {h.valueSource === "override" && " · they corrected it"}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 px-2 text-xs"
          onClick={() => setEditing((e) => !e)}
          data-testid={`coach-change-${h.trackedHabitId}`}
        >
          Change
        </Button>
      </div>

      {editing && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="mb-2 text-[11px] text-muted-foreground">
            This starts a new phase. Everything they've already logged keeps grading against
            what they were asked for at the time.
          </p>
          <ConfigForm
            initialTarget={h.target}
            initialSchedule={h.schedule}
            needsTarget={h.trackingType !== "boolean"}
            unit={h.unit}
            pending={reconfigure.isPending}
            submitLabel="Start the new phase"
            onSubmit={(c) => reconfigure.mutate(c)}
            withNotes
          />
        </div>
      )}
    </div>
  );
}

function AssignDialog({
  userId,
  emphasis,
  onClose,
}: {
  userId: string;
  emphasis: "yin" | "yang";
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<CatalogueItem | null>(null);

  const catalogue = useQuery<CatalogueItem[]>({
    queryKey: ["/api/habits/catalogue", emphasis, q],
    queryFn: async () => {
      const params = new URLSearchParams({ emphasis });
      if (q.trim()) params.set("q", q.trim());
      return (await apiRequest("GET", `/api/habits/catalogue?${params}`)).json();
    },
  });

  const assign = useMutation({
    mutationFn: async (v: { routineHabitId: string; config: HabitConfig }) =>
      (await apiRequest("POST", `/api/coach/members/${userId}/habits`, v)).json(),
    onSuccess: onClose,
  });

  const propose = useMutation({
    mutationFn: async (v: { routineHabitId: string; config: HabitConfig; reason?: string }) =>
      (await apiRequest("POST", `/api/coach/members/${userId}/proposals`, v)).json(),
    onSuccess: onClose,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {chosen ? chosen.title : `Add to their ${emphasis === "yin" ? "Restore" : "Build"}`}
          </DialogTitle>
        </DialogHeader>

        {chosen ? (
          <ConfigForm
            initialTarget={chosen.defaultTarget}
            initialSchedule={{ kind: "daily" }}
            needsTarget={chosen.trackingType !== "boolean"}
            unit={chosen.unit}
            pending={assign.isPending || propose.isPending}
            submitLabel="Assign it"
            secondaryLabel="Suggest it instead"
            withNotes
            onBack={() => setChosen(null)}
            onSubmit={(config) => assign.mutate({ routineHabitId: chosen.id, config })}
            onSecondary={(config, reason) =>
              propose.mutate({ routineHabitId: chosen.id, config, reason })
            }
          />
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the catalogue"
                className="pl-9"
                data-testid="coach-habit-search"
              />
            </div>
            <div className="space-y-1.5">
              {catalogue.data?.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nothing matching.
                </p>
              )}
              {catalogue.data?.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChosen(item)}
                  className="w-full rounded-md border border-border/60 px-2.5 py-2 text-left hover:border-[hsl(var(--gold))]/40"
                  data-testid={`coach-option-${item.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{item.title}</span>
                    {item.alreadyTracking === "active" && (
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Check className="h-3 w-3" />
                        already on it
                      </span>
                    )}
                  </div>
                  {item.shortDescription && (
                    <p className="text-[11px] text-muted-foreground">{item.shortDescription}</p>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The fields that become a phase.
 *
 * Shared between assigning and reconfiguring because they produce the same
 * thing — a contract — and two forms would be two chances to let one path set
 * a field the other forgets.
 */
function ConfigForm({
  initialTarget,
  initialSchedule,
  needsTarget,
  unit,
  pending,
  submitLabel,
  secondaryLabel,
  withNotes,
  onSubmit,
  onSecondary,
  onBack,
}: {
  initialTarget: number | null;
  initialSchedule: Schedule;
  needsTarget: boolean;
  unit: string | null;
  pending: boolean;
  submitLabel: string;
  secondaryLabel?: string;
  withNotes?: boolean;
  onSubmit: (c: HabitConfig) => void;
  onSecondary?: (c: HabitConfig, reason: string) => void;
  onBack?: () => void;
}) {
  const [target, setTarget] = useState(initialTarget != null ? String(initialTarget) : "");
  const [kind, setKind] = useState<Schedule["kind"]>(initialSchedule.kind);
  const [days, setDays] = useState<number[]>(
    initialSchedule.kind === "days_of_week" ? initialSchedule.days : [1, 3, 5],
  );
  const [count, setCount] = useState(
    initialSchedule.kind === "times_per_week" ? initialSchedule.count : 3,
  );
  const [fixed, setFixed] = useState(false);
  const [durationDays, setDurationDays] = useState(21);
  const [memberReason, setMemberReason] = useState("");
  const [coachNote, setCoachNote] = useState("");

  const schedule: Schedule =
    kind === "days_of_week"
      ? { kind, days }
      : kind === "times_per_week"
        ? { kind, count }
        : { kind };

  const config = (): HabitConfig => ({
    target: needsTarget ? Number(target) : null,
    schedule,
    phaseType: fixed ? "fixed" : "ongoing",
    durationDays: fixed ? durationDays : null,
    memberReason: memberReason.trim() || null,
    coachNote: coachNote.trim() || null,
  });

  const ok = (!needsTarget || Number(target) > 0) && (kind !== "days_of_week" || days.length > 0);

  return (
    <div className="space-y-3">
      {onBack && (
        <button type="button" onClick={onBack} className="text-xs text-muted-foreground">
          ← Back to the list
        </button>
      )}

      {needsTarget && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Their target</label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-8 w-28"
              data-testid="coach-config-target"
            />
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium">How often</label>
        <Select value={kind} onValueChange={(v) => setKind(v as Schedule["kind"])}>
          <SelectTrigger className="h-8" data-testid="coach-config-schedule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Every day</SelectItem>
            <SelectItem value="days_of_week">Certain days</SelectItem>
            <SelectItem value="times_per_week">A number of times a week</SelectItem>
            <SelectItem value="weekly">Once a week</SelectItem>
            <SelectItem value="as_needed">As needed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {kind === "days_of_week" && (
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() =>
                setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))
              }
              className={cn(
                "h-8 flex-1 rounded border text-[11px]",
                days.includes(i)
                  ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10"
                  : "border-border text-muted-foreground",
              )}
              data-testid={`coach-config-day-${i}`}
            >
              {label[0]}
            </button>
          ))}
        </div>
      )}

      {kind === "times_per_week" && (
        <Input
          type="number"
          min={1}
          max={7}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
          className="h-8 w-20"
        />
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium">For how long</label>
        <div className="flex items-center gap-2">
          <Select value={fixed ? "fixed" : "ongoing"} onValueChange={(v) => setFixed(v === "fixed")}>
            <SelectTrigger className="h-8 flex-1" data-testid="coach-config-length">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ongoing">Ongoing</SelectItem>
              <SelectItem value="fixed">A set number of days</SelectItem>
            </SelectContent>
          </Select>
          {fixed && (
            <Input
              type="number"
              min={1}
              max={365}
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))}
              className="h-8 w-20"
              data-testid="coach-config-duration"
            />
          )}
        </div>
      </div>

      {withNotes && (
        <>
          <div className="space-y-1">
            {/* They see this. It is the answer to "why am I doing this?", which
                is the question that decides whether somebody keeps doing it. */}
            <label className="text-xs font-medium">Why — they'll see this</label>
            <Textarea
              rows={2}
              value={memberReason}
              onChange={(e) => setMemberReason(e.target.value)}
              placeholder="Your sleep is down and this is the cheapest thing that moves it."
              className="text-base md:text-sm"
              data-testid="coach-config-reason"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Your own note — they won't</label>
            <Textarea
              rows={2}
              value={coachNote}
              onChange={(e) => setCoachNote(e.target.value)}
              className="text-base md:text-sm"
              data-testid="coach-config-note"
            />
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !ok}
          onClick={() => onSubmit(config())}
          className="flex-1"
          data-testid="coach-config-save"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        {secondaryLabel && onSecondary && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !ok}
            onClick={() => onSecondary(config(), memberReason.trim())}
            data-testid="coach-config-propose"
          >
            <MessageSquarePlus className="mr-1 h-3 w-3" />
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
