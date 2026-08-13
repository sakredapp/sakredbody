/**
 * "Nick asked how you're doing."
 *
 * ── Absence of state is absence of UI ─────────────────────────────────────
 *
 * No coach, no open request, or a request already answered — this renders
 * nothing at all. Not "no check-ins requested", not a greyed-out card. Most
 * people using Sakred have no coach, and their Today should not carry a row of
 * modules explaining the features they don't have. Somebody self-guided ought to
 * be barely aware this machinery exists.
 *
 * ── It is the same check-in ───────────────────────────────────────────────
 *
 * The questions are the seven canonical terrain signals, and the answer becomes
 * the same row Restore writes. This is a door, not a second questionnaire — and
 * the self-guided check-in in Restore stays exactly where it was, for everyone,
 * coached or not.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  TERRAIN_SIGNALS,
  type TerrainSignalId,
} from "@shared/models/terrainSignals";
import { CHECKIN_KIND_META, type CheckinKind } from "@shared/models/checkinRequests";

type OpenRequest = {
  id: string;
  kind: CheckinKind;
  coachPrompt: string | null;
  dueOn: string | null;
  coachName: string;
};

export function useOpenCheckinRequest() {
  return useQuery<OpenRequest[]>({
    queryKey: ["/api/coaching/checkin-requests"],
    queryFn: async () => {
      const res = await fetch("/api/coaching/checkin-requests", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
}

/**
 * Which signals this kind of request is asking about.
 *
 * An open reflection asks none — it is one prompt and their own words, which is
 * a real thing a coach wants and which the `note` column has always held.
 */
function signalsFor(kind: CheckinKind): TerrainSignalId[] {
  const wanted = CHECKIN_KIND_META[kind]?.signals ?? [];
  return TERRAIN_SIGNALS.filter((s) => wanted.includes(s.id)).map((s) => s.id);
}

export function CheckinRequestCard() {
  const { data } = useOpenCheckinRequest();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Partial<Record<TerrainSignalId, number>>>({});
  const [note, setNote] = useState("");

  const request = data?.[0] ?? null;

  const complete = useMutation({
    mutationFn: async () => {
      if (!request) return;
      return (
        await apiRequest("POST", `/api/coaching/checkin-requests/${request.id}/complete`, {
          ...values,
          note: note.trim() || null,
        })
      ).json();
    },
    onSuccess: () => {
      // The answer is now part of the terrain, so everything reading it moves.
      for (const key of [
        "/api/coaching/checkin-requests",
        "/api/terrain/checkin",
        "/api/terrain/today",
        "/api/today",
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  // Nothing being asked. Nothing on screen.
  if (!request) return null;

  const signals = signalsFor(request.kind);
  const answered = signals.filter((id) => typeof values[id] === "number").length;
  const isReflection = request.kind === "reflection";
  const canSend = isReflection ? note.trim().length > 0 : answered > 0;

  return (
    <section
      className="rounded-xl border border-[hsl(var(--gold))]/12 bg-card/40 p-4 sm:p-5"
      data-testid="checkin-request-card"
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        From {request.coachName}
      </p>

      <p className="text-sm mt-2">
        {request.coachPrompt || `${request.coachName} asked how you're doing.`}
      </p>
      {request.dueOn && (
        // A date, not a deadline. Nothing turns red when it passes — a question
        // somebody asked does not become a failure because of a calendar.
        <p className="text-[11px] text-muted-foreground/60 mt-1">by {request.dueOn}</p>
      )}

      {!open ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => setOpen(true)}
          data-testid="checkin-request-open"
        >
          Check in
        </Button>
      ) : (
        <div className="mt-4 space-y-3">
          {TERRAIN_SIGNALS.filter((s) => signals.includes(s.id)).map((signal) => (
            <div key={signal.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs">{signal.label}</p>
                <p className="text-[10px] text-muted-foreground/60">{signal.question}</p>
              </div>
              <div className="flex gap-1.5 mt-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setValues((v) => ({ ...v, [signal.id]: n }))}
                    className={cn(
                      "h-8 flex-1 rounded-md border text-xs tap-clean transition-colors",
                      values[signal.id] === n
                        ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10"
                        : "border-border/40 text-muted-foreground",
                    )}
                    data-testid={`checkin-${signal.id}-${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-0.5">
                <span>{signal.low}</span>
                <span>{signal.high}</span>
              </div>
            </div>
          ))}

          <div>
            <p className="text-xs mb-1.5">
              {isReflection ? "In your own words" : `Anything ${request.coachName} should know?`}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 1000))}
              rows={isReflection ? 4 : 2}
              className="w-full rounded-md border border-border/40 bg-transparent p-2 text-sm"
              data-testid="checkin-request-note"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!canSend || complete.isPending}
              onClick={() => complete.mutate()}
              data-testid="checkin-request-send"
            >
              {complete.isPending ? "Sending…" : "Send"}
            </Button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground tap-clean"
            >
              Not now
            </button>
          </div>

          {complete.isError && (
            <p className="text-xs text-destructive">
              That didn't send. Your answers are still here — try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
