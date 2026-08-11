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
import { Dumbbell, Plus, Play, Pencil, Trash2, X, GripVertical, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/portal/Panel";
import { MovementPicker, type Movement } from "./MovementPicker";
import { LogPractice } from "./LogPractice";
import { RecentSessions } from "./RecentSessions";
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
};

type SavedWorkout = {
  id: string;
  name: string;
  note: string | null;
  exercises: SavedExercise[];
};

/** A movement while it is being composed, before it has been saved. */
type Draft = {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  trackingType: "reps" | "duration" | "distance";
  takesLoad: boolean;
};

export function MemberBuild({ onStarted }: { onStarted: (sessionId: string, title: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [building, setBuilding] = useState<SavedWorkout | "new" | null>(null);
  const [logging, setLogging] = useState(false);

  const workouts = useQuery<SavedWorkout[]>({ queryKey: ["/api/training/workouts"] });

  const startSession = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/training/sessions", { title: title || null });
      return (await res.json()) as { id: string };
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
                const s = await startSession.mutateAsync("");
                onStarted(s.id, "Today's session");
              }}
              disabled={startSession.isPending}
              data-testid="build-start-empty"
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
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={async () => {
                      const s = await startSession.mutateAsync(w.name);
                      onStarted(s.id, w.name);
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(w.id)}
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <RecentSessions />

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
    })) ?? [],
  );

  const createMovement = useMutation({
    mutationFn: async (movementName: string) => {
      const res = await apiRequest("POST", "/api/training/exercises", {
        name: movementName,
        category: "full_body",
      });
      return (await res.json()) as Movement;
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["/api/training/exercises"] });
      add(m);
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
            },
          ],
    );

  const picked = new Set(items.map((i) => i.exerciseId));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88svh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-display text-xl">
            {workout ? "Edit workout" : "Build a workout"}
          </DialogTitle>
        </DialogHeader>

        {picking ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <MovementPicker
              only="movements"
              picked={picked}
              onPick={add}
              onCreate={(n) => n && createMovement.mutate(n)}
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
                      <p className="text-sm truncate">{i.name}</p>
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
                          className="w-11 bg-transparent border border-border/50 rounded px-1.5 py-0.5 text-[11px] text-center"
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
                            className="w-11 bg-transparent border border-border/50 rounded px-1.5 py-0.5 text-[11px] text-center"
                            aria-label="Reps"
                          />
                        )}
                        {i.trackingType === "reps" && (
                          <span className="text-[11px] text-muted-foreground">reps</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, n) => n !== idx))}
                      className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${i.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button variant="outline" className="w-full" onClick={() => setPicking(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add a movement
            </Button>
          </div>
        )}

        {!picking && (
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
