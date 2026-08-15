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
import { ChevronDown, Plus, Check, MoreHorizontal, Users, Send } from "lucide-react";
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
import { cn } from "@/lib/utils";

// ─── Who can open it ────────────────────────────────────────────────────────

type Sheet = {
  expanded: boolean;
  /** Bring the workout to the front. Safe to call when none is running. */
  open: () => void;
  /** Put the app back. Does not touch the session. */
  collapse: () => void;
};

const SheetContext = createContext<Sheet>({
  expanded: false,
  open: () => {},
  collapse: () => {},
});

export const useWorkoutSheet = () => useContext(SheetContext);

export function WorkoutSheetProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const value = useMemo<Sheet>(
    () => ({ expanded, open: () => setExpanded(true), collapse: () => setExpanded(false) }),
    [expanded],
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
  const { expanded, collapse } = useWorkoutSheet();
  const { data } = useOpenWorkout();
  const session = data?.session ?? null;

  /**
   * Nothing running means nothing to show, and the collapsed state is reset so
   * the next workout opens rather than reappearing already put away.
   */
  useEffect(() => {
    if (!session && expanded) collapse();
  }, [session, expanded, collapse]);

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
  const { collapse } = useWorkoutSheet();
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
  const [shareWithCoach, setShareWithCoach] = useState(true);
  const [finished, setFinished] = useState(false);
  const [shared, setShared] = useState(false);

  const logged = session.logged ?? [];

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

  const finish = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/training/sessions/${session.id}/finish`, { shareWithCoach }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/training/today"] });
      qc.invalidateQueries({ queryKey: ["/api/terrain/today"] });
      setFinished(true);
    },
    onError: failed,
  });

  const shareToRoom = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/training/sessions/${session.id}/share`, {}),
    onSuccess: () => {
      setShared(true);
      qc.invalidateQueries({ queryKey: ["/api/community/messages"] });
      toast({ title: "Posted to the room." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
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

  // ── Saved ────────────────────────────────────────────────────────────────

  if (finished) {
    return (
      <Layer>
        <div className="flex-1 grid place-items-center px-6">
          <div className="w-full max-w-sm space-y-5 text-center">
            <div className="space-y-1">
              <p className="font-display text-2xl">Logged</p>
              <p className="text-sm text-muted-foreground">
                {total} {total === 1 ? "set" : "sets"} saved
                {shareWithCoach ? ", and your coach can see it" : ""}.
              </p>
            </div>

            {shared ? (
              <p className="text-sm text-[hsl(var(--gold))]">It's in the room.</p>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => shareToRoom.mutate()}
                disabled={shareToRoom.isPending}
                data-testid="share-to-room"
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                {shareToRoom.isPending ? "Posting…" : "Share it with the room"}
              </Button>
            )}

            <Button variant="ghost" className="w-full text-muted-foreground" onClick={collapse}>
              Done
            </Button>
          </div>
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
          <Button
            size="sm"
            className="bg-gold border-gold-border text-white"
            onClick={() => finish.mutate()}
            disabled={total === 0 || finish.isPending}
            data-testid="finish-workout"
          >
            {finish.isPending ? "Saving…" : "Finish"}
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
                <button
                  onClick={() => {
                    setMenuFor(menuFor === m.id ? null : m.id);
                    setConfirmRemove(null);
                  }}
                  className="h-7 w-7 -mr-1.5 grid place-items-center text-muted-foreground/60 tap-clean shrink-0"
                  aria-label={`Options for ${m.name}`}
                  data-testid={`movement-menu-${m.id}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
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
