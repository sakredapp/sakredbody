/**
 * One movement, as it was actually performed.
 *
 * ── What this is for ──────────────────────────────────────────────────────
 *
 * Somebody standing in a gym with a bar in front of them, trying to remember
 * what they did last Tuesday. Not a chart — the progression endpoint already
 * draws that and it answers a different question. This is the sets: the
 * weight, the reps, and the two things they took the trouble to record.
 *
 * ── Nothing is invented ───────────────────────────────────────────────────
 *
 * RPE, failure and set style appear only where they were recorded. Most people
 * will never log an RPE and the row for them says nothing about it rather than
 * showing a middling number they never gave. A warm-up is labelled rather than
 * dropped: the ramp is part of what they did, and every derived reading in the
 * product already knows to skip it.
 */

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SET_STYLE_LABEL, type SetStyle, type WeightUnit } from "@shared/models/training";
import { cn } from "@/lib/utils";

type Set = {
  setIndex: number;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  weight: number | null;
  isWarmup: boolean;
  setStyle: string;
  toFailure: boolean;
  rpe: number | null;
  note: string | null;
};

type Day = {
  onDate: string;
  sessionId: string;
  sessionTitle: string | null;
  sets: Set[];
};

type Result = {
  unit: WeightUnit;
  movement: { id: string; name: string; trackingType: string } | null;
  days: Day[];
};

/** "210 × 3", "45 s", "1.2 km" — whichever the movement is actually measured in. */
function measure(set: Set, unit: WeightUnit): string {
  if (set.durationSeconds != null) {
    return set.durationSeconds >= 120
      ? `${Math.round(set.durationSeconds / 60)} min`
      : `${set.durationSeconds} s`;
  }
  if (set.distanceM != null) {
    return set.distanceM >= 1000
      ? `${(set.distanceM / 1000).toFixed(2)} km`
      : `${Math.round(set.distanceM)} m`;
  }
  const reps = set.reps != null ? `× ${set.reps}` : "";
  if (set.weight && set.weight > 0) return `${set.weight} ${unit} ${reps}`.trim();
  return reps || "logged";
}

export function MovementHistory({
  exerciseId,
  name,
  /** Set for a coach reading their client; omitted for a member reading themselves. */
  memberId,
  onClose,
}: {
  exerciseId: string;
  name: string;
  memberId?: string;
  onClose: () => void;
}) {
  const url = memberId
    ? `/api/coach/clients/${memberId}/movements/${encodeURIComponent(exerciseId)}/sets`
    : `/api/training/exercises/${encodeURIComponent(exerciseId)}/sets`;

  const history = useQuery<Result>({
    queryKey: [url],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load that movement");
      return res.json();
    },
  });

  return (
    <div
      className="fixed inset-0 z-[10002] overflow-y-auto bg-background px-5 pb-10 pt-safe"
      data-testid="movement-history"
    >
      <div className="mx-auto max-w-md">
        <div className="sticky top-0 flex items-center gap-3 bg-background py-4">
          <h2 className="font-display text-xl capitalize">
            {history.data?.movement?.name ?? name}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-muted-foreground hover:text-foreground tap-clean"
            data-testid="button-close-movement"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {history.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !history.data?.days.length ? (
          <p className="text-sm text-muted-foreground">
            You haven't logged this one yet.
          </p>
        ) : (
          <ul className="space-y-5">
            {history.data.days.map((day) => (
              <li key={day.sessionId} data-testid={`movement-day-${day.onDate}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{day.onDate}</span>
                  {day.sessionTitle && (
                    <span className="truncate text-[11px] text-muted-foreground/60">
                      {day.sessionTitle}
                    </span>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {day.sets.map((set) => (
                    <li
                      key={set.setIndex}
                      className={cn(
                        "flex items-baseline gap-2 text-sm tabular-nums",
                        set.isWarmup && "text-muted-foreground/60",
                      )}
                    >
                      <span>{measure(set, history.data!.unit)}</span>

                      {/* Only what was actually recorded. */}
                      {set.setStyle !== "normal" && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          {SET_STYLE_LABEL[set.setStyle as SetStyle] ?? set.setStyle}
                        </span>
                      )}
                      {set.toFailure && (
                        <span className="text-[10px] uppercase tracking-wide text-gold/80">
                          failure
                        </span>
                      )}
                      {set.rpe != null && (
                        <span className="ml-auto text-[11px] text-muted-foreground/70">
                          RPE {set.rpe}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {day.sets.some((s) => s.note) && (
                  <ul className="mt-1 space-y-0.5">
                    {day.sets
                      .filter((s) => s.note)
                      .map((s) => (
                        <li key={`n-${s.setIndex}`} className="text-[11px] text-muted-foreground/70">
                          {s.note}
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
