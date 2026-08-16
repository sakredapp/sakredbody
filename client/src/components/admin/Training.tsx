/**
 * Admin — Build.
 *
 * Two things: the movement catalogue, and the session builder that prescribes
 * lifts onto a habit.
 *
 * ── Why the builder walks protocol → session → lifts ──────────────────────
 *
 * Because that is what the data is. A Build session is a habit on a protocol,
 * not an object of its own, which is the decision that let Build inherit
 * enrollment, day windows, Today and streaks without a line of new scheduling
 * code. A flat "workouts" list would hide that and invite somebody to build a
 * session with no protocol to hang it on — which cannot be scheduled and would
 * never reach a member.
 *
 * ── Nobody types a one-rep max ────────────────────────────────────────────
 *
 * The percentage field is a percentage of whatever the member's own logged
 * lifts say their max is. There is deliberately no field anywhere here for a
 * coach to enter somebody's 1RM: it would be stale the week after it was typed
 * and would need maintaining per lift per member forever. Leave the percentage
 * empty and write the intent in the note instead — "top set heavy, back-offs
 * at RPE 7" is a real prescription that does not reduce to a number.
 */

import {
  EXERCISE_CATEGORIES,
  EXERCISE_GROUPS,
  MOVEMENT_PATTERNS,
  EQUIPMENT,
  isPracticeCategory,
} from "@shared/schema";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  Exercise as ExerciseRow,
  HabitExercise as HabitExerciseRow,
} from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { SectionHeading, Panel } from "@/components/portal/Panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MovementPicker, type Movement } from "@/components/build/MovementPicker";
import { Plus, Trash2, ChevronDown, ChevronUp, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Derived from the table, not retyped from it.
 *
 * This was a hand-written interface listing ten of the exercise table's
 * fourteen columns, and the four it left out were exactly the four with no
 * editor: `demoUrl`, `cues`, `sortOrder`, and the tracking fields it did have
 * but only on create. That is not a coincidence — a column absent from the
 * client type cannot be rendered, so the type quietly decides what the admin
 * is capable of, and nothing anywhere reports the omission.
 *
 * `$inferSelect` makes the table the source. A new column shows up here for
 * free and a removed one breaks the build instead of production.
 */
type Exercise = Omit<ExerciseRow, "createdAt"> & { createdAt?: string | null };

/** The prescription row joined with the movement it points at. */
type Prescribed = Omit<HabitExerciseRow, "createdAt"> & {
  createdAt?: string | null;
  name: string;
  equipment: string;
  trackingType: string;
  category: string;
  takesLoad: boolean;
};

/**
 * Read, not retyped.
 *
 * These were three literal arrays here — the fifth and sixth copies of lists
 * that also lived in a zod enum, a Postgres CHECK constraint and the catalogue
 * data. The copy here was the stalest of the lot: it still offered the eight
 * patterns and ten implements from when Build meant barbells, so an admin
 * editing a reformer movement was shown a dropdown that could not represent
 * what it already was, and saving would have silently changed it to a barbell.
 */
const PATTERNS = MOVEMENT_PATTERNS;
const TRACKING = ["reps", "duration", "distance"] as const;
const GROUP_LABEL = new Map(EXERCISE_GROUPS.map((g) => [g.id as string, g.label]));

export function TrainingAdmin() {
  const [view, setView] = useState<"sessions" | "catalogue">("sessions");

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Build"
        subtitle="What gets planned, and the movements it's built from."
      />

      <div className="flex gap-2">
        <Button
          variant={view === "sessions" ? "default" : "outline"}
          onClick={() => setView("sessions")}
          data-testid="button-view-sessions"
        >
          Sessions
        </Button>
        <Button
          variant={view === "catalogue" ? "default" : "outline"}
          onClick={() => setView("catalogue")}
          data-testid="button-view-catalogue"
        >
          Movements
        </Button>
      </div>

      {view === "sessions" ? <SessionBuilder /> : <Catalogue />}
    </div>
  );
}

// ─── The builder ────────────────────────────────────────────────────────────

function SessionBuilder() {
  const [routineId, setRoutineId] = useState("");
  const [habitId, setHabitId] = useState("");

  const routines = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/admin/routines"],
    queryFn: async () => {
      const r = await fetch("/api/admin/routines", { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load protocols");
      return r.json();
    },
  });

  const habits = useQuery<Array<{ id: string; title: string; recommendedTime: string | null }>>({
    queryKey: ["/api/admin/routines", routineId, "habits"],
    enabled: !!routineId,
    queryFn: async () => {
      const r = await fetch(`/api/admin/routines/${routineId}/habits`, { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load that protocol's sessions");
      return r.json();
    },
  });

  const routineList = routines.data ?? [];

  if (routines.isLoading) return <Skeleton className="h-24 w-full" />;

  if (routineList.length === 0) {
    return (
      <Panel>
        <div className="py-10 text-center space-y-2">
          <Dumbbell className="h-6 w-6 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            No protocols yet. A Build session is a habit on a protocol — make one in{" "}
            <span className="text-foreground">Coaching → Routines</span>, add a session
            like "Lower Body Power", then plan its lifts here.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Pick a session">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Protocol</Label>
            <Select
              value={routineId}
              onValueChange={(v) => {
                setRoutineId(v);
                setHabitId("");
              }}
            >
              <SelectTrigger data-testid="select-build-routine">
                <SelectValue placeholder="Which protocol" />
              </SelectTrigger>
              <SelectContent>
                {routineList.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              Session
              <InfoTip label="About sessions" title="A session is a habit">
                Build sessions are habits on a protocol, which is why they schedule,
                appear in Today and count toward streaks without anything extra. Any
                habit can carry lifts.
              </InfoTip>
            </Label>
            <Select value={habitId} onValueChange={setHabitId} disabled={!routineId}>
              <SelectTrigger data-testid="select-build-habit">
                <SelectValue placeholder={routineId ? "Which session" : "Protocol first"} />
              </SelectTrigger>
              <SelectContent>
                {(habits.data ?? []).map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.title}
                    {h.recommendedTime ? ` · ${h.recommendedTime}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Panel>

      {habitId && <Prescription habitId={habitId} />}
    </div>
  );
}

function Prescription({ habitId }: { habitId: string }) {
  const [picking, setPicking] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["/api/admin/habits", habitId, "exercises"];

  const prescribed = useQuery<Prescribed[]>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(`/api/admin/habits/${habitId}/exercises`, { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load the prescription");
      return r.json();
    },
  });

  const list = prescribed.data ?? [];

  const add = useMutation({
    mutationFn: async (m: Movement) => {
      // 4 × 3–5 is the right default for a barbell lift and nonsense for
      // anything else. A held stretch has no rep range, and "4 × 3–5 Reformer
      // Pilates" is not a sentence — a practice is prescribed once and the
      // member says how long it was.
      const practice = isPracticeCategory(m.category);
      const counted = m.trackingType === "reps" && !practice;
      return apiRequest("POST", `/api/admin/habits/${habitId}/exercises`, {
        exerciseId: m.id,
        // Appended. A new lift belongs at the end until somebody moves it —
        // guessing otherwise silently reorders the session.
        orderIndex: list.length,
        targetSets: practice ? 1 : counted ? 4 : 3,
        targetRepsLow: counted ? 3 : null,
        targetRepsHigh: counted ? 5 : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/admin/habit-exercises/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  /**
   * Swap two lifts.
   *
   * Writes both rows, then invalidates once. Renumbering the whole list would
   * be tidier and is worse here: it is N requests where two will do, and a
   * failure halfway through leaves the session in an order nobody chose. A
   * swap touches exactly the two rows whose positions changed.
   */
  const reorder = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const a = list[from];
      const b = list[to];
      if (!a || !b) return;
      await Promise.all([
        apiRequest("PUT", `/api/admin/habit-exercises/${a.id}`, { orderIndex: b.orderIndex }),
        apiRequest("PUT", `/api/admin/habit-exercises/${b.id}`, { orderIndex: a.orderIndex }),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/habit-exercises/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Removed" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const already = new Set(list.map((p) => p.exerciseId));

  return (
    <Panel title="Planned lifts">
      {prescribed.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-4">
          Nothing planned. This session will appear in the member's day as an
          ordinary habit with nothing to open.
        </p>
      ) : (
        <div className="space-y-3 mb-4">
          {list.map((p, i) => (
            <div key={p.id} className="border border-border/50 rounded-lg p-3 space-y-3">
              {/* Order is editable.
                  There was a grip handle here that looked draggable and was
                  decorative — nothing was wired to it, so the order of a
                  session was fixed at whatever order the lifts happened to be
                  added in. Squats after curls is a different session.
                  Buttons rather than drag: this is edited on a phone as often
                  as a desktop, and a four-item list does not need a drag
                  library to reorder. */}
              <div className="flex items-center gap-2">
                <div className="flex flex-col shrink-0">
                  <Button
                    variant="ghost" size="icon" className="h-4 w-5"
                    disabled={i === 0 || reorder.isPending}
                    onClick={() => reorder.mutate({ from: i, to: i - 1 })}
                    aria-label={`Move ${p.name} up`}
                    data-testid={`button-lift-up-${p.id}`}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-4 w-5"
                    disabled={i === list.length - 1 || reorder.isPending}
                    onClick={() => reorder.mutate({ from: i, to: i + 1 })}
                    aria-label={`Move ${p.name} down`}
                    data-testid={`button-lift-down-${p.id}`}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <span className="text-sm flex-1 truncate">{p.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{p.equipment}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => remove.mutate(p.id)}
                  data-testid={`button-unprescribe-${p.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Reps only matter for a movement measured in reps. A plank
                  a planned "4 × 3–5" would be nonsense.

                  A practice has none of these. There is no set count for a
                  yoga class, no rep range, no percentage of a max and no rest
                  interval — the member goes, and afterwards says how long. All
                  that remains worth saying is the note. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-6">
                {isPracticeCategory(p.category) ? (
                  <p className="col-span-2 sm:col-span-4 text-[11px] text-muted-foreground">
                    A practice. They'll log how long it was.
                  </p>
                ) : (
                <>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sets</Label>
                  <Input
                    type="number"
                    defaultValue={p.targetSets}
                    className="h-8"
                    onBlur={(e) =>
                      Number(e.target.value) !== p.targetSets &&
                      save.mutate({ id: p.id, body: { targetSets: Number(e.target.value) } })
                    }
                  />
                </div>

                {p.trackingType === "reps" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Reps from</Label>
                      <Input
                        type="number"
                        defaultValue={p.targetRepsLow ?? ""}
                        className="h-8"
                        onBlur={(e) =>
                          save.mutate({
                            id: p.id,
                            body: { targetRepsLow: e.target.value ? Number(e.target.value) : null },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">to</Label>
                      <Input
                        type="number"
                        defaultValue={p.targetRepsHigh ?? ""}
                        className="h-8"
                        onBlur={(e) =>
                          save.mutate({
                            id: p.id,
                            body: { targetRepsHigh: e.target.value ? Number(e.target.value) : null },
                          })
                        }
                      />
                    </div>
                  </>
                )}

                {/* Only where load is a question at all. A percentage of a
                    couch stretch's one-rep max is not a thing. */}
                {p.takesLoad && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    % max
                    <InfoTip label="About the percentage" title="Of their own numbers">
                      A percentage of what this member's logged lifts say their max is —
                      nobody types a 1RM anywhere. Leave it empty and use the note
                      instead when the intent doesn't reduce to a number.
                    </InfoTip>
                  </Label>
                  <Input
                    type="number"
                    defaultValue={p.targetPercent1rm ?? ""}
                    placeholder="—"
                    className="h-8"
                    onBlur={(e) =>
                      save.mutate({
                        id: p.id,
                        body: { targetPercent1rm: e.target.value ? Number(e.target.value) : null },
                      })
                    }
                  />
                </div>
                )}

                {/* Rest. The column existed and nothing could set it, which on
                    heavy work is not a detail — three minutes between sets of
                    triples and sixty seconds are two different sessions with
                    the same numbers written down. */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Rest (sec)</Label>
                  <Input
                    type="number"
                    defaultValue={p.restSeconds ?? ""}
                    placeholder="—"
                    className="h-8"
                    onBlur={(e) =>
                      save.mutate({
                        id: p.id,
                        body: { restSeconds: e.target.value ? Number(e.target.value) : null },
                      })
                    }
                  />
                </div>
                </>
                )}
              </div>

              <div className="pl-6">
                <Input
                  defaultValue={p.note ?? ""}
                  placeholder="Top set heavy, back-offs at RPE 7"
                  className="h-8 text-base md:text-sm"
                  onBlur={(e) =>
                    e.target.value !== (p.note ?? "") &&
                    save.mutate({ id: p.id, body: { note: e.target.value || null } })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Adding one ──
          This was a <Select> listing the whole catalogue. That worked at
          twenty-five movements and is unusable at six hundred and fifty-seven:
          a coach who wants a Reformer Short Spine has to scroll for it, in
          alphabetical-by-insertion order, with no search.

          It is now the same picker the member uses — same search, same ranking,
          same group and category chips. One picker, both sides: a coach
          prescribing and a member logging are doing the same thing to the same
          catalogue, and the coach should not get the worse tool. */}
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setPicking(true)}
          data-testid="select-add-lift"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add a movement or practice
        </Button>
      </div>

      <Dialog open={picking} onOpenChange={(o) => !o && setPicking(false)}>
        <DialogContent className="max-w-md max-h-[88svh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-display text-xl">Prescribe</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col">
            <MovementPicker
              ignoreModalities
              picked={already}
              placeholder="Search the whole catalogue…"
              onPick={(m) => {
                add.mutate(m);
                setPicking(false);
              }}
              onClose={() => setPicking(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

// ─── The catalogue ──────────────────────────────────────────────────────────

function Catalogue() {
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    pattern: "push",
    equipment: "barbell",
    trackingType: "reps",
    category: "full_body",
    takesLoad: true,
    unilateral: false,
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const catalogue = useQuery<Exercise[]>({
    queryKey: ["/api/admin/exercises"],
    queryFn: async () => {
      const r = await fetch("/api/admin/exercises", { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load movements");
      return r.json();
    },
  });

  const create = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/admin/exercises", {
        ...draft,
        // Slugged from the name: these ids appear in URLs and are referenced
        // by hand in content, so they stay legible rather than becoming uuids.
        id: draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/exercises"] });
      setDraft({
        name: "",
        pattern: "push",
        equipment: "barbell",
        trackingType: "reps",
        category: "full_body",
        takesLoad: true,
        unilateral: false,
      });
      setCreating(false);
      toast({ title: "Movement added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/admin/exercises/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/exercises"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const list = catalogue.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(!creating)} data-testid="button-new-exercise">
          <Plus className="h-4 w-4 mr-1.5" />
          New movement
        </Button>
      </div>

      {creating && (
        <Panel>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Safety Bar Squat"
                data-testid="input-exercise-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                Measured in
                <InfoTip label="About tracking" title="Reps, time or distance">
                  A plank has no reps and a carry has no reps. Choosing wrong here
                  means the member is asked for a number the movement doesn't have.
                </InfoTip>
              </Label>
              <Select value={draft.trackingType} onValueChange={(v) => setDraft({ ...draft, trackingType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRACKING.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pattern</Label>
              <Select value={draft.pattern} onValueChange={(v) => setDraft({ ...draft, pattern: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PATTERNS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                Category
                <InfoTip label="About categories" title="How a member finds it">
                  Pattern is how a coach thinks — hinge, push, carry. Category is how
                  somebody searches: legs, hips, fascia. Both exist because they answer
                  different questions.
                </InfoTip>
              </Label>
              {/* Family named alongside the category. Forty flat labels is a
                  list where "Flows", "Classes" and "Practices" read as three
                  unrelated things rather than three shelves of one cupboard.

                  Choosing a practice category also sets what a practice is:
                  duration, no load. Leaving those to be set separately is how
                  a yoga class ends up in the catalogue asking for kilograms —
                  and nothing downstream would ever have questioned it. */}
              <Select
                value={draft.category}
                onValueChange={(v) =>
                  setDraft(
                    isPracticeCategory(v)
                      ? { ...draft, category: v, trackingType: "duration", takesLoad: false }
                      : { ...draft, category: v },
                  )
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXERCISE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {GROUP_LABEL.get(c.group) ?? c.group} · {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                Takes load
                <InfoTip label="About load" title="Whether weight is even asked">
                  Off for stretches, breathing and most mobility. A couch stretch with a
                  weight box beside it is an app built for something else.
                </InfoTip>
              </Label>
              <Select
                value={draft.takesLoad ? "yes" : "no"}
                onValueChange={(v) => setDraft({ ...draft, takesLoad: v === "yes" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">One side at a time</Label>
              <Select
                value={draft.unilateral ? "yes" : "no"}
                onValueChange={(v) => setDraft({ ...draft, unilateral: v === "yes" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Equipment</Label>
              <Select value={draft.equipment} onValueChange={(v) => setDraft({ ...draft, equipment: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT.map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              onClick={() => create.mutate()}
              disabled={!draft.name.trim() || create.isPending}
              className="bg-gold border-gold-border text-white"
            >
              Create
            </Button>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </Panel>
      )}

      {catalogue.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-2">
          {list.map((e) => (
            <div key={e.id} className="border border-border/60 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpen(open === e.id ? null : e.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors tap-clean"
                data-testid={`exercise-row-${e.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", !e.isActive && "text-muted-foreground line-through")}>
                    {e.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {e.pattern} · {e.equipment.replace("_", " ")}
                    {e.muscleGroups?.length ? ` · ${e.muscleGroups.join(", ")}` : ""}
                  </p>
                </div>
                {e.trackingType !== "reps" && (
                  <Badge variant="outline" className="text-[10px] shrink-0">{e.trackingType}</Badge>
                )}
                {e.bodyweightFactor > 0 && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {e.bodyweightFactor}× BW
                  </Badge>
                )}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                    open === e.id && "rotate-180",
                  )}
                />
              </button>

              {open === e.id && (
                <div className="border-t border-border/60 p-4 space-y-3 bg-muted/20">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Name</Label>
                      <Input
                        defaultValue={e.name}
                        onBlur={(ev) =>
                          ev.target.value !== e.name &&
                          save.mutate({ id: e.id, body: { name: ev.target.value } })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        Bodyweight factor
                        <InfoTip label="About the factor" title="What the body loads">
                          A multiple of bodyweight before any added plates. A pull-up is
                          1, a push-up about 0.64, a barbell squat 0. Without it, twenty
                          pull-ups record as no load at all.
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={e.bodyweightFactor}
                        onBlur={(ev) =>
                          Number(ev.target.value) !== e.bodyweightFactor &&
                          save.mutate({ id: e.id, body: { bodyweightFactor: Number(ev.target.value) } })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Aliases</Label>
                      <Input
                        defaultValue={(e.aliases ?? []).join(", ")}
                        placeholder="bench, bb bench"
                        onBlur={(ev) => {
                          const next = ev.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          if (next.join(",") !== (e.aliases ?? []).join(","))
                            save.mutate({ id: e.id, body: { aliases: next } });
                        }}
                      />
                    </div>
                  </div>

                  {/* ── The three that were create-only ──────────────────────
                      Pattern, equipment and how the movement is measured could
                      be chosen once and never corrected. That is survivable for
                      the first two and not for the third: `trackingType` decides
                      what the member is asked for at the end of a set, so a
                      carry saved as "reps" prompts for a rep count it doesn't
                      have, and the only remedy was editing the row by hand. */}
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Pattern</Label>
                      <Select
                        value={e.pattern}
                        onValueChange={(v) => v !== e.pattern && save.mutate({ id: e.id, body: { pattern: v } })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PATTERNS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Equipment</Label>
                      <Select
                        value={e.equipment}
                        onValueChange={(v) => v !== e.equipment && save.mutate({ id: e.id, body: { equipment: v } })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EQUIPMENT.map((q) => <SelectItem key={q} value={q}>{q.replace("_", " ")}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        Measured in
                        <InfoTip label="About tracking" title="Changing this later">
                          Safe to correct. It changes what the member is asked for on
                          the next set; sets already logged keep the numbers they were
                          recorded with.
                        </InfoTip>
                      </Label>
                      <Select
                        value={e.trackingType}
                        onValueChange={(v) => v !== e.trackingType && save.mutate({ id: e.id, body: { trackingType: v } })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TRACKING.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        Muscle groups
                        <InfoTip label="About muscle groups" title="First one is primary">
                          Shown to the member because "chest, triceps" means something
                          to them and "horizontal push" does not. The row above already
                          displayed these — there was simply nowhere to set them.
                        </InfoTip>
                      </Label>
                      <Input
                        defaultValue={(e.muscleGroups ?? []).join(", ")}
                        placeholder="chest, triceps, front delt"
                        onBlur={(ev) => {
                          const next = ev.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          if (next.join(",") !== (e.muscleGroups ?? []).join(","))
                            save.mutate({ id: e.id, body: { muscleGroups: next.length ? next : null } });
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Demo video URL</Label>
                      <Input
                        defaultValue={e.demoUrl ?? ""}
                        placeholder="https://…"
                        onBlur={(ev) =>
                          ev.target.value !== (e.demoUrl ?? "") &&
                          save.mutate({ id: e.id, body: { demoUrl: ev.target.value.trim() || null } })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Coaching cues</Label>
                    <Textarea
                      defaultValue={e.cues ?? ""}
                      rows={2}
                      className="resize-none"
                      placeholder="Brace before you unrack. Elbows under the bar, not flared."
                      onBlur={(ev) =>
                        ev.target.value !== (e.cues ?? "") &&
                        save.mutate({ id: e.id, body: { cues: ev.target.value.trim() || null } })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={e.isActive}
                        onCheckedChange={(v) => save.mutate({ id: e.id, body: { isActive: v } })}
                      />
                      <Label className="text-xs">Active</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={e.tracksOneRepMax}
                        onCheckedChange={(v) => save.mutate({ id: e.id, body: { tracksOneRepMax: v } })}
                      />
                      <Label className="text-xs flex items-center gap-1.5">
                        Track a max
                        <InfoTip label="About maxes" title="Not for everything">
                          True for the barbell lifts. False for a carry or a run, where an
                          estimated single rep is nonsense.
                        </InfoTip>
                      </Label>
                    </div>
                  </div>

                  {/* No delete. A movement somebody has lifted is refused by the
                      database on purpose — deactivating keeps their history. */}
                  <p className="text-xs text-muted-foreground">
                    Movements aren't deleted — switch Active off instead, so anyone who
                    has lifted it keeps their history.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
