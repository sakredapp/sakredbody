/**
 * Build, for somebody nobody has written a session for.
 *
 * The screen used to say "Nothing planned today. Build sessions arrive with
 * your protocol" and offer nothing else, which told a member already dialled
 * on their training that the app had no interest in what they were doing. That
 * is most of the people who lift seriously. They want coaching for fascia,
 * mobility and recovery — the parts they are *not* dialled on — and their own
 * lifting logged alongside it, in one history, so a coach sees the whole week.
 *
 * Three ways in, all writing to the same place:
 *
 *   Start an empty session   log as you go, name it later
 *   Start from a saved one   the workout they wrote, prefilled
 *   Build one                composed now, saved to repeat
 *
 * A member can also do all this on a day that *does* have a prescription, and
 * that is deliberate: "the protocol said squats and I also did arms" is an
 * ordinary Tuesday, not an edge case.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, Plus, Play, Pencil, Copy, Trash2, X, GripVertical, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/portal/Panel";
import { WorkoutInProgress } from "@/components/build/WorkoutInProgress";
import { startSession as beginSession, type RunningSession } from "@/lib/startSession";
import { reconcileOpenWorkout, seedOpenWorkout } from "@/hooks/use-open-workout";
import { MovementPicker, type Movement } from "./MovementPicker";
import { NewMovement, type NewMovementInput } from "./NewMovement";
import { LogPractice } from "./LogPractice";
import { RecentSessions } from "./RecentSessions";
import { ProgressPhotos } from "@/components/ProgressPhotos";
import { useMyCoach } from "@/hooks/use-coaching";
import { TodaysMovement } from "@/components/portal/TodaysMovement";
import { ModalityPrompt } from "./Modalities";
import { pairMovements, supersetLabels } from "@shared/models/training";
import { cn } from "@/lib/utils";

type SavedExercise = {
  id: string;
  exerciseId: string;
  name: string;
  targetSets: number;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  trackingType: "reps" | "duration" | "distance";
  takesLoad: boolean;
  unilateral: boolean;
  /** Movements sharing a key are a superset — the key `session_exercises` uses. */
  supersetGroup: string | null;
};

type SavedWorkout = {
  id: string;
  name: string;
  note: string | null;
  /** When it was last actually begun, not when it was last edited. */
  lastUsedAt: string | null;
  /** The finished session it was saved from, if it was saved from one. */
  sourceSessionId: string | null;
  exercises: SavedExercise[];
};

/** "today", "yesterday", "3 Aug" — short enough to sit under a workout's name. */
function lastDone(at: string | null): string | null {
  if (!at) return null;
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** A movement while it is being composed, before it has been saved. */
type Draft = {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  trackingType: "reps" | "duration" | "distance";
  takesLoad: boolean;
  /**
   * Which movements are performed together.
   *
   * The same key `session_exercises.superset_group` uses, minted here because
   * a workout being designed has nothing to write to yet. Superset structure
   * is part of the composition, not something only discovered mid-session: a
   * member writing "Chest + Shoulders" to run every week should be able to say
   * that the incline press and the fly are a pair before they train it once.
   *
   * The pairing rule itself is `pairMovements` in the shared model — the same
   * function shape the server applies — so the builder and the active workout
   * cannot come to different conclusions about what joining a group means.
   */
  supersetGroup: string | null;
};

export function MemberBuild({
  /**
   * A workout is now open. Nothing is passed back with it: the layer that
   * shows it reads the session from `/api/training/sessions/open`, which is
   * the same place every other surface reads it from. Handing an id and a
   * title across would be a second copy to fall out of step with the first.
   */
  onStarted,
}: {
  onStarted: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [building, setBuilding] = useState<SavedWorkout | "new" | null>(null);
  const [logging, setLogging] = useState(false);

  const workouts = useQuery<SavedWorkout[]>({ queryKey: ["/api/training/workouts"] });

  /* Only so the progress-photo panel can say who can see one, truthfully. */
  const myCoach = useMyCoach();

  /**
   * A workout already running when they tried to begin another.
   *
   * Held rather than toasted, so the card can offer the way back into it.
   */
  /** The refused start, held with the attempt so the way out can finish it. */
  const [collision, setCollision] = useState<
    { session: RunningSession; retry: () => void } | null
  >(null);

  /**
   * Throw away the session that is in the way, then retry the one they asked
   * for. Confirmed on the card first — see `WorkoutInProgress`, and the note
   * there about zero-set sessions that still carry composition.
   */
  const discardBlocking = useMutation({
    mutationFn: async (c: { session: RunningSession }) =>
      apiRequest("DELETE", `/api/training/sessions/${c.session.id}`),
    onSuccess: async (_r, c) => {
      const retry = collision?.retry;
      setCollision(null);
      await qc.invalidateQueries({ queryKey: ["/api/training/sessions/open"] });
      qc.invalidateQueries({ queryKey: ["/api/training/sessions"] });
      retry?.();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const startSession = useMutation({
    mutationFn: (v: Parameters<typeof beginSession>[0]) => beginSession(v),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  /**
   * Start, unless one is already open.
   *
   * Returns null when it collided, so every call site stops rather than
   * announcing a session that was never created.
   *
   * The whole body is carried into the retry, not just the title. That was the
   * shape of the bug this replaces: a saved workout was started by passing its
   * *name*, so the session arrived correctly titled and completely empty — and
   * a member who tapped "Push Day A" got a running timer over a blank screen,
   * which reads as the app having lost their workout. What a session is made
   * of is not a string.
   */
  const begin = async (
    body: Parameters<typeof beginSession>[0],
  ): Promise<{ id: string } | null> => {
    const result = await startSession.mutateAsync(body);
    if ("conflict" in result) {
      setCollision({ session: result.conflict, retry: () => void begin(body) });
      return null;
    }
    // The new session goes into the shared cache before anybody renders
    // against it, so the resume strip, the timer and Build all start from the
    // same fact — and so a `/open` read already in flight cannot come back and
    // say nothing is running. See `seedOpenWorkout`.
    await seedOpenWorkout(qc, result.started);

    /*
      A session that arrives with movements in it has to be read back before
      the screen draws.

      The POST answers with the session row and nothing else — it has no
      composition on it, because for a blank start there is none. Seeding that
      and opening the sheet is right for a blank start and wrong for this one:
      the member taps their saved workout, the sheet opens, and it is empty
      until some later refetch fills it in. Which is the exact thing this whole
      path was fixed for, arriving a second time by a different route.

      So a planned start waits for the truth. One request, at the moment
      somebody is looking at the screen, in exchange for the screen being
      right when they look at it.
    */
    if (body.fromWorkoutId || body.repeatSessionId) await reconcileOpenWorkout(qc);
    return result.started;
  };

  const duplicate = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("POST", `/api/training/workouts/${id}/duplicate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training/workouts"] });
      toast({ title: "Copied. Open it to rename." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/training/workouts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training/workouts"] });
      toast({ title: "Removed" });
    },
  });

  const saved = workouts.data ?? [];

  return (
    <>
      {/*
        Today, before the buttons that ask you to log something.

        A member who ran five miles this morning opened Build and was offered
        "Start a session" and "Log an activity" — an invitation to record what
        the app had already imported and was already counting. Showing it first
        is the difference between an app that watched their morning and one that
        wants them to type it in again.
      */}
      <TodaysMovement />

      {collision && (
        <WorkoutInProgress
          session={collision.session}
          onResume={() => {
            onStarted();
            setCollision(null);
          }}
          onDiscard={() => discardBlocking.mutate(collision)}
          discarding={discardBlocking.isPending}
        />
      )}
      <Panel title="Your own training">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Log whatever you're doing — lifting, a Pilates class, basketball, a bike ride. It all
            lands in the same history your coach reads.
          </p>

          {/* ── Two doors, because there are two kinds of day ──
              Counted work — sets, reps, load — needs a session you keep open
              and add to. A class or a game does not: it already happened, and
              the only thing to record is what and how long. Putting both
              behind "Start a session" is how somebody who just did ninety
              minutes of basketball ends up logging nothing at all. */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const s = await begin({ title: null });
                if (s) onStarted();
              }}
              disabled={startSession.isPending}
              data-testid="build-start-empty"
              /*
                The walkthrough's "start a session" lesson used to point only at
                the prescribed session's own button, which exists for members a
                coach has written a day for. A member without a coach reached
                that lesson and it waited for a control they will never have —
                the tour stopped dead on the most common account there is.

                Both are the same act, and only one of them is ever on screen,
                so the resolver still sees exactly one visible instance.
              */
              data-tour-id="build-start-session"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Start a session
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLogging(true)}
              data-testid="build-log-practice"
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Log an activity
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBuilding("new")}
              data-testid="build-new-workout"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Build a workout
            </Button>
          </div>

          {/* ── Saved workouts ── */}
          {saved.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Saved
              </p>
              {saved.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center gap-2 rounded-xl border border-border/50 px-3 py-2.5"
                  data-testid={`saved-workout-${w.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{w.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {w.exercises.length
                        ? w.exercises.map((e) => e.name).join(" · ")
                        : "Nothing in it yet"}
                    </p>
                    {/*
                      What it is made of, said in the list rather than only
                      after it starts — a saved workout is a structure, and
                      "4 movements · 1 superset" is what distinguishes two of
                      them from each other at a glance.
                    */}
                    {w.exercises.length > 0 && (
                      <p
                        className="text-[10px] text-muted-foreground/70 truncate"
                        data-testid={`saved-workout-shape-${w.id}`}
                      >
                        {[
                          `${w.exercises.length} ${
                            w.exercises.length === 1 ? "movement" : "movements"
                          }`,
                          new Set(
                            w.exercises.map((e) => e.supersetGroup).filter(Boolean),
                          ).size > 0
                            ? `${
                                new Set(
                                  w.exercises.map((e) => e.supersetGroup).filter(Boolean),
                                ).size
                              } superset`
                            : null,
                          lastDone(w.lastUsedAt) && `last done ${lastDone(w.lastUsedAt)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={async () => {
                      // The workout, not its name. See `begin`.
                      const s = await begin({ fromWorkoutId: w.id });
                      if (s) onStarted();
                    }}
                    data-testid={`start-workout-${w.id}`}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground"
                    onClick={() => setBuilding(w)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {/* A variation without losing what it varies from — Push Day
                      A becomes Push Day B with one movement swapped. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground"
                    onClick={() => duplicate.mutate(w.id)}
                    disabled={duplicate.isPending}
                    aria-label="Duplicate"
                    data-testid={`duplicate-workout-${w.id}`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(w.id)}
                    aria-label="Remove"
                    data-testid={`remove-workout-${w.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <ModalityPrompt />

      <RecentSessions preview={3} />

      {/*
        The week above is everything, unfiltered, and stays that way — it is
        what Build has always shown. This is the longer view of training
        specifically, which is the one a member goes looking for when they want
        to know whether the last month added up to anything.
      */}
      <RecentSessions days={30} lens="build" title="Your Build history" preview={0} />

      {/*
        Under the history rather than beside it. A progress photograph is a
        record of the same weeks the sessions above describe, and putting it in
        its own destination would make it a feature somebody has to go and find.
      */}
      <ProgressPhotos hasCoach={!!myCoach.data?.coach} />

      {logging && <LogPractice onClose={() => setLogging(false)} />}

      {building && (
        <WorkoutBuilder
          workout={building === "new" ? null : building}
          onClose={() => setBuilding(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["/api/training/workouts"] });
            setBuilding(null);
          }}
        />
      )}
    </>
  );
}

// ─── The builder ────────────────────────────────────────────────────────────

function WorkoutBuilder({
  workout,
  onClose,
  onSaved,
}: {
  workout: SavedWorkout | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(workout?.name ?? "");
  const [picking, setPicking] = useState(false);
  const [items, setItems] = useState<Draft[]>(
    workout?.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      targetSets: e.targetSets,
      targetRepsLow: e.targetRepsLow,
      targetRepsHigh: e.targetRepsHigh,
      trackingType: e.trackingType,
      takesLoad: e.takesLoad,
      supersetGroup: e.supersetGroup,
    })) ?? [],
  );

  /**
   * The same four questions the workout screen asks.
   *
   * This used to send the name and a hardcoded `full_body`, which is how a
   * loaded single-leg hinge became a bilateral full-body movement that will
   * never graph against anything. See `NewMovement` for the argument.
   */
  const [creating, setCreating] = useState<string | null>(null);
  const createMovement = useMutation({
    mutationFn: async (input: NewMovementInput) => {
      const res = await apiRequest("POST", "/api/training/exercises", input);
      return (await res.json()) as Movement;
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["/api/training/exercises"] });
      add(m);
      setCreating(null);
      toast({ title: `Added ${m.name}` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        exercises: items.map((i) => ({
          exerciseId: i.exerciseId,
          targetSets: i.targetSets,
          targetRepsLow: i.targetRepsLow,
          targetRepsHigh: i.targetRepsHigh,
          // Sent back, or the next save would quietly unpair the workout.
          supersetGroup: i.supersetGroup,
        })),
      };
      return workout
        ? apiRequest("PUT", `/api/training/workouts/${workout.id}`, body)
        : apiRequest("POST", "/api/training/workouts", body);
    },
    onSuccess: onSaved,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const add = (m: Movement) =>
    setItems((prev) =>
      prev.some((i) => i.exerciseId === m.id)
        ? prev
        : [
            ...prev,
            {
              exerciseId: m.id,
              name: m.name,
              targetSets: 3,
              // A duration movement has no rep target, and offering one is how
              // a plank ends up prescribed as "3 × 10".
              targetRepsLow: m.trackingType === "reps" ? 8 : null,
              targetRepsHigh: m.trackingType === "reps" ? 12 : null,
              trackingType: m.trackingType,
              takesLoad: m.takesLoad,
              supersetGroup: null,
            },
          ],
    );

  const picked = new Set(items.map((i) => i.exerciseId));
  const pairs = supersetLabels(items);

  /** Which movement is choosing a partner, if any. */
  const [pairing, setPairing] = useState<string | null>(null);

  /*
    The same rule the active workout applies, from the same function. Joining a
    movement already in a group joins that group; leaving one that would be
    left holding a single movement dissolves it. The key is minted here because
    a workout being designed has no rows yet — the server mints fresh ones per
    session when it is started, so nothing about this key outlives the template.
  */
  const pair = (exerciseId: string, partnerExerciseId: string | null) => {
    setItems((prev) => pairMovements(prev, exerciseId, partnerExerciseId, () => crypto.randomUUID()));
    setPairing(null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88svh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-display text-xl">
            {workout ? "Edit workout" : "Build a workout"}
          </DialogTitle>
        </DialogHeader>

        {creating !== null ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <NewMovement
              name={creating}
              saving={createMovement.isPending}
              onCancel={() => setCreating(null)}
              onCreate={(m) => createMovement.mutate(m)}
            />
          </div>
        ) : picking ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <MovementPicker
              only="movements"
              picked={picked}
              onPick={add}
              onCreate={(n) => setCreating(n)}
              onClose={() => setPicking(false)}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto scroll-touch space-y-3">
            <Input
              placeholder="Name it — Push Day A, Hip Mobility…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="workout-name"
            />

            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nothing in it yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((i, idx) => (
                  <li
                    key={i.exerciseId}
                    className="flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-2"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        {/* Shown, not editable. See the note on Draft. */}
                        {pairs.has(i.exerciseId) && (
                          <span
                            className="shrink-0 rounded-sm bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-gold"
                            data-testid={`builder-superset-${i.exerciseId}`}
                          >
                            {pairs.get(i.exerciseId)}
                          </span>
                        )}
                        <p className="text-sm truncate">{i.name}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={20}
                          value={i.targetSets}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((p, n) =>
                                n === idx
                                  ? { ...p, targetSets: Math.max(1, Number(e.target.value) || 1) }
                                  : p,
                              ),
                            )
                          }
                          className="w-11 bg-transparent border border-border/50 rounded px-1.5 py-0.5 text-base md:text-[11px] text-center"
                          aria-label="Sets"
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {i.trackingType === "reps" ? "sets ×" : "sets"}
                        </span>
                        {i.trackingType === "reps" && (
                          <input
                            type="number"
                            inputMode="numeric"
                            value={i.targetRepsHigh ?? ""}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((p, n) =>
                                  n === idx
                                    ? { ...p, targetRepsHigh: Number(e.target.value) || null }
                                    : p,
                                ),
                              )
                            }
                            className="w-11 bg-transparent border border-border/50 rounded px-1.5 py-0.5 text-base md:text-[11px] text-center"
                            aria-label="Reps"
                          />
                        )}
                        {i.trackingType === "reps" && (
                          <span className="text-[11px] text-muted-foreground">reps</span>
                        )}
                      </div>

                      {/*
                        ── Pairing, while the workout is being written ──

                        Offered on every movement, including when it is the
                        only one — a member adds the incline press *thinking*
                        of the fly, and a control that appears only once there
                        are two is missing at the moment it is wanted. With one
                        movement this says so rather than opening an empty
                        chooser.
                      */}
                      {pairing === i.exerciseId ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {items
                            .filter((x) => x.exerciseId !== i.exerciseId)
                            .map((x) => (
                              <button
                                key={x.exerciseId}
                                onClick={() => pair(i.exerciseId, x.exerciseId)}
                                className="text-[11px] rounded-full border border-border/60 px-2 py-0.5 tap-clean"
                                data-testid={`builder-pair-with-${x.exerciseId}`}
                              >
                                {x.name}
                              </button>
                            ))}
                          <button
                            onClick={() => setPairing(null)}
                            className="text-[11px] text-muted-foreground px-1 tap-clean"
                            data-testid={`builder-pair-cancel-${i.exerciseId}`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : i.supersetGroup ? (
                        <button
                          onClick={() => pair(i.exerciseId, null)}
                          className="mt-1 block text-[11px] text-muted-foreground tap-clean"
                          data-testid={`builder-unpair-${i.exerciseId}`}
                        >
                          {`Superset with ${items
                            .filter((x) => x.supersetGroup === i.supersetGroup && x.exerciseId !== i.exerciseId)
                            .map((x) => x.name)
                            .join(", ")} — perform separately`}
                        </button>
                      ) : items.length > 1 ? (
                        <button
                          onClick={() => setPairing(i.exerciseId)}
                          className="mt-1 block text-[11px] text-muted-foreground tap-clean"
                          data-testid={`builder-pair-${i.exerciseId}`}
                        >
                          Superset with…
                        </button>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground/60">
                          Add another movement to superset this one.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        // Removing it also takes it out of whatever it was
                        // paired with — through the same rule, so a pair left
                        // holding one movement dissolves rather than keeping a
                        // bracket around nothing.
                        const loose = pairMovements(items, i.exerciseId, null, () => crypto.randomUUID());
                        setItems(loose.filter((x) => x.exerciseId !== i.exerciseId));
                      }}
                      className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${i.name}`}
                      data-testid={`builder-remove-${i.exerciseId}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setPicking(true)}
              data-testid="builder-add-movement"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add a movement
            </Button>
          </div>
        )}

        {!picking && creating === null && (
          <div className="shrink-0 flex gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} className="flex-1 text-muted-foreground">
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
              className="flex-1"
              data-testid="workout-save"
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The icon the empty Build screen uses, kept here so BuildTab stays tidy. */
export { Dumbbell as BuildIcon };
