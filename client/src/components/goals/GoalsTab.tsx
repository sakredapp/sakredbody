/**
 * Your Goals — where a member says what they're building toward.
 *
 * ── The tone this screen has to hold ──────────────────────────────────────
 *
 * Every fitness app renders this page as a scoreboard: streaks, percentages,
 * a ring closing, CRUSH YOUR GOALS. That is the opposite of what the rest of
 * this product says. Sakred's argument is that a body is a terrain you learn to
 * read, not a number to beat, and a goal is a direction inside that — not a
 * quota, and never something the app can grade you against.
 *
 * So: no progress bars, no percentages, no streaks, no leaderboard. Three
 * figures per goal — target, best, latest — because those are the three
 * questions somebody actually has, and each of them is a fact rather than a
 * judgement. Best is separate from latest on purpose: a bad week is not
 * evidence that the good day was a fluke, and a screen showing only the most
 * recent number quietly says otherwise.
 *
 * ── Nothing here marks a goal achieved ────────────────────────────────────
 *
 * `reached` says a target has been met. Whether that means the goal is done is
 * the member's call, and the card offers it as a choice rather than making it:
 * a single may have been spotted, may have been a fluke, and may be something
 * somebody wants to hold for a month before believing.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Target } from "lucide-react";
import { Panel } from "@/components/portal/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { TargetFields } from "./TargetFields";
import { GoalDetail } from "./GoalDetail";
import { draftToTarget, emptyDraft, type TargetDraft } from "@/lib/goals";
import {
  MEASUREMENTS,
  MEASUREMENT_LABELS,
  formatMeasurement,
  type GoalTarget,
  type Measurement,
} from "@shared/models/goals";

export type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  emphasis: string;
  measurement: Measurement;
  target: GoalTarget;
  exerciseId: string | null;
  activityType: string | null;
  targetDate: string | null;
  createdBy: string;
  latest: { observedAt: string; value: GoalTarget; source: string } | null;
  best: { observedAt: string; value: GoalTarget; source: string } | null;
  observations: number;
  reached: boolean;
};

const DAY = { month: "short", day: "numeric" } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, DAY);

/**
 * Target, best, latest — in that order, and only the ones that exist.
 *
 * A goal with no observations shows its target and nothing else. Rendering
 * "Best —" next to it would fill the card with the absence of information,
 * which reads as the app having lost something.
 */
function Figures({ goal, unit }: { goal: GoalRow; unit: "kg" | "lb" }) {
  const rows: [string, string, string?][] = [
    ["Target", formatMeasurement(goal.measurement, goal.target, unit)],
  ];
  if (goal.best) {
    rows.push(["Best", formatMeasurement(goal.measurement, goal.best.value, unit), when(goal.best.observedAt)]);
  }
  if (goal.latest && goal.latest.observedAt !== goal.best?.observedAt) {
    rows.push([
      "Latest",
      formatMeasurement(goal.measurement, goal.latest.value, unit),
      when(goal.latest.observedAt),
    ]);
  }
  return (
    <dl className="mt-3 space-y-1">
      {rows.map(([label, value, date]) => (
        <div key={label} className="flex items-baseline gap-2 text-sm">
          <dt className="w-14 shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground/70">
            {label}
          </dt>
          <dd className="font-serif text-foreground tabular-nums">{value}</dd>
          {date && <span className="text-[11px] text-muted-foreground/60">· {date}</span>}
        </div>
      ))}
    </dl>
  );
}

function GoalCard({
  goal,
  unit,
  onOpen,
}: {
  goal: GoalRow;
  unit: "kg" | "lb";
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`goal-${goal.id}`}
      className="tap-clean w-full rounded-lg border border-[hsl(var(--gold))]/10 bg-background/40 px-4 py-3.5 text-left transition-colors hover:border-[hsl(var(--gold))]/25"
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-serif text-base text-foreground">{goal.title}</h4>
        {goal.reached && goal.status === "active" && (
          /*
            "Target reached", not "Achieved" and not a tick. The distinction is
            the whole of the rule: the app has observed a number, and only the
            member can say the goal is done.
          */
          <span className="shrink-0 rounded-full border border-[hsl(var(--gold))]/30 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[hsl(var(--gold))]">
            Target reached
          </span>
        )}
      </div>
      <Figures goal={goal} unit={unit} />
    </button>
  );
}

function AddGoal({
  unit,
  onClose,
}: {
  unit: "kg" | "lb";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [measurement, setMeasurement] = useState<Measurement>("time_for_distance");
  const [draft, setDraft] = useState<TargetDraft>(emptyDraft);

  const target = draftToTarget(measurement, draft, unit);

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("What would you call it?");
      if (!target) throw new Error("That target isn't complete yet.");
      return apiRequest("POST", "/api/goals", { title: title.trim(), measurement, target });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/goals"] });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5" data-testid="goal-form">
      <label className="block">
        <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground/70">
          What are you working toward
        </span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Six-minute mile"
          className="h-10 border-[hsl(var(--gold))]/15 bg-background/60"
          data-testid="goal-title"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Measured by
        </span>
        <div className="flex flex-wrap gap-1.5">
          {MEASUREMENTS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeasurement(m)}
              data-testid={`goal-measurement-${m}`}
              className={cn(
                "tap-clean rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                m === measurement
                  ? "border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))]"
                  : "border-[hsl(var(--gold))]/12 text-muted-foreground hover:text-foreground",
              )}
            >
              {MEASUREMENT_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <TargetFields
        measurement={measurement}
        draft={draft}
        onChange={setDraft}
        weightUnit={unit}
      />

      <Button
        onClick={() => create.mutate()}
        disabled={create.isPending || !title.trim() || !target}
        className="w-full"
        data-testid="goal-save"
      >
        {create.isPending ? "Saving…" : "Add goal"}
      </Button>
    </div>
  );
}

export function GoalsTab({ weightUnit }: { weightUnit?: "kg" | "lb" | null }) {
  const unit = weightUnit === "kg" ? "kg" : "lb";
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading } = useQuery<GoalRow[]>({
    queryKey: ["/api/goals"],
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const all = data ?? [];
    return {
      active: all.filter((g) => g.status === "active"),
      paused: all.filter((g) => g.status === "paused"),
      achieved: all.filter((g) => g.status === "achieved"),
      archived: all.filter((g) => g.status === "archived"),
    };
  }, [data]);

  const nothing = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-5" data-tour-id="goals">
      <header className="px-1">
        <h2 className="font-serif text-2xl text-foreground">Your Goals</h2>
        <p className="mt-1 text-sm text-muted-foreground">What are you building toward?</p>
      </header>

      {isLoading && <p className="px-1 text-sm text-muted-foreground">Reading…</p>}

      {nothing && (
        /*
          The empty state carries the examples rather than a call to action.

          "Set your first goal!" tells somebody to do a thing without telling
          them what a good one looks like, and the answer people reach for
          unprompted — "get fitter" — is the one this schema cannot measure and
          the one nothing can ever show progress against.
        */
        <Panel data-testid="goals-empty">
          <div className="py-2 text-center">
            <Target className="mx-auto mb-3 h-5 w-5 text-[hsl(var(--gold))]/50" />
            <p className="text-sm text-muted-foreground">
              A clear target gives Sakred more context for what you're building capacity for.
            </p>
            <p className="mt-3 text-sm text-muted-foreground/70">
              Run a six-minute mile · 15 pull-ups · 60 minutes of yoga
            </p>
          </div>
        </Panel>
      )}

      {groups.active.length > 0 && (
        <Panel title="Active" data-testid="goals-active">
          <div className="space-y-2">
            {groups.active.map((g) => (
              <GoalCard key={g.id} goal={g} unit={unit} onOpen={() => setOpen(g.id)} />
            ))}
          </div>
        </Panel>
      )}

      {groups.paused.length > 0 && (
        <Panel title="Set down for now" data-testid="goals-paused">
          <div className="space-y-2">
            {groups.paused.map((g) => (
              <GoalCard key={g.id} goal={g} unit={unit} onOpen={() => setOpen(g.id)} />
            ))}
          </div>
        </Panel>
      )}

      {groups.achieved.length > 0 && (
        <Panel title="Reached" data-testid="goals-achieved">
          <div className="space-y-2">
            {groups.achieved.map((g) => (
              <GoalCard key={g.id} goal={g} unit={unit} onOpen={() => setOpen(g.id)} />
            ))}
          </div>
        </Panel>
      )}

      {groups.archived.length > 0 && (
        <Panel title="Put away" data-testid="goals-archived">
          <div className="space-y-2">
            {groups.archived.map((g) => (
              <GoalCard key={g.id} goal={g} unit={unit} onOpen={() => setOpen(g.id)} />
            ))}
          </div>
        </Panel>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        data-testid="goal-add"
        className="tap-clean flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[hsl(var(--gold))]/20 py-3 text-sm text-[hsl(var(--gold))] transition-colors hover:border-[hsl(var(--gold))]/40"
      >
        <Plus className="h-4 w-4" />
        Add goal
      </button>

      <Sheet open={adding} onOpenChange={(v) => !v && setAdding(false)}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto pb-safe">
          <SheetHeader>
            <SheetTitle className="font-serif text-lg">A new goal</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <AddGoal unit={unit} onClose={() => setAdding(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <GoalDetail goalId={open} unit={unit} onClose={() => setOpen(null)} />
    </div>
  );
}
