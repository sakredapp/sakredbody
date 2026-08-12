/**
 * Logging a session nobody prescribed.
 *
 * The prescribed path knows what is coming — four lifts, targets already
 * resolved — so it can render the whole session up front and ask only for
 * numbers. This one cannot: the member is deciding as they go, which is what
 * training on your own actually looks like. So the shape is inverted. Add a
 * movement when you get to it, log sets under it, add the next.
 *
 * Everything written here lands in `workout_sessions` and `workout_sets`, the
 * same tables the prescribed path writes to, with `habit_id` null. Volume, the
 * 1RM estimates, the history screen and anything a coach reads all treat it
 * identically — the only difference is who decided what to do.
 */

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Plus, Check, X, Send, ChevronUp, ChevronDown, Users } from "lucide-react";
import { isPracticeCategory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/portal/Panel";
import { MovementPicker, type Movement } from "./MovementPicker";
import { cn } from "@/lib/utils";

type Row = { weight: string; reps: string; seconds: string; logged: boolean };
type Block = { movement: Movement; rows: Row[] };

const blank = (): Row => ({ weight: "", reps: "", seconds: "", logged: false });

/**
 * What they did last time, and the best they have done.
 *
 * ── Why this belongs on the logging screen ────────────────────────────────
 *
 * The number a member wants at the moment they are about to load a bar is
 * "what did I do last time", and it was two screens away in a history view
 * nobody opens mid-set. Progressive overload is the entire mechanism of the
 * Build half of this product, and it is impossible to apply from memory across
 * eleven movements.
 *
 * The estimates come from `strength.ts`, which already computes them for the
 * history screen and the prescribed weights — this renders them, it does not
 * recompute them, so the two can never disagree about somebody's best.
 *
 * Renders nothing when there is no history. A first-time movement showing
 * "best: —" is a blank where an encouragement should be.
 */
function LastTime({ exerciseId }: { exerciseId: string }) {
  const { data } = useQuery<{
    unit: "kg" | "lb";
    points: { onDate: string; e1rm: number | null; reps: number | null; weight: number | null }[];
    best: number | null;
  }>({
    queryKey: ["/api/training/exercises", exerciseId, "history"],
    queryFn: async () => {
      const r = await fetch(`/api/training/exercises/${exerciseId}/history`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("history");
      return r.json();
    },
    // A session's worth of sets does not change what happened last week.
    staleTime: 10 * 60 * 1000,
  });

  const last = data?.points?.length ? data.points[data.points.length - 1] : null;
  if (!last) return null;

  const parts: string[] = [];
  if (last.weight != null && last.reps != null) {
    parts.push(`${last.weight}${data!.unit} × ${last.reps}`);
  } else if (last.reps != null) {
    parts.push(`${last.reps} reps`);
  }

  // The best is only worth saying when it is not simply today's number again.
  const isBest =
    data?.best != null && last.e1rm != null && Math.abs(data.best - last.e1rm) < 0.5;

  return (
    <p className="text-[11px] text-muted-foreground" data-testid={`last-time-${exerciseId}`}>
      Last time {last.onDate.slice(5)}
      {parts.length ? ` · ${parts[0]}` : ""}
      {data?.best != null && !isBest && (
        <span className="text-[hsl(var(--gold))]/70"> · best {data.best}{data.unit}</span>
      )}
      {isBest && <span className="text-[hsl(var(--gold))]/70"> · your best</span>}
    </p>
  );
}

export function FreeSession({
  sessionId,
  title,
  unit,
  onDone,
}: {
  sessionId: string;
  title: string;
  unit: "kg" | "lb";
  onDone: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [blocks, setBlocks] = useState<Block[]>([]);
  /**
   * The picker opens when somebody asks for it, never on arrival.
   *
   * This used to open itself on an empty session — `blocks.length === 0`,
   * which on mount is always true. The intent was helpful: an empty session
   * needs a movement, so offer the list. What it actually did was put a modal
   * in front of the screen every single time the Build tab was opened, before
   * the member had said they wanted to log anything at all.
   *
   * A dialog nobody asked for is a dialog to dismiss. The empty state below
   * already carries the button, and pressing it is one tap.
   */
  const [picking, setPicking] = useState(false);
  const [shareWithCoach, setShareWithCoach] = useState(true);
  /**
   * Offered after the fact, never before.
   *
   * Telling a coach is part of the arrangement somebody signed up for. Telling
   * forty other people is a decision, and one people make after they see what
   * they actually did — so it appears once the session is saved rather than as
   * another checkbox to consider mid-workout.
   */
  const [finished, setFinished] = useState(false);
  const [shared, setShared] = useState(false);

  const logSet = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiRequest("POST", `/api/training/sessions/${sessionId}/sets`, body),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createMovement = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/training/exercises", {
        name,
        category: "full_body",
      });
      return (await res.json()) as Movement;
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["/api/training/exercises"] });
      addMovement(m);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const finish = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/training/sessions/${sessionId}/finish`, {
        title,
        shareWithCoach,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/training/today"] });
      toast({
        title: "Session logged.",
        description: shareWithCoach ? "Your coach can see it." : undefined,
      });
      // Held open on purpose so the room offer has somewhere to appear. The
      // session is saved either way; this is the one screen where "and tell
      // people" is a natural next thought.
      setFinished(true);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const shareToRoom = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/training/sessions/${sessionId}/share`, {}),
    onSuccess: () => {
      setShared(true);
      qc.invalidateQueries({ queryKey: ["/api/community/messages"] });
      toast({ title: "Posted to the room." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  /** Swap a movement with its neighbour. Order is how people actually train. */
  const move = (bi: number, by: -1 | 1) =>
    setBlocks((prev) => {
      const to = bi + by;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[bi], next[to]] = [next[to], next[bi]];
      return next;
    });

  const addMovement = (m: Movement) => {
    setBlocks((prev) =>
      prev.some((b) => b.movement.id === m.id) ? prev : [...prev, { movement: m, rows: [blank()] }],
    );
    setPicking(false);
  };

  const patch = (bi: number, ri: number, p: Partial<Row>) =>
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === bi ? { ...b, rows: b.rows.map((r, n) => (n === ri ? { ...r, ...p } : r)) } : b,
      ),
    );

  const logged = blocks.reduce((n, b) => n + b.rows.filter((r) => r.logged).length, 0);

  const commit = async (bi: number, ri: number) => {
    const b = blocks[bi];
    const r = b.rows[ri];
    const body: Record<string, unknown> = { exerciseId: b.movement.id, setIndex: ri + 1 };

    if (b.movement.trackingType === "duration") {
      // A hold is seconds and a class is minutes. Asking for "3000 secs" of
      // Reformer Pilates is the kind of unit that gets typed wrong once and
      // then sits in the history forever.
      const entered = Number(r.seconds);
      if (!entered) return toast({ title: "How long?", variant: "destructive" });
      body.durationSeconds = isPracticeCategory(b.movement.category)
        ? Math.round(entered * 60)
        : entered;
    } else {
      const reps = Number(r.reps);
      if (!reps) return toast({ title: "How many reps?", variant: "destructive" });
      body.reps = reps;
    }
    if (b.movement.takesLoad && r.weight) body.weight = Number(r.weight);

    await logSet.mutateAsync(body);
    patch(bi, ri, { logged: true });
    // A logged set almost always means another is coming; adding the next row
    // saves a tap on every set of every workout. A practice is the exception —
    // nobody does a second forty-five-minute yoga class.
    if (isPracticeCategory(b.movement.category)) return;
    setBlocks((prev) =>
      prev.map((blk, i) =>
        i === bi && ri === blk.rows.length - 1 ? { ...blk, rows: [...blk.rows, blank()] } : blk,
      ),
    );
  };

  /**
   * Saved — and now, if they want, said out loud.
   *
   * The whole screen collapses to this rather than sitting underneath the
   * session, because the session is over and leaving the log on screen invites
   * somebody to keep adding sets to a workout that has been finished.
   */
  if (finished) {
    return (
      <Panel title="Logged">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {logged} {logged === 1 ? "set" : "sets"} saved
            {shareWithCoach ? ", and your coach can see it" : ""}.
          </p>

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

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onDone}>
            Done
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title={title}>
        <div className="space-y-4">
          {blocks.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add what you're doing as you go.
            </p>
          )}

          {blocks.map((b, bi) => (
            <div key={b.movement.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-medium truncate">{b.movement.name}</p>
                    {b.movement.unilateral && (
                      <span className="text-[10px] text-muted-foreground shrink-0">per side</span>
                    )}
                  </div>
                  <LastTime exerciseId={b.movement.id} />
                </div>

                {/* Order is how people actually train — supersets adjacent, the
                    heavy thing first. Only shown once there is something to
                    reorder against. */}
                {blocks.length > 1 && (
                  <div className="flex shrink-0">
                    <button
                      onClick={() => move(bi, -1)}
                      disabled={bi === 0}
                      className="h-7 w-7 grid place-items-center text-muted-foreground disabled:opacity-25 tap-clean"
                      aria-label={`Move ${b.movement.name} up`}
                      data-testid={`move-up-${b.movement.id}`}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => move(bi, 1)}
                      disabled={bi === blocks.length - 1}
                      className="h-7 w-7 grid place-items-center text-muted-foreground disabled:opacity-25 tap-clean"
                      aria-label={`Move ${b.movement.name} down`}
                      data-testid={`move-down-${b.movement.id}`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {b.rows.map((r, ri) => (
                <div key={ri} className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground w-4 shrink-0">{ri + 1}</span>

                  {b.movement.takesLoad && (
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder={unit}
                      value={r.weight}
                      onChange={(e) => patch(bi, ri, { weight: e.target.value })}
                      disabled={r.logged}
                      className="h-9 text-sm"
                      aria-label={`Weight, set ${ri + 1}`}
                    />
                  )}

                  {b.movement.trackingType === "duration" ? (
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder={isPracticeCategory(b.movement.category) ? "mins" : "secs"}
                      value={r.seconds}
                      onChange={(e) => patch(bi, ri, { seconds: e.target.value })}
                      disabled={r.logged}
                      className="h-9 text-sm"
                      aria-label={
                        isPracticeCategory(b.movement.category)
                          ? `Minutes, set ${ri + 1}`
                          : `Seconds, set ${ri + 1}`
                      }
                    />
                  ) : (
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="reps"
                      value={r.reps}
                      onChange={(e) => patch(bi, ri, { reps: e.target.value })}
                      disabled={r.logged}
                      className="h-9 text-sm"
                      aria-label={`Reps, set ${ri + 1}`}
                    />
                  )}

                  <Button
                    size="sm"
                    variant={r.logged ? "ghost" : "default"}
                    onClick={() => !r.logged && commit(bi, ri)}
                    disabled={r.logged || logSet.isPending}
                    className="shrink-0 h-9 w-9 p-0"
                    aria-label={r.logged ? "Logged" : "Log this set"}
                    data-testid={`log-set-${b.movement.id}-${ri}`}
                  >
                    <Check
                      className={cn("h-4 w-4", r.logged && "text-[hsl(var(--gold))]")}
                    />
                  </Button>
                </div>
              ))}
            </div>
          ))}

          <Button variant="outline" className="w-full" onClick={() => setPicking(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add a movement
          </Button>
        </div>
      </Panel>

      {/* ── Finish ──
          Sharing is on by default and stated, not hidden. The whole reason a
          coach is in this product is to see what somebody actually did, and a
          member who does not want a particular session seen can say so here
          rather than having to remember a setting elsewhere. */}
      <Panel>
        <div className="space-y-3">
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
            <span className="text-xs">
              <Send className="h-3 w-3 inline mr-1 text-muted-foreground" />
              Send to your coach when you finish
            </span>
          </button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={onDone} className="flex-1 text-muted-foreground">
              Leave it open
            </Button>
            <Button
              onClick={() => finish.mutate()}
              disabled={logged === 0 || finish.isPending}
              className="flex-1"
              data-testid="finish-free-session"
            >
              {finish.isPending ? "Saving…" : `Finish — ${logged} set${logged === 1 ? "" : "s"}`}
            </Button>
          </div>
          {logged === 0 && (
            <p className="text-[11px] text-muted-foreground text-center">
              Log a set first. Nothing is lost if you leave — the session stays open.
            </p>
          )}
        </div>
      </Panel>

      <Dialog open={picking} onOpenChange={(o) => !o && setPicking(false)}>
        <DialogContent className="max-w-md max-h-[88svh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-display text-xl">Add a movement</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col">
            <MovementPicker
              picked={new Set(blocks.map((b) => b.movement.id))}
              onPick={addMovement}
              onCreate={(n) => n && createMovement.mutate(n)}
              onClose={() => setPicking(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
