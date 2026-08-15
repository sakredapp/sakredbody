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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { WORKOUT_FOCUSES } from "@shared/models/health";
import { activityLabel } from "@shared/models/training";
import { cn } from "@/lib/utils";

type Candidate = {
  id: string;
  workoutType: string | null;
  onDate: string;
  durationSeconds: number | null;
  sourceApp: string | null;
  category: string | null;
};

const FOCUS_LABEL: Record<string, string> = {
  chest: "Chest", back: "Back", legs: "Legs", shoulders: "Shoulders",
  arms: "Arms", core: "Core", full_body: "Full body",
  conditioning: "Conditioning", other: "Other",
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

export function ConfirmActivity() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  const { data } = useQuery<{ workout: Candidate | null }>({
    queryKey: ["/api/health/workouts/confirm"],
    staleTime: 60_000,
  });
  const w = data?.workout;

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/health/workouts/${w!.id}`, body),
    onSuccess: () => {
      // The card goes, and movement history picks up the annotation.
      qc.invalidateQueries({ queryKey: ["/api/health/workouts/confirm"] });
      qc.invalidateQueries({ queryKey: ["/api/terrain/today"] });
    },
  });

  if (!w) return null;

  const name = activityLabel(w.workoutType ?? "") || w.workoutType || "A session";

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

      {/* Sakred's reading, stated as Sakred's — never as the member's. */}
      {w.category && (
        <p className="text-xs text-muted-foreground">
          Sakred reads this as <span className="text-foreground">{w.category}</span>.
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
            Confirm
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
                  {FOCUS_LABEL[f] ?? f}
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
              className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2"
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
    </div>
  );
}
