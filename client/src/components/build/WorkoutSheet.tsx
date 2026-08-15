/**
 * You are training now, and the app looks like it.
 *
 * ── Why this is a layer and not a card ────────────────────────────────────
 *
 * The workout used to be a panel called `YOUR SESSION`, sitting two-thirds of
 * the way down Build underneath a recommendation, a history list and a habits
 * card. Everything worked. It just never announced that anything was
 * happening: you started a session and the app carried on being a dashboard,
 * so finding the set you were about to log meant scrolling past three panels
 * about the rest of your week.
 *
 * A workout is a mode. While it is running the screen is the workout — its
 * name, its clock, its movements, and the two things you can do to end it —
 * and everything else in the product is behind a collapse chevron rather than
 * above and below it.
 *
 * ── Collapsed is not closed ───────────────────────────────────────────────
 *
 * Collapsing puts the whole app back with the resume strip above the nav. It
 * does not touch the session, because the session was never this component's
 * to end: a workout is running because a row has no `finished_at`. Only Finish
 * and a confirmed Discard change that, and both of them say so to the server.
 *
 * ── And its contents come from the server ─────────────────────────────────
 *
 * The list of movements used to live in `useState` beside the sets. The sets
 * were safe — each one is committed as it is logged — but the *list* was not,
 * so a force-quit mid-workout gave you back a running clock over an empty
 * session with no sign of the eleven sets underneath it. Now `logged` comes
 * down with the open session and the groups are derived from it, so the only
 * local state is what has not been written down yet: movements added but not
 * yet logged, and the numbers currently in the boxes.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  MoreHorizontal,
  Users,
  Send,
  MessageSquare,
} from "lucide-react";
import { isPracticeCategory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  isMissingSession,
  reconcileOpenWorkout,
  useOpenWorkout,
  OPEN_WORKOUT_KEY,
  type LoggedSet,
} from "@/hooks/use-open-workout";
import { Elapsed } from "@/components/build/Elapsed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MovementPicker, type Movement } from "./MovementPicker";
import { NewMovement } from "./NewMovement";
import { ObservationForm, observationSummary, type Observation } from "./Observation";
import { MovementMemory, MEMORY_KEY } from "./TrainingMemory";
import { cn } from "@/lib/utils";

// ─── Who can open it ────────────────────────────────────────────────────────

type Sheet = {
  expanded: boolean;
  /** Bring the workout to the front. Safe to call when none is running. */
  open: () => void;
  /** Put the app back. Does not touch the session. */
  collapse: () => void;
  /**
   * A session that has just been finished, held for one more screen.
   *
   * The confirmation — "12 sets saved, share it with the room" — is about a
   * session that no longer exists, so it cannot live inside a component that
   * only renders while one does. Held here, and cleared by the member pressing
   * Done, so a background refetch cannot pull it out from under them.
   */
  justFinished: { id: string; sets: number; shared: boolean } | null;
  setJustFinished: (v: { id: string; sets: number; shared: boolean } | null) => void;
};

const SheetContext = createContext<Sheet>({
  expanded: false,
  open: () => {},
  collapse: () => {},
  justFinished: null,
  setJustFinished: () => {},
});

export const useWorkoutSheet = () => useContext(SheetContext);

export function WorkoutSheetProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [justFinished, setJustFinished] = useState<Sheet["justFinished"]>(null);
  const value = useMemo<Sheet>(
    () => ({
      expanded,
      open: () => setExpanded(true),
      collapse: () => setExpanded(false),
      justFinished,
      setJustFinished,
    }),
    [expanded, justFinished],
  );
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}

// ─── What a movement in the session looks like ──────────────────────────────

/** The movement columns that travel with a logged set, as a `Movement`. */
function movementOf(s: LoggedSet): Movement {
  return {
    id: s.exerciseId,
    name: s.name,
    category: s.category,
    equipment: "other",
    trackingType: s.trackingType,
    takesLoad: s.takesLoad,
    unilateral: s.unilateral,
    aliases: null,
    ownerUserId: null,
  };
}

type Group = { movement: Movement; sets: LoggedSet[] };

/** "80 lb × 8", "45 min", "0:45" — whichever of those this set actually is. */
function setLine(s: LoggedSet, unit: string): string {
  const parts: string[] = [];
  if (s.weight != null && s.weight > 0) parts.push(`${s.weight} ${unit}`);
  if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.durationSeconds != null) {
    parts.push(
      s.durationSeconds >= 120
        ? `${Math.round(s.durationSeconds / 60)} min`
        : `${s.durationSeconds}s`,
    );
  }
  if (s.distanceM != null) parts.push(`${s.distanceM} m`);
  return parts.join(" × ") || "logged";
}

type Draft = { weight: string; reps: string; seconds: string };
const blank = (): Draft => ({ weight: "", reps: "", seconds: "" });

// ─── The layer ──────────────────────────────────────────────────────────────

export function WorkoutSheet() {
  const { expanded, collapse, justFinished } = useWorkoutSheet();
  const { data } = useOpenWorkout();
  const session = data?.session ?? null;

  /**
   * Nothing running means nothing to show, and the collapsed state is reset so
   * the next workout opens rather than reappearing already put away.
   *
   * Except while a confirmation is being held: that screen is about a session
   * that has deliberately just ceased to exist.
   */
  useEffect(() => {
    if (!session && expanded && !justFinished) collapse();
  }, [session, expanded, collapse, justFinished]);

  // The one screen that outlives the session it is about.
  if (justFinished) return <Logged />;

  /**
   * A prescribed session keeps its own screen.
   *
   * `habit_id` means a coach wrote this one, and Build renders it with every
   * target and every resolved weight already on it. Opening this layer over
   * that would replace a prescription with an empty list, so it stands aside —
   * the resume strip sends those to Build instead.
   */
  if (!expanded || !session || session.habitId) return null;
  return <Sheet key={session.id} />;
}

function Sheet() {
  const { collapse, setJustFinished } = useWorkoutSheet();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useOpenWorkout();
  const session = data!.session!;
  const unit = session.unit ?? "lb";

  /**
   * Movements added but with nothing under them yet — the only part of the
   * list the server cannot know about, because nothing has been written.
   */
  const [extras, setExtras] = useState<Movement[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /**
   * Which movement they are leaving a note on, `"session"` for the whole thing,
   * and `null` for none. A separate screen rather than a field on the row: what
   * gets written here is a sentence, and a sentence does not belong beside two
   * number boxes and a tick.
   */
  const [noting, setNoting] = useState<string | null>(null);
  /** Finish opens the response loop rather than committing straight away. */
  const [reviewing, setReviewing] = useState(false);
  /** Held rather than posted on tap, so "Save & finish" has something to save. */
  const [allGood, setAllGood] = useState(false);
  const [shareWithCoach, setShareWithCoach] = useState(true);

  const logged = session.logged ?? [];
  const observations = session.observations ?? [];
  const observationFor = (exerciseId: string | null) =>
    observations.find((o) => o.exerciseId === exerciseId) ?? null;

  /**
   * The session, grouped.
   *
   * Derived rather than stored, so there is no second copy of the sets to fall
   * out of step with the first. Order is the order they were trained in — the
   * first appearance of each movement in `setIndex` order — followed by
   * whatever has been added since and not yet logged.
   */
  const groups = useMemo<Group[]>(() => {
    const byId = new Map<string, Group>();
    for (const s of logged) {
      const g = byId.get(s.exerciseId);
      if (g) g.sets.push(s);
      else byId.set(s.exerciseId, { movement: movementOf(s), sets: [s] });
    }
    for (const m of extras) if (!byId.has(m.id)) byId.set(m.id, { movement: m, sets: [] });
    return Array.from(byId.values());
  }, [logged, extras]);

  /**
   * A movement stops being "extra" the moment it has a set on the server.
   *
   * Without this it would be held in both places, and removing it would take
   * the logged half away and leave the empty half on screen.
   */
  useEffect(() => {
    const onServer = new Set(logged.map((s) => s.exerciseId));
    setExtras((prev) => (prev.some((m) => onServer.has(m.id)) ? prev.filter((m) => !onServer.has(m.id)) : prev));
  }, [logged]);

  // ── Writes ───────────────────────────────────────────────────────────────

  const gone = async () => {
    const replacement = await reconcileOpenWorkout(qc);
    collapse();
    toast({
      title: replacement ? "That workout had already ended." : "That workout is no longer open.",
      description: replacement
        ? "A different one is running — resume it from the strip."
        : "It was finished or discarded.",
    });
  };

  /** One failure path, so no write can be the one that forgot. See `use-open-workout`. */
  const failed = (e: Error) => {
    if (isMissingSession(e)) return void gone();
    toast({ title: e.message, variant: "destructive" });
  };

  const refreshSession = () => qc.invalidateQueries({ queryKey: OPEN_WORKOUT_KEY });

  const logSet = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiRequest("POST", `/api/training/sessions/${session.id}/sets`, body),
    onSuccess: refreshSession,
    onError: failed,
  });

  const removeMovement = useMutation({
    mutationFn: async (exerciseId: string) =>
      apiRequest("DELETE", `/api/training/sessions/${session.id}/exercises/${exerciseId}`),
    onSuccess: (_r, exerciseId) => {
      setExtras((prev) => prev.filter((m) => m.id !== exerciseId));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
      setMenuFor(null);
      setConfirmRemove(null);
      refreshSession();
    },
    onError: failed,
  });

  const createMovement = useMutation({
    mutationFn: async (m: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/training/exercises", m);
      return (await res.json()) as Movement;
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["/api/training/exercises"] });
      add(m);
      setCreating(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const discardSent = useRef(false);
  const discard = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/training/sessions/${session.id}`),
    onSuccess: () => {
      refreshSession();
      qc.invalidateQueries({ queryKey: ["/api/training/sessions"] });
      collapse();
      toast({ title: "Discarded." });
    },
    // Absent is what Discard was asking for. See `use-open-workout`.
    onError: (e: Error) => {
      if (isMissingSession(e)) return void gone();
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const observe = useMutation({
    mutationFn: async (o: Observation) =>
      apiRequest("POST", `/api/training/sessions/${session.id}/observations`, o),
    onSuccess: () => {
      setNoting(null);
      refreshSession();
    },
    onError: failed,
  });

  const finish = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/training/sessions/${session.id}/finish`, { shareWithCoach }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/training/today"] });
      qc.invalidateQueries({ queryKey: ["/api/terrain/today"] });
      // What was just said becomes what gets remembered.
      qc.invalidateQueries({ queryKey: MEMORY_KEY });
      /**
       * And the session is over, said to the cache rather than left to expire.
       *
       * This was missing, and the consequence was not cosmetic: the open-session
       * answer stayed valid for its full `staleTime`, so the resume strip went on
       * offering a workout that had ended — the exact failure the strip's own file
       * names as the reason it reads one shared query. Then the eventual refetch
       * would pull the confirmation screen out from under whoever was reading it.
       */
      qc.setQueryData(OPEN_WORKOUT_KEY, { session: null });
      setJustFinished({ id: session.id, sets: total, shared: false });
    },
    onError: failed,
  });

  // ── Editing ──────────────────────────────────────────────────────────────

  const add = (m: Movement) => {
    setExtras((prev) =>
      prev.some((x) => x.id === m.id) || logged.some((s) => s.exerciseId === m.id)
        ? prev
        : [...prev, m],
    );
    setPicking(false);
  };

  const draftFor = (id: string) => drafts[id] ?? blank();
  const patch = (id: string, p: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...p } }));

  const commit = async (g: Group) => {
    const d = draftFor(g.movement.id);
    const body: Record<string, unknown> = { exerciseId: g.movement.id };

    if (g.movement.trackingType === "duration") {
      // A hold is seconds and a class is minutes. "3000 secs" of Reformer is
      // the kind of unit that gets typed wrong once and lives in the history.
      const entered = Number(d.seconds);
      if (!entered) return toast({ title: "How long?", variant: "destructive" });
      body.durationSeconds = isPracticeCategory(g.movement.category)
        ? Math.round(entered * 60)
        : entered;
    } else {
      const reps = Number(d.reps);
      if (!reps) return toast({ title: "How many reps?", variant: "destructive" });
      body.reps = reps;
    }
    if (g.movement.takesLoad && d.weight) body.weight = Number(d.weight);

    /**
     * The row clears only once the server has it. `mutateAsync` rejects on
     * failure, and letting that out of a click handler is an unhandled
     * rejection under a box that looks like it emptied because it saved.
     */
    try {
      await logSet.mutateAsync(body);
    } catch {
      return;
    }
    // The weight carries to the next set, because the next set is usually the
    // same weight. Reps do not — that is the number that changes.
    patch(g.movement.id, { reps: "", seconds: "" });
  };

  const total = logged.length;

  // ── Leaving a note ───────────────────────────────────────────────────────

  if (noting !== null) {
    const target = noting === "session" ? null : groups.find((g) => g.movement.id === noting);
    return (
      <Layer>
        <ObservationForm
          title={noting === "session" ? "The session" : (target as Group)?.movement.name ?? "This movement"}
          unilateral={noting !== "session" && !!(target as Group)?.movement.unilateral}
          existing={observationFor(noting === "session" ? null : noting)}
          saving={observe.isPending}
          onCancel={() => setNoting(null)}
          onSave={(o) =>
            observe.mutate({ exerciseId: noting === "session" ? null : noting, ...o })
          }
        />
      </Layer>
    );
  }

  // ── How did that land? ───────────────────────────────────────────────────

  if (reviewing) {
    return (
      <Layer>
        {/*
          ── Nobody is held here ──

          A feedback screen with no way past it is how somebody ends up
          believing they finished while the timer runs for another two hours.
          So there are three ways out and all of them are visible: back to the
          workout, finish with what you said, and finish without saying
          anything. The workout is still running until one of the last two is
          pressed, and the header says so rather than leaving it to be
          inferred.
        */}
        <div className="shrink-0 px-4 pt-2 pb-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReviewing(false)}
              className="h-9 w-9 -ml-1.5 grid place-items-center rounded-full text-muted-foreground tap-clean"
              aria-label="Back to the workout"
              data-testid="review-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
              How did that land?
            </p>
          </div>
          <p className="font-display text-xl mt-0.5">
            {session.title?.trim() || "Your session"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Still running · <Elapsed startedAt={session.startedAt} className="tabular-nums" />
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-touch px-4 py-4 space-y-5">
          {/*
            ── Why this screen exists at all ──

            The number a member can give you afterwards — 80 × 8 — is the half
            the app already had. The half it never had is what their body did
            with it, and there is exactly one moment somebody will tell you:
            the minute they finish, before they have put the phone away.

            It is optional and it is fast. The point is not to grade fourteen
            exercises every workout; it is that the one evening something felt
            wrong, there is somewhere obvious to say so.
          */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            Anything feel off? What you say here shapes your next warm-up and what
            Sakred suggests — see below.
          </p>

          {/* The whole answer, for the sessions that do not need one. Recorded
              rather than skipped: "it landed fine" is what makes the one
              evening it does not land legible. */}
          <button
            onClick={() => setAllGood((v) => !v)}
            className={cn(
              "w-full rounded-xl border px-3 py-2.5 text-left text-sm tap-clean transition-colors",
              allGood
                ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/10"
                : "border-border/60 text-muted-foreground",
            )}
            aria-pressed={allGood}
            data-testid="review-all-good"
          >
            <span className="inline-flex items-center gap-2">
              {allGood && <Check className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />}
              No — it all felt good
            </span>
          </button>

          <div className="space-y-1">
            {groups.map((g) => {
              const o = observationFor(g.movement.id);
              return (
                <button
                  key={g.movement.id}
                  onClick={() => setNoting(g.movement.id)}
                  className="w-full flex items-center justify-between gap-3 py-2.5 text-left tap-clean"
                  data-testid={`review-${g.movement.id}`}
                >
                  <span className="text-sm truncate">{g.movement.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1">
                    {o ? observationSummary(o) : "Add feedback"}
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setNoting("session")}
            className="w-full flex items-center justify-between gap-3 py-2.5 text-left tap-clean border-t border-border/40"
            data-testid="review-session-note"
          >
            <span className="text-sm text-muted-foreground">Overall session note</span>
            <span className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1">
              {observationFor(null) ? observationSummary(observationFor(null)!) : "Add"}
              <Plus className="h-3 w-3" />
            </span>
          </button>

          {/*
            The boundary, stated where somebody is about to describe a symptom.
            Sakred can adapt training around what a member reports; it cannot
            tell them what is wrong with them, and the difference matters most
            in exactly the cases where it would be most tempting to try.
          */}
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Sakred adjusts your training around what you notice. It doesn't diagnose —
            sharp, spreading or worsening pain is worth a professional's eyes.
          </p>
        </div>

        <div className="shrink-0 px-4 py-3 pb-safe border-t border-border/40 space-y-2">
          <Button
            className="w-full bg-gold border-gold-border text-white"
            disabled={observe.isPending || finish.isPending}
            onClick={async () => {
              /**
               * Per-movement notes are already on the server — they were saved
               * as each was written. The only thing this still has to commit is
               * the "it all felt good" answer, which is held here so that the
               * two buttons below mean two different things rather than being
               * the same action wearing two labels.
               */
              if (allGood) {
                try {
                  await observe.mutateAsync({
                    exerciseId: null,
                    note: null,
                    quality: "good",
                    side: null,
                  });
                } catch {
                  return;
                }
              }
              finish.mutate();
            }}
            data-testid="review-finish"
          >
            {finish.isPending || observe.isPending ? "Saving…" : "Save & finish"}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={finish.isPending}
            onClick={() => finish.mutate()}
            data-testid="review-finish-bare"
          >
            Finish without feedback
          </Button>
        </div>
      </Layer>
    );
  }


  // ── Adding a movement ────────────────────────────────────────────────────

  if (creating !== null) {
    return (
      <Layer>
        <NewMovement
          name={creating}
          saving={createMovement.isPending}
          onCancel={() => setCreating(null)}
          onCreate={(m) => createMovement.mutate(m)}
        />
      </Layer>
    );
  }

  if (picking) {
    return (
      <Layer>
        {/*
          The picker is a screen inside the workout rather than a dialog on top
          of it. A modal over a modal is a stack of two things that can each be
          dismissed the wrong way, and on a phone the full height is what the
          list actually needs.
        */}
        <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/40">
          <p className="font-display text-lg">Add a movement</p>
          <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
            Done
          </Button>
        </div>
        <div className="flex-1 min-h-0 px-4 py-3 flex flex-col">
          <MovementPicker
            only="movements"
            picked={new Set(groups.map((g) => g.movement.id))}
            onPick={add}
            onCreate={(n) => setCreating(n)}
          />
        </div>
      </Layer>
    );
  }

  // ── The workout ──────────────────────────────────────────────────────────

  return (
    <Layer>
      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-2 pb-3 border-b border-border/40 space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={collapse}
            className="h-9 w-9 -ml-1.5 grid place-items-center rounded-full text-muted-foreground tap-clean"
            aria-label="Collapse workout"
            data-testid="collapse-workout"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          <Elapsed
            startedAt={session.startedAt}
            className="flex-1 text-center text-sm tabular-nums text-muted-foreground"
          />
          {/* Opens the response loop rather than committing. See `reviewing`. */}
          <Button
            size="sm"
            className="bg-gold border-gold-border text-white"
            onClick={() => setReviewing(true)}
            disabled={total === 0 || finish.isPending}
            data-testid="finish-workout"
          >
            Finish
          </Button>
        </div>

        <div>
          <p className="font-display text-2xl leading-tight" data-testid="workout-title">
            {session.title?.trim() || "Your session"}
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
            Active workout
            {total > 0 && ` · ${total} ${total === 1 ? "set" : "sets"}`}
          </p>
        </div>
      </div>

      {/* ── Movements ── */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-touch px-4 py-4 space-y-6">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add what you're doing as you get to it.
          </p>
        )}

        {groups.map((g) => {
          const m = g.movement;
          const d = draftFor(m.id);
          const duration = m.trackingType === "duration";
          const asMinutes = duration && isPracticeCategory(m.category);

          return (
            <div key={m.id} className="space-y-2" data-testid={`workout-movement-${m.id}`}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex items-baseline gap-2">
                  <p className="text-base truncate">{m.name}</p>
                  {m.unilateral && (
                    <span className="text-[10px] text-muted-foreground shrink-0">per side</span>
                  )}
                </div>
                <div className="flex items-center shrink-0">
                {/*
                  During the workout, not only at the end. "The glute didn't
                  connect on that set" is a thing somebody knows at the moment
                  it happens and has usually stopped thinking about by the time
                  they are putting the bar away.
                */}
                <button
                  onClick={() => setNoting(m.id)}
                  className="h-7 w-7 grid place-items-center tap-clean"
                  aria-label={`Note on ${m.name}`}
                  data-testid={`note-movement-${m.id}`}
                >
                  <MessageSquare
                    className={cn(
                      "h-3.5 w-3.5",
                      observationFor(m.id)
                        ? "text-[hsl(var(--gold))]"
                        : "text-muted-foreground/50",
                    )}
                  />
                </button>
                <button
                  onClick={() => {
                    setMenuFor(menuFor === m.id ? null : m.id);
                    setConfirmRemove(null);
                  }}
                  className="h-7 w-7 -mr-1.5 grid place-items-center text-muted-foreground/60 tap-clean"
                  aria-label={`Options for ${m.name}`}
                  data-testid={`movement-menu-${m.id}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                </div>
              </div>

              {/*
                Removing a movement removes what was logged under it, so the
                count is in the sentence. "Are you sure?" does not tell anybody
                what they are about to lose; "and its 3 logged sets" does.
              */}
              {menuFor === m.id && (
                <button
                  onClick={() => {
                    if (g.sets.length === 0 || confirmRemove === m.id) {
                      removeMovement.mutate(m.id);
                      return;
                    }
                    setConfirmRemove(m.id);
                  }}
                  disabled={removeMovement.isPending}
                  className="text-xs text-muted-foreground tap-clean"
                  data-testid={`remove-movement-${m.id}`}
                >
                  {confirmRemove === m.id
                    ? `Remove ${m.name} and its ${g.sets.length} logged ${
                        g.sets.length === 1 ? "set" : "sets"
                      }? — tap again`
                    : `Remove ${m.name}`}
                </button>
              )}

              {/*
                Before the first set of it, which is the only moment it could
                change anything. `pattern` is not carried on a logged set, so a
                movement matched only by shape needs the catalogue — that is a
                gap, and the exact-movement match, which is the common case,
                works without it.
              */}
              <MovementMemory movement={{ id: m.id, name: m.name, category: m.category }} />

              {/* What is already on the server, stated rather than editable. */}
              {g.sets.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 text-sm"
                  data-testid={`logged-set-${s.id}`}
                >
                  <span className="text-[11px] text-muted-foreground w-4 shrink-0">{i + 1}</span>
                  <span className="flex-1">{setLine(s, unit)}</span>
                  <Check className="h-3.5 w-3.5 text-[hsl(var(--gold))] shrink-0" />
                </div>
              ))}

              {/* And one row waiting, always — a set you have to ask for is a
                  tap between you and the thing you came here to do. */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground w-4 shrink-0">
                  {g.sets.length + 1}
                </span>

                {m.takesLoad && (
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder={unit}
                    value={d.weight}
                    onChange={(e) => patch(m.id, { weight: e.target.value })}
                    className="h-10"
                    aria-label={`Weight, set ${g.sets.length + 1}`}
                  />
                )}

                {duration ? (
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder={asMinutes ? "mins" : "secs"}
                    value={d.seconds}
                    onChange={(e) => patch(m.id, { seconds: e.target.value })}
                    className="h-10"
                    aria-label={asMinutes ? "Minutes" : "Seconds"}
                  />
                ) : (
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="reps"
                    value={d.reps}
                    onChange={(e) => patch(m.id, { reps: e.target.value })}
                    className="h-10"
                    aria-label="Reps"
                  />
                )}

                <Button
                  size="sm"
                  onClick={() => commit(g)}
                  disabled={logSet.isPending}
                  className="shrink-0 h-10 w-10 p-0"
                  aria-label="Log this set"
                  data-testid={`log-set-${m.id}`}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

        <Button variant="outline" className="w-full" onClick={() => setPicking(true)} data-testid="add-movement">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add a movement
        </Button>
      </div>

      {/* ── Ending it ── */}
      <div className="shrink-0 px-4 py-3 pb-safe border-t border-border/40 space-y-2.5">
        <button
          onClick={() => setShareWithCoach((v) => !v)}
          className="flex items-center gap-2.5 w-full text-left tap-clean"
          data-testid="share-with-coach"
        >
          <span
            className={cn(
              "h-4 w-4 rounded border grid place-items-center shrink-0 transition-colors",
              shareWithCoach
                ? "bg-[hsl(var(--gold))]/20 border-[hsl(var(--gold))]/50"
                : "border-border",
            )}
          >
            {shareWithCoach && <Check className="h-3 w-3 text-[hsl(var(--gold))]" />}
          </span>
          <span className="text-xs text-muted-foreground">
            <Send className="h-3 w-3 inline mr-1" />
            Send to your coach when you finish
          </span>
        </button>

        <div className="flex items-center justify-between gap-3">
          {/*
            Without this a session started by accident is permanent — the
            partial unique index means that stray row blocks every subsequent
            start. Confirmed, because it deletes the sets, and worded as what
            it is rather than as "Are you sure?".
          */}
          <button
            onClick={() => {
              if (discard.isPending || discardSent.current) return;
              if (!confirmDiscard) {
                setConfirmDiscard(true);
                return;
              }
              discardSent.current = true;
              discard.mutate();
            }}
            disabled={discard.isPending}
            className="text-xs text-muted-foreground/70 tap-clean"
            data-testid="button-discard-session"
          >
            {confirmDiscard
              ? total > 0
                ? `Discard ${total} ${total === 1 ? "set" : "sets"} — tap again`
                : "Discard — tap again"
              : "Discard"}
          </button>

          <p className="text-[11px] text-muted-foreground text-right">
            {total === 0 ? "Log a set before finishing." : "Collapse and it keeps running."}
          </p>
        </div>
      </div>
    </Layer>
  );
}

/**
 * Saved — and now, if they want, said out loud.
 *
 * Its own component, outside the session's lifetime, because the session it is
 * about has deliberately just stopped existing. Held until the member presses
 * Done: a background refetch must not be able to take this screen away while
 * somebody is deciding whether to post their workout to the room.
 *
 * Sharing with a coach is part of the arrangement they signed up for and
 * happens on finish. Telling forty other people is a decision, and one people
 * make after they see what they actually did — so it is offered here rather
 * than as another checkbox to consider mid-workout.
 */
function Logged() {
  const { justFinished, setJustFinished, collapse } = useWorkoutSheet();
  const { toast } = useToast();
  const qc = useQueryClient();
  const done = justFinished!;

  const share = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/training/sessions/${done.id}/share`, {}),
    onSuccess: () => {
      setJustFinished({ ...done, shared: true });
      qc.invalidateQueries({ queryKey: ["/api/community/messages"] });
      toast({ title: "Posted to the room." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Layer>
      <div className="flex-1 grid place-items-center px-6">
        <div className="w-full max-w-sm space-y-5 text-center">
          <div className="space-y-1">
            <p className="font-display text-2xl">Logged</p>
            <p className="text-sm text-muted-foreground">
              {done.sets} {done.sets === 1 ? "set" : "sets"} saved.
            </p>
          </div>

          {done.shared ? (
            <p className="text-sm text-[hsl(var(--gold))]">It's in the room.</p>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => share.mutate()}
              disabled={share.isPending}
              data-testid="share-to-room"
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              {share.isPending ? "Posting…" : "Share it with the room"}
            </Button>
          )}

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => {
              setJustFinished(null);
              collapse();
            }}
            data-testid="logged-done"
          >
            Done
          </Button>
        </div>
      </div>
    </Layer>
  );
}

/**
 * The full-screen ground the workout stands on.
 *
 * Opaque and above everything, including the portal header and the bottom nav
 * — which is how the nav "disappears" without every other screen having to
 * know a workout is running.
 */
function Layer({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[10001] bg-background flex flex-col pt-safe"
      data-testid="workout-sheet"
    >
      {children}
    </div>
  );
}
