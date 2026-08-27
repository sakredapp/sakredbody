/**
 * One goal, and everything that has been observed about it.
 *
 * Three questions, in the order a person asks them: where am I trying to go,
 * where am I now, and how has this changed. The history is a list of dates and
 * values rather than a chart — with four entries a chart is decoration, and
 * with forty the shape of somebody's mile times is not a thing to be read off
 * a sparkline in a sheet.
 *
 * ── Where a target came from ──────────────────────────────────────────────
 *
 * The revisions are shown when there is more than one, because they are what
 * makes the older entries readable. A 6:42 sitting under a six-minute target
 * looks like a failure; a 6:42 sitting under "Target was 7:00 until 12 July"
 * is the run that earned the change.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { TargetFields } from "./TargetFields";
import { draftToTarget, emptyDraft, targetToDraft, type TargetDraft } from "@/lib/goals";
import { formatMeasurement, type GoalTarget, type Measurement } from "@shared/models/goals";

type Detail = {
  goal: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    measurement: Measurement;
    target: GoalTarget;
    targetDate: string | null;
  };
  progress: {
    id: string;
    observedAt: string;
    measurement: Measurement;
    value: GoalTarget;
    source: string;
    note: string | null;
  }[];
  revisions: { id: string; createdAt: string; target: GoalTarget; measurement: Measurement }[];
  latest: { observedAt: string; value: GoalTarget } | null;
  best: { observedAt: string; value: GoalTarget } | null;
  observations: number;
  incomparable: number;
  reached: boolean;
};

const DAY = { month: "short", day: "numeric" } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, DAY);

/** Where a number came from, said plainly. Absent for anything typed. */
const SOURCE_LABEL: Record<string, string> = {
  workout: "from your workout",
  health: "from your phone",
  coach: "from your coach",
};

export function GoalDetail({
  goalId,
  unit,
  onClose,
}: {
  goalId: string | null;
  unit: "kg" | "lb";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<"read" | "progress" | "retarget">("read");
  const [draft, setDraft] = useState<TargetDraft>(emptyDraft);

  const { data } = useQuery<Detail>({
    queryKey: [`/api/goals/${goalId}`],
    enabled: !!goalId,
  });

  const goal = data?.goal;
  const value = useMemo(
    () => (goal ? draftToTarget(goal.measurement, draft, unit) : null),
    [goal, draft, unit],
  );

  const done = () => {
    qc.invalidateQueries({ queryKey: ["/api/goals"] });
    qc.invalidateQueries({ queryKey: [`/api/goals/${goalId}`] });
    setMode("read");
    setDraft(emptyDraft);
  };

  const record = useMutation({
    mutationFn: async () => {
      if (!value) throw new Error("That isn't complete yet.");
      return apiRequest("POST", `/api/goals/${goalId}/progress`, { value });
    },
    onSuccess: done,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const retarget = useMutation({
    mutationFn: async () => {
      if (!value || !goal) throw new Error("That isn't complete yet.");
      return apiRequest("PUT", `/api/goals/${goalId}/target`, {
        measurement: goal.measurement,
        target: value,
      });
    },
    onSuccess: done,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => apiRequest("PATCH", `/api/goals/${goalId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/goals"] });
      qc.invalidateQueries({ queryKey: [`/api/goals/${goalId}`] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const close = () => {
    setMode("read");
    setDraft(emptyDraft);
    onClose();
  };

  return (
    <Sheet open={!!goalId} onOpenChange={(v) => !v && close()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto pb-safe">
        {goal && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="font-serif text-lg">{goal.title}</SheetTitle>
            </SheetHeader>

            {goal.description && (
              <p className="mt-2 text-sm text-muted-foreground">{goal.description}</p>
            )}

            <dl className="mt-4 space-y-1.5" data-testid="goal-detail-figures">
              <Figure label="Target" value={formatMeasurement(goal.measurement, goal.target, unit)} />
              {data?.best && (
                <Figure
                  label="Best"
                  value={formatMeasurement(goal.measurement, data.best.value, unit)}
                  date={when(data.best.observedAt)}
                />
              )}
              {data?.latest && (
                <Figure
                  label="Latest"
                  value={formatMeasurement(goal.measurement, data.latest.value, unit)}
                  date={when(data.latest.observedAt)}
                />
              )}
            </dl>

            {mode === "read" && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setMode("progress")} data-testid="goal-update-progress">
                  Update progress
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft(targetToDraft(goal.measurement, goal.target, unit));
                    setMode("retarget");
                  }}
                  data-testid="goal-new-target"
                >
                  New target
                </Button>
                {goal.status === "active" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus.mutate("paused")}
                    data-testid="goal-pause"
                  >
                    Set down for now
                  </Button>
                )}
                {goal.status === "paused" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus.mutate("active")}
                    data-testid="goal-resume"
                  >
                    Pick it back up
                  </Button>
                )}
                {goal.status !== "achieved" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus.mutate("achieved")}
                    data-testid="goal-achieve"
                  >
                    Mark achieved
                  </Button>
                )}
                {goal.status !== "archived" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus.mutate("archived")}
                    data-testid="goal-archive"
                  >
                    Put it away
                  </Button>
                )}
              </div>
            )}

            {mode !== "read" && (
              <div className="mt-5 space-y-4">
                <TargetFields
                  measurement={goal.measurement}
                  draft={draft}
                  onChange={setDraft}
                  weightUnit={unit}
                  noun={mode === "progress" ? "Your" : "Target"}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => (mode === "progress" ? record.mutate() : retarget.mutate())}
                    disabled={!value || record.isPending || retarget.isPending}
                    className="flex-1"
                    data-testid="goal-detail-save"
                  >
                    {mode === "progress" ? "Record it" : "Move the target"}
                  </Button>
                  <Button variant="ghost" onClick={() => setMode("read")}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {(data?.progress.length ?? 0) > 0 && (
              <section className="mt-6">
                <h4 className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  Progress
                </h4>
                <ul className="space-y-1.5" data-testid="goal-history">
                  {data!.progress.map((p) => (
                    <li key={p.id} className="flex items-baseline gap-3 text-sm">
                      <span className="w-14 shrink-0 text-[11px] text-muted-foreground/60">
                        {when(p.observedAt)}
                      </span>
                      <span className="font-serif tabular-nums text-foreground">
                        {formatMeasurement(p.measurement, p.value, unit)}
                      </span>
                      {SOURCE_LABEL[p.source] && (
                        <span className="text-[11px] text-muted-foreground/50">
                          {SOURCE_LABEL[p.source]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(data?.revisions.length ?? 0) > 1 && (
              <section className="mt-5">
                <h4 className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  The target has moved
                </h4>
                <ul className="space-y-1" data-testid="goal-revisions">
                  {data!.revisions.map((r) => (
                    <li key={r.id} className="flex items-baseline gap-3 text-[13px]">
                      <span className="w-14 shrink-0 text-[11px] text-muted-foreground/60">
                        {when(r.createdAt)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatMeasurement(r.measurement, r.target, unit)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Figure({ label, value, date }: { label: string; value: string; date?: string }) {
  return (
    <div className={cn("flex items-baseline gap-2 text-sm")}>
      <dt className="w-14 shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground/70">
        {label}
      </dt>
      <dd className="font-serif tabular-nums text-foreground">{value}</dd>
      {date && <span className="text-[11px] text-muted-foreground/60">· {date}</span>}
    </div>
  );
}
