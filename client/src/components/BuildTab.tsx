/**
 * Build — today's lifts, and what you actually hit.
 *
 * The member half of the training module. A coach prescribed this session
 * against a protocol; this shows it and takes the numbers.
 *
 * ── The prescription is the screen ────────────────────────────────────────
 *
 * Not a blank logger. Every lift arrives with its target sets and reps, and —
 * where the coach wrote a percentage — a weight already worked out from this
 * member's own logged history. There is nothing to search for and nothing to
 * compose, which is the whole reason prescribed logging survives contact with
 * a real gym where freeform logging does not.
 *
 * ── PR is computed, not awarded ───────────────────────────────────────────
 *
 * A set is a personal record when its estimated one-rep max beats the best
 * this member has ever recorded for that lift. That reference comes down with
 * the prescription, so the comparison happens the instant the set is entered
 * rather than after a round trip — and it is arithmetic on their own numbers,
 * not a badge the app decided to hand out.
 *
 * The first ever set of a lift is deliberately *not* a PR. Technically it beats
 * a non-existent record; calling it one would make the badge meaningless on
 * the day somebody starts.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { SectionHeading, Panel, StatTile } from "@/components/portal/Panel";
import { Dumbbell, Check, Plus, Trophy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { estimateOneRepMax, lbToKg } from "@shared/models/training";

interface PrescribedLift {
  id: string;
  exerciseId: string;
  name: string;
  equipment: string;
  trackingType: string;
  targetSets: number;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  targetPercent1rm: number | null;
  note: string | null;
  suggestedWeight: number | null;
  referenceE1rm: number | null;
}

interface TodayBuild {
  date: string;
  unit: "kg" | "lb";
  sessions: Array<{
    habitId: string;
    title: string;
    completed: boolean;
    exercises: PrescribedLift[];
  }>;
}

/** One row the member is filling in. */
interface Entry {
  weight: string;
  reps: string;
  logged: boolean;
  isPr: boolean;
}

function targetLabel(l: PrescribedLift): string {
  if (l.trackingType === "duration") return `${l.targetSets} × hold`;
  if (l.trackingType === "distance") return `${l.targetSets} × distance`;
  if (l.targetRepsLow && l.targetRepsHigh) {
    return l.targetRepsLow === l.targetRepsHigh
      ? `${l.targetSets} × ${l.targetRepsLow}`
      : `${l.targetSets} × ${l.targetRepsLow}–${l.targetRepsHigh}`;
  }
  return `${l.targetSets} sets`;
}

export function BuildTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry[]>>({});

  const today = useQuery<TodayBuild>({
    queryKey: ["/api/training/today"],
    queryFn: async () => {
      const r = await fetch("/api/training/today", { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load today's session");
      return r.json();
    },
  });

  const start = useMutation({
    // `apiRequest` resolves to the Response, not the body — it throws on a
    // non-2xx and hands back the raw response, so the JSON has to be read here.
    mutationFn: async (habitId: string) => {
      const res = await apiRequest("POST", "/api/training/sessions", { habitId });
      return (await res.json()) as { id: string };
    },
    onSuccess: (data) => setSessionId(data.id),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const logSet = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiRequest("POST", `/api/training/sessions/${sessionId}/sets`, body),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const finish = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/training/sessions/${sessionId}/finish`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training/today"] });
      setSessionId(null);
      setEntries({});
      toast({ title: "Session logged." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (today.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const data = today.data;
  const unit = data?.unit ?? "lb";
  const sessions = data?.sessions ?? [];

  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeading title="Build" subtitle="Strength, movement and resilience." />
        <Panel>
          <div className="py-12 text-center space-y-2">
            <Dumbbell className="h-6 w-6 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Nothing prescribed today. Build sessions arrive with your protocol —
              when one is running and today is a lifting day, the lifts show up here
              with their targets already worked out.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const rowsFor = (lift: PrescribedLift): Entry[] =>
    entries[lift.id] ??
    Array.from({ length: lift.targetSets }, () => ({
      // Prefilled with the prescribed weight so the common case is one tap.
      weight: lift.suggestedWeight != null ? String(lift.suggestedWeight) : "",
      reps: lift.targetRepsHigh != null ? String(lift.targetRepsHigh) : "",
      logged: false,
      isPr: false,
    }));

  const setRow = (liftId: string, i: number, patch: Partial<Entry>, lift: PrescribedLift) => {
    const rows = [...rowsFor(lift)];
    rows[i] = { ...rows[i], ...patch };
    setEntries({ ...entries, [liftId]: rows });
  };

  /**
   * Does this set beat everything before it?
   *
   * The reference arrives in the member's own unit, so the comparison is done
   * in that unit — converting one side and not the other is how a 102 kg lift
   * "beats" a 225 lb one.
   */
  const isPersonalRecord = (lift: PrescribedLift, weight: number, reps: number): boolean => {
    if (lift.referenceE1rm == null) return false; // first time, not a record
    const kg = unit === "kg" ? weight : lbToKg(weight);
    const e = estimateOneRepMax(kg, reps);
    if (e == null) return false;
    const refKg = unit === "kg" ? lift.referenceE1rm : lbToKg(lift.referenceE1rm);
    return e > refKg;
  };

  return (
    <div className="space-y-6">
      <SectionHeading title="Build" subtitle="Strength, movement and resilience." />

      {sessions.map((s) => {
        const active = sessionId !== null;
        const allRows = s.exercises.flatMap((l) => rowsFor(l));
        const done = allRows.filter((r) => r.logged).length;
        const prs = allRows.filter((r) => r.isPr).length;
        const volume = s.exercises.reduce(
          (sum, l) =>
            sum +
            rowsFor(l)
              .filter((r) => r.logged)
              .reduce((v, r) => v + (Number(r.weight) || 0) * (Number(r.reps) || 0), 0),
          0,
        );

        return (
          <div key={s.habitId} className="space-y-4">
            <Panel title={s.title}>
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Sets logged" value={`${done}/${allRows.length}`} />
                <StatTile label={`Volume ${unit}`} value={volume.toLocaleString()} />
                <StatTile
                  label="Records"
                  value={prs}
                  sub={prs > 0 ? "beat your best" : undefined}
                  tone={prs > 0 ? "up" : "neutral"}
                />
              </div>

              {!active && (
                <Button
                  className="w-full mt-4 bg-gold border-gold-border text-white"
                  onClick={() => start.mutate(s.habitId)}
                  disabled={start.isPending}
                  data-testid="button-start-session"
                >
                  {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start this session"}
                </Button>
              )}
            </Panel>

            {s.exercises.map((lift) => {
              const rows = rowsFor(lift);
              return (
                <Panel key={lift.id} data-testid={`lift-${lift.exerciseId}`}>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <h3 className="font-display text-lg leading-tight">{lift.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {targetLabel(lift)}
                          {lift.targetPercent1rm ? ` · ${lift.targetPercent1rm}% of your max` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {lift.equipment.replace("_", " ")}
                      </Badge>
                    </div>

                    {lift.note && (
                      <p className="text-xs text-[hsl(var(--gold))]">{lift.note}</p>
                    )}

                    {/* Said plainly rather than shown as a zero: a member's
                        first time on a lift has nothing to compute from. */}
                    {lift.targetPercent1rm != null && lift.suggestedWeight == null && (
                      <p className="text-xs text-muted-foreground">
                        First time on this one — pick a weight you can hold form on, and
                        the app will have a number for you next time.
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-2 px-1">
                        {["Set", unit.toUpperCase(), "Reps", ""].map((h, i) => (
                          <span
                            key={i}
                            className="text-[10px] uppercase tracking-widest text-muted-foreground/60"
                          >
                            {h}
                          </span>
                        ))}
                      </div>

                      {rows.map((row, i) => (
                        <div
                          key={i}
                          className={cn(
                            "grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-2 items-center rounded-lg px-1 py-1",
                            row.logged && "bg-[hsl(var(--gold))]/5",
                          )}
                        >
                          <span className="text-sm text-muted-foreground text-center">{i + 1}</span>
                          <Input
                            inputMode="decimal"
                            value={row.weight}
                            disabled={row.logged}
                            onChange={(e) => setRow(lift.id, i, { weight: e.target.value }, lift)}
                            className="h-10 text-center"
                            data-testid={`input-weight-${lift.exerciseId}-${i}`}
                          />
                          <Input
                            inputMode="numeric"
                            value={row.reps}
                            disabled={row.logged}
                            onChange={(e) => setRow(lift.id, i, { reps: e.target.value }, lift)}
                            className="h-10 text-center"
                            data-testid={`input-reps-${lift.exerciseId}-${i}`}
                          />

                          {row.logged ? (
                            row.isPr ? (
                              <span
                                className="h-8 w-8 rounded-full bg-[hsl(var(--gold))] grid place-items-center"
                                title="Personal record"
                              >
                                <Trophy className="h-4 w-4 text-[hsl(var(--ink))]" />
                              </span>
                            ) : (
                              <span className="h-8 w-8 rounded-full bg-[hsl(var(--gold))]/20 grid place-items-center">
                                <Check className="h-4 w-4 text-[hsl(var(--gold))]" strokeWidth={3} />
                              </span>
                            )
                          ) : (
                            <button
                              disabled={!active || !row.weight || !row.reps || logSet.isPending}
                              onClick={() => {
                                const w = Number(row.weight);
                                const r = Number(row.reps);
                                const pr = isPersonalRecord(lift, w, r);
                                logSet.mutate(
                                  {
                                    exerciseId: lift.exerciseId,
                                    habitExerciseId: lift.id,
                                    reps: r,
                                    weight: w,
                                    unit,
                                  },
                                  {
                                    onSuccess: () => {
                                      setRow(lift.id, i, { logged: true, isPr: pr }, lift);
                                      if (pr) {
                                        toast({
                                          title: "That's a record",
                                          description: `${lift.name} — better than anything you've logged.`,
                                        });
                                      }
                                    },
                                  },
                                );
                              }}
                              className={cn(
                                "h-8 w-8 rounded-full border grid place-items-center transition-colors tap-clean",
                                active && row.weight && row.reps
                                  ? "border-[hsl(var(--gold))]/50 hover:bg-[hsl(var(--gold))]/15"
                                  : "border-border/50 opacity-40",
                              )}
                              aria-label={`Log set ${i + 1}`}
                              data-testid={`button-log-${lift.exerciseId}-${i}`}
                            >
                              <Check className="h-4 w-4 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      ))}

                      <button
                        onClick={() =>
                          setEntries({
                            ...entries,
                            [lift.id]: [
                              ...rows,
                              { weight: rows[rows.length - 1]?.weight ?? "", reps: "", logged: false, isPr: false },
                            ],
                          })
                        }
                        className="w-full text-xs text-[hsl(var(--gold))] py-2 inline-flex items-center justify-center gap-1 tap-clean"
                        data-testid={`button-add-set-${lift.exerciseId}`}
                      >
                        <Plus className="h-3 w-3" />
                        Add a set
                      </button>
                    </div>
                  </div>
                </Panel>
              );
            })}

            {active && (
              <Button
                className="w-full bg-gold border-gold-border text-white"
                onClick={() => finish.mutate()}
                disabled={finish.isPending}
                data-testid="button-finish-session"
              >
                {finish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish session"}
              </Button>
            )}
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground text-center">
        Weights are in {unit}.{" "}
        <InfoTip label="About units" title="Change it anywhere">
          Switching between kilos and pounds changes only what you see — everything is
          stored the same way underneath, so nothing is converted or lost.
        </InfoTip>
      </p>
    </div>
  );
}
