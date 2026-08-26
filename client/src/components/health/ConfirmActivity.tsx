/**
 * Sakred saw this, but you know something the sensor doesn't.
 *
 * ── Three truths, kept visibly apart ──────────────────────────────────────
 *
 * The card shows what the platform said, what Sakred makes of it, and — once
 * they answer — what the member added, each under its own heading. That
 * separation is not decoration: it is the same rule the database enforces,
 * made visible. A member can say a hard session was restorative in intent
 * without that erasing what it cost, and seeing "Sakred reads this as Build ·
 * Strength" beside "Your detail: Back" is how they can tell those are two
 * different claims rather than one being overwritten.
 *
 * ── Never a queue ────────────────────────────────────────────────────────
 *
 * One card, and only when the answer would change what Sakred can say
 * tomorrow. The server decides which — see the confirm endpoint — and shows
 * nothing at all once anything has been answered that day. A member with five
 * unreviewed imports is not handed a backlog; they are asked one question, and
 * the rest stay editable from history.
 *
 * Nothing is mandatory. Confirm on its own is a complete answer.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { WORKOUT_FOCUSES } from "@shared/models/health";

import { cn } from "@/lib/utils";
import { categoryLabel, healthActivityLabel, WORKOUT_FOCUS_LABEL } from "@shared/models/labels";

type Candidate = {
  id: string;
  workoutType: string | null;
  onDate: string;
  durationSeconds: number | null;
  sourceApp: string | null;
  category: string | null;
};

const ORIENTATIONS = [
  { id: "build", label: "Build" },
  { id: "restore", label: "Restore" },
  { id: "both", label: "Both" },
] as const;

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs tap-clean transition-colors",
        on
          ? "border-[hsl(var(--gold))]/60 bg-[hsl(var(--gold))]/10 text-foreground"
          : "border-border/60 text-muted-foreground",
      )}
      aria-pressed={on}
    >
      {children}
    </button>
  );
}

/** "Yesterday · 54 min", from the two facts the platform actually gave us. */
function when(onDate: string, seconds: number | null): string {
  const day = new Date(`${onDate}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (seconds == null) return day;
  return `${day} · ${Math.round(seconds / 60)} min`;
}

export const CONFIRM_KEY = ["/api/health/workouts/confirm"] as const;

/**
 * The query lives out here and the answering lives inside, keyed by workout id.
 *
 * That `key` is the whole reason for the split. Everything the member types —
 * which chips are lit, what they named it, whether the detail form is even open
 * — is state about *one* session. When the card becomes a different session,
 * React must throw that state away rather than hand it to the next workout.
 *
 * It did not, once. A member answered one strength session, the card was
 * replaced by another, and their selections came along for the ride looking
 * exactly like the screen they had just filled in. They pressed Save again, and
 * a session they had never described acquired the previous one's name. A key is
 * the cheapest possible guarantee that cannot happen again.
 */
export function ConfirmActivity() {
  const { data } = useQuery<{ workout: Candidate | null }>({
    queryKey: CONFIRM_KEY,
    staleTime: 60_000,
  });
  const w = data?.workout;
  if (!w) return null;
  return <Answer key={w.id} w={w} />;
}

function Answer({ w }: { w: Candidate }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [done, setDone] = useState(false);

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/health/workouts/${w.id}`, body),
    /**
     * Say so, *then* stand down.
     *
     * Invalidating here would be correct and invisible: the refetch removes the
     * card within a frame or two, so the member sees a form vanish and has no
     * way to tell that from a crash. The acknowledgement is held for a beat
     * first, and only then does the card go — the disappearance becomes the
     * end of a sentence rather than the whole of it.
     */
    onSuccess: () => setDone(true),
  });

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      qc.invalidateQueries({ queryKey: CONFIRM_KEY });
      qc.invalidateQueries({ queryKey: ["/api/terrain/today"] });
    }, 1400);
    return () => clearTimeout(t);
  }, [done, qc]);

  /*
    No `|| w.workoutType`. That fallback is how "Functionalstrengthtraining"
    reached a member's phone: an unrecognised identifier was printed verbatim
    rather than admitted to. "A session" is true about every workout.
  */
  const name = healthActivityLabel(w.workoutType) ?? "A session";

  /** The whole card becomes the receipt. Nothing else is left to press. */
  if (done) {
    return (
      <div
        className="rounded-2xl border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/[0.04] p-4"
        data-testid="confirm-activity-saved"
      >
        <p className="text-sm">Activity updated</p>
        <p className="text-xs text-muted-foreground mt-1">
          {name} · {when(w.onDate, w.durationSeconds)}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-3"
      data-testid="confirm-activity"
    >
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Confirm activity
        </p>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          {when(w.onDate, w.durationSeconds)}
          {w.sourceApp ? ` · imported from ${w.sourceApp}` : ""}
        </p>
      </div>

      {/*
        Sakred's reading, stated as Sakred's — never as the member's.

        Through `categoryLabel`, which is the whole point: this line rendered
        `{w.category}` and put "Sakred reads this as full_body." on a member's
        phone. The label map was three lines above it at the time.

        Null when the category is one the registry does not know, and then the
        sentence is not shown at all. A reading Sakred cannot put into words is
        not a reading worth claiming out loud.
      */}
      {categoryLabel(w.category) && (
        <p className="text-xs text-muted-foreground">
          Sakred reads this as{" "}
          <span className="text-foreground">{categoryLabel(w.category)}</span>.
        </p>
      )}

      {!open ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="bg-gold border-gold-border text-white"
            disabled={save.isPending}
            onClick={() => save.mutate({ reviewed: true })}
            data-testid="button-confirm-activity"
          >
            {save.isPending ? "Confirming…" : "Confirm"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-testid="button-add-detail">
            Add detail
          </Button>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">How did this session function?</p>
            <div className="flex flex-wrap gap-2">
              {ORIENTATIONS.map((o) => (
                <Chip
                  key={o.id}
                  on={orientation === o.id}
                  onClick={() => setOrientation(orientation === o.id ? null : o.id)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">What did you train?</p>
            <div className="flex flex-wrap gap-2">
              {WORKOUT_FOCUSES.map((f) => (
                <Chip key={f} on={focus === f} onClick={() => setFocus(focus === f ? null : f)}>
                  {WORKOUT_FOCUS_LABEL[f]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Name it, if useful</p>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Back day"
              maxLength={60}
              className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 text-base md:text-sm"
              data-testid="input-activity-label"
            />
          </div>

          {/* Nothing is required. Saving with none of it set is still a review. */}
          <Button
            size="sm"
            className="bg-gold border-gold-border text-white"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                reviewed: true,
                ...(orientation ? { placement: orientation } : {}),
                ...(focus ? { focus } : {}),
                ...(label.trim() ? { label: label.trim() } : {}),
              })
            }
            data-testid="button-save-detail"
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}

      {/*
        A failure says so and changes nothing else.

        The chips stay lit and the name stays typed, because the member's answer
        is still the best thing on the screen and asking them to reconstruct it
        is a second failure on top of the first. The button has already returned
        to Save; this is the sentence that tells them why.
      */}
      {save.isError && (
        <p className="text-xs text-[hsl(var(--destructive))]" data-testid="confirm-activity-error">
          Couldn't save. Try again.
        </p>
      )}
    </div>
  );
}
