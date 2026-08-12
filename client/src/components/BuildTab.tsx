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

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { SectionHeading, Panel, StatTile } from "@/components/portal/Panel";
import { HabitPanel } from "@/components/habits/HabitPanel";
import { TodayRead } from "@/components/TodayRead";
import { MemberBuild } from "@/components/build/MemberBuild";
import { FreeSession } from "@/components/build/FreeSession";
import { Dumbbell, Check, Plus, Trophy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { estimateOneRepMax, lbToKg, isPracticeCategory } from "@shared/models/training";

interface PrescribedLift {
  id: string;
  exerciseId: string;
  name: string;
  equipment: string;
  trackingType: string;
  category: string;
  takesLoad: boolean;
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
  /** Seconds for a hold, minutes for a practice. See `amountLabel`. */
  amount: string;
  logged: boolean;
  isPr: boolean;
}

/**
 * ── What a prescribed row actually asks for ───────────────────────────────
 *
 * This screen was built when Build meant heavy barbell work, so every row was
 * two boxes — weight and reps — and the log button stayed disabled until both
 * were filled. That quietly made a whole half of what Sakred prescribes
 * impossible to record: a coach could assign a couch stretch, a fascia flow, a
 * Zone 2 ride or a Reformer sequence, and the member would be shown "LB" and
 * "Reps" and could not log any of it.
 *
 * So the row is derived from the movement rather than assumed. The rules are
 * the same three the rest of Build uses, and they live here in one place:
 * `takesLoad` decides the weight box, `trackingType` decides the second box,
 * and a practice counts in minutes rather than seconds because nobody logs
 * "2700" for a forty-five minute class.
 */
function amountLabel(l: PrescribedLift): string | null {
  if (l.trackingType === "duration") return isPracticeCategory(l.category) ? "Mins" : "Secs";
  if (l.trackingType === "distance") return "Metres";
  return "Reps";
}

/** What the member typed, in the unit the API wants. */
function amountBody(l: PrescribedLift, amount: string): Record<string, number> {
  const n = Number(amount);
  if (l.trackingType === "duration") {
    return { durationSeconds: isPracticeCategory(l.category) ? Math.round(n * 60) : Math.round(n) };
  }
  if (l.trackingType === "distance") return { distanceM: n };
  return { reps: Math.round(n) };
}

function targetLabel(l: PrescribedLift): string {
  if (l.trackingType === "duration") {
    return isPracticeCategory(l.category) ? "Log how long" : `${l.targetSets} × hold`;
  }
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
  /** An ad-hoc or template-started session, which has no prescription behind it. */
  const [freeSession, setFreeSession] = useState<{ id: string; title: string } | null>(null);

  /**
   * What is actually still running, according to the server.
   *
   * This used to be `freeSession` alone, and that was the bug: navigating to
   * Home unmounted this component, React threw the id away, and coming back
   * showed an empty Build screen. Nothing had been lost — the session row and
   * every set were exactly where they were left — but from the member's side
   * the workout had simply vanished, which is worse than an error.
   *
   * A session ends when somebody presses Finish. Nothing else ends it, and
   * certainly not looking at your step count mid-workout.
   */
  const openSession = useQuery<{
    session: { id: string; title: string | null; startedAt: string; sets: number } | null;
  }>({
    queryKey: ["/api/training/sessions/open"],
    queryFn: async () => {
      const r = await fetch("/api/training/sessions/open", { credentials: "include" });
      if (!r.ok) throw new Error("no");
      return r.json();
    },
    // Cheap, and the answer changes when the member acts on another device.
    staleTime: 15_000,
  });

  useEffect(() => {
    const open = openSession.data?.session;
    if (open && !freeSession) {
      setFreeSession({ id: open.id, title: open.title ?? "Your session" });
    }
  }, [openSession.data, freeSession]);

  /** Finishing is the only thing that clears it, on the server and here. */
  const clearSession = () => {
    setFreeSession(null);
    qc.invalidateQueries({ queryKey: ["/api/training/sessions/open"] });
  };

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
    // Shared, and not optionally.
    //
    // This sent `{}`, so `shareWithCoach` was undefined and a prescribed
    // session never reached the coach — while a member's own ad-hoc session
    // and logged practices share by default. The coach was seeing everything
    // except the work they themselves wrote, which is exactly backwards: the
    // whole point of prescribing a session is finding out what happened in it.
    mutationFn: async () =>
      apiRequest("POST", `/api/training/sessions/${sessionId}/finish`, { shareWithCoach: true }),
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

      {/* The lifestyle half of Build — protein, steps, sunlight. Separate from
          the workout builder on purpose: a session is an event with sets and
          weights, and "hit 165g" is a standing target. Collapsing them would
          make one of the two lie about the other. */}
      <HabitPanel
        emphasis="yang"
        title="What asks for capacity"
        emptyLine="Nothing here yet. Protein, steps and daylight are where most people start."
      />
        {/* ── No panel announcing an absence ──
            This screen used to open with a bordered box, a greyed-out
            dumbbell and "Nothing prescribed today" — the first thing a member
            saw on most days, since most days have no prescription. It reads as
            an error, and it is not one: it is a Tuesday.

            The fix is not softer wording. It is that the member's own training
            IS the screen, and a prescription is the addition when there is
            one. So the panel is gone, and the single line about where
            prescribed sessions appear sits underneath the things they can
            actually do, in the size of a footnote, because that is its
            importance on a day it does not apply. */}
        {freeSession ? (
          <FreeSession
            sessionId={freeSession.id}
            title={freeSession.title}
            unit={unit}
            onDone={clearSession}
          />
        ) : (
          <>
            <MemberBuild onStarted={(id, t) => {
              setFreeSession({ id, title: t });
              qc.invalidateQueries({ queryKey: ["/api/training/sessions/open"] });
            }} />

            {/*
              An idea, if they want one — below the thing they came here to do.

              This spent one build at the top of Home, where it stopped being
              an optional prompt and became the app's opinion of your day. It
              belongs next to the movement it is suggesting, on a screen
              somebody opened having already decided to train.
            */}
            <TodayRead side="build" onOpenCategory={() => undefined} />
            <p className="text-[11px] text-muted-foreground text-center max-w-sm mx-auto">
              When your coach plans a session for today, it appears at the top of this screen with
              its targets already worked out.
            </p>
          </>
        )}
      </div>
    );
  }

  const rowsFor = (lift: PrescribedLift): Entry[] =>
    entries[lift.id] ??
    // A practice is one row, not four. "3 × 45 minutes of Reformer" is not a
    // prescription anybody has ever written.
    Array.from({ length: isPracticeCategory(lift.category) ? 1 : lift.targetSets }, () => ({
      // Prefilled with the prescribed weight so the common case is one tap.
      weight: lift.suggestedWeight != null ? String(lift.suggestedWeight) : "",
      reps: lift.targetRepsHigh != null ? String(lift.targetRepsHigh) : "",
      amount:
        lift.trackingType === "reps" && lift.targetRepsHigh != null
          ? String(lift.targetRepsHigh)
          : "",
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

      {/* The lifestyle half of Build — protein, steps, sunlight. Separate from
          the workout builder on purpose: a session is an event with sets and
          weights, and "hit 165g" is a standing target. Collapsing them would
          make one of the two lie about the other. */}
      <HabitPanel
        emphasis="yang"
        title="What asks for capacity"
        emptyLine="Nothing here yet. Protein, steps and daylight are where most people start."
      />

      {sessions.map((s) => {
        const active = sessionId !== null;
        const allRows = s.exercises.flatMap((l) => rowsFor(l));
        const done = allRows.filter((r) => r.logged).length;
        const prs = allRows.filter((r) => r.isPr).length;
        // Load × reps, and only where both exist. A held stretch and a bike
        // ride contribute nothing here — not because they don't count, but
        // because tonnage is not what they are measured in, and folding them
        // in would make the number mean nothing at all.
        const volume = s.exercises.reduce(
          (sum, l) =>
            l.takesLoad && l.trackingType === "reps"
              ? sum +
                rowsFor(l)
                  .filter((r) => r.logged)
                  .reduce((v, r) => v + (Number(r.weight) || 0) * (Number(r.amount) || 0), 0)
              : sum,
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
                      <div
                        className={cn(
                          "grid gap-2 px-1",
                          lift.takesLoad
                            ? "grid-cols-[2.5rem_1fr_1fr_2.5rem]"
                            : "grid-cols-[2.5rem_1fr_2.5rem]",
                        )}
                      >
                        {(lift.takesLoad
                          ? ["Set", unit.toUpperCase(), amountLabel(lift), ""]
                          : ["Set", amountLabel(lift), ""]
                        ).map((h, i) => (
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
                            "grid gap-2 items-center rounded-lg px-1 py-1",
                            lift.takesLoad
                              ? "grid-cols-[2.5rem_1fr_1fr_2.5rem]"
                              : "grid-cols-[2.5rem_1fr_2.5rem]",
                            row.logged && "bg-[hsl(var(--gold))]/5",
                          )}
                        >
                          <span className="text-sm text-muted-foreground text-center">{i + 1}</span>
                          {lift.takesLoad && (
                            <Input
                              inputMode="decimal"
                              value={row.weight}
                              disabled={row.logged}
                              onChange={(e) => setRow(lift.id, i, { weight: e.target.value }, lift)}
                              className="h-10 text-center"
                              data-testid={`input-weight-${lift.exerciseId}-${i}`}
                            />
                          )}
                          <Input
                            inputMode={lift.trackingType === "distance" ? "decimal" : "numeric"}
                            value={row.amount}
                            disabled={row.logged}
                            onChange={(e) => setRow(lift.id, i, { amount: e.target.value }, lift)}
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
                              disabled={
                                !active ||
                                !row.amount ||
                                (lift.takesLoad && !row.weight) ||
                                logSet.isPending
                              }
                              onClick={() => {
                                const w = lift.takesLoad ? Number(row.weight) : 0;
                                // Only a weighted set of reps can be a record.
                                // A forty-minute bike ride is not a better
                                // forty-minute bike ride than the last one.
                                const pr =
                                  lift.takesLoad && lift.trackingType === "reps"
                                    ? isPersonalRecord(lift, w, Number(row.amount))
                                    : false;
                                logSet.mutate(
                                  {
                                    exerciseId: lift.exerciseId,
                                    habitExerciseId: lift.id,
                                    ...amountBody(lift, row.amount),
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
                                active && row.amount && (!lift.takesLoad || row.weight)
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

                      {/* A practice has one line by definition, so there is
                          nothing to add to it. */}
                      {!isPracticeCategory(lift.category) && (
                        <button
                          onClick={() =>
                            setEntries({
                              ...entries,
                              [lift.id]: [
                                ...rows,
                                {
                                  weight: rows[rows.length - 1]?.weight ?? "",
                                  reps: "",
                                  amount: "",
                                  logged: false,
                                  isPr: false,
                                },
                              ],
                            })
                          }
                          className="w-full text-xs text-[hsl(var(--gold))] py-2 inline-flex items-center justify-center gap-1 tap-clean"
                          data-testid={`button-add-set-${lift.exerciseId}`}
                        >
                          <Plus className="h-3 w-3" />
                          Add a set
                        </button>
                      )}
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

      {/* ── And whatever else they did ──
          MemberBuild used to render only on days with nothing prescribed,
          which meant a member with a session on the calendar had no way to log
          anything else: no ad-hoc session, no saved workout, no activity, and
          no sight of their own week. Its own file has said since it was
          written that "a member can also do all this on a day that does have a
          prescription, and that is deliberate" — that was the intent and it
          was never wired to a screen.

          Squats in the morning and a Pilates class in the evening is an
          ordinary Tuesday, not an edge case. */}
      {freeSession ? (
        <FreeSession
          sessionId={freeSession.id}
          title={freeSession.title}
          unit={unit}
          onDone={clearSession}
        />
      ) : (
        <MemberBuild onStarted={(id, t) => {
              setFreeSession({ id, title: t });
              qc.invalidateQueries({ queryKey: ["/api/training/sessions/open"] });
            }} />
      )}

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
