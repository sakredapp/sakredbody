/**
 * Asking a client how they are actually doing.
 *
 * ── What a coach is looking at here ───────────────────────────────────────
 *
 * Two things that are easy to conflate and must not be:
 *
 *   Request completed 2:03 PM      — when she answered him
 *   Today's check-in · updated 6:14 PM — what she currently says
 *
 * There is one check-in per day and she may revise it. Printing "Sarah answered
 * at 2:03 PM" above values she edited at 6:14 PM would be a coach reading a body
 * state she has since corrected, with a timestamp vouching for it. So the two
 * facts are shown separately and neither borrows the other's time.
 *
 * ── No status board ───────────────────────────────────────────────────────
 *
 * Nothing here scores a client on responsiveness, and an overdue request is not
 * red. A coach asked a question; a person has a life. Turning that into a
 * compliance signal is how a coaching tool becomes a monitoring station.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { TERRAIN_SIGNALS, type TerrainSignalId } from "@shared/models/terrainSignals";
import {
  CHECKIN_KINDS,
  CHECKIN_KIND_META,
  type CheckinKind,
} from "@shared/models/checkinRequests";

type RequestRow = {
  id: string;
  kind: CheckinKind;
  status: "open" | "completed" | "cancelled";
  coachPrompt: string | null;
  requestedAt: string;
  dueOn: string | null;
  completedAt: string | null;
  currentCheckin: ({ id: string; onDate: string; note: string | null; updatedAt: string } & Partial<
    Record<TerrainSignalId, number | null>
  >) | null;
};

function time(v: string | null): string {
  if (!v) return "";
  return new Date(v).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CheckinRequests({ memberId, memberName }: { memberId: string; memberName: string }) {
  const qc = useQueryClient();
  const key = [`/api/coach/clients/${memberId}/checkin-requests`];
  const { data, isLoading } = useQuery<RequestRow[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(key[0], { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [asking, setAsking] = useState(false);
  const [kind, setKind] = useState<CheckinKind>("quick");
  const [prompt, setPrompt] = useState("");
  const [due, setDue] = useState("");

  const ask = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", `/api/coach/clients/${memberId}/checkin-requests`, {
          kind,
          coachPrompt: prompt.trim() || null,
          dueOn: due || null,
        })
      ).json(),
    onSuccess: () => {
      setAsking(false);
      setPrompt("");
      setDue("");
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/coach/checkin-requests/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const rows = data ?? [];
  const open = rows.find((r) => r.status === "open") ?? null;
  const past = rows.filter((r) => r.status !== "open").slice(0, 5);

  return (
    <div className="space-y-3">
      {open ? (
        <div className="rounded-lg border border-border/30 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm">{CHECKIN_KIND_META[open.kind].label}</p>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              Awaiting reply
            </span>
          </div>
          {open.coachPrompt && (
            <p className="text-xs text-muted-foreground mt-1">"{open.coachPrompt}"</p>
          )}
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Asked {time(open.requestedAt)}
            {open.dueOn && ` · by ${open.dueOn}`}
          </p>
          <button
            onClick={() => cancel.mutate(open.id)}
            disabled={cancel.isPending}
            className="text-[11px] text-muted-foreground hover:text-foreground tap-clean mt-2"
            data-testid="checkin-request-cancel"
          >
            Withdraw
          </button>
        </div>
      ) : asking ? (
        <div className="rounded-lg border border-border/30 p-3 space-y-3">
          <div className="space-y-1.5">
            {CHECKIN_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "w-full rounded-md border p-2 text-left tap-clean transition-colors",
                  kind === k ? "border-[hsl(var(--gold))]" : "border-border/40",
                )}
                data-testid={`checkin-kind-${k}`}
              >
                <p className="text-sm">{CHECKIN_KIND_META[k].label}</p>
                <p className="text-[11px] text-muted-foreground">{CHECKIN_KIND_META[k].blurb}</p>
              </button>
            ))}
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground mb-1">
              Note to {memberName} — they will see this
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Give me a quick read before tomorrow's session."
              className="w-full rounded-md border border-border/40 bg-transparent p-2 text-base md:text-sm"
              data-testid="checkin-request-prompt"
            />
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground mb-1">By (optional)</p>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded-md border border-border/40 bg-transparent p-2 text-base md:text-sm"
              data-testid="checkin-request-due"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={ask.isPending}
              onClick={() => ask.mutate()}
              data-testid="checkin-request-send"
            >
              {ask.isPending ? "Sending…" : "Send request"}
            </Button>
            <button
              onClick={() => setAsking(false)}
              className="text-xs text-muted-foreground tap-clean"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAsking(true)}
          disabled={isLoading}
          data-testid="checkin-request-new"
        >
          Request check-in
        </Button>
      )}

      {past.length > 0 && (
        <div className="space-y-2 pt-1">
          {past.map((r) => (
            <div key={r.id} className="border-t border-border/20 pt-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs">{CHECKIN_KIND_META[r.kind].label}</p>
                <span className="text-[10px] text-muted-foreground/60">
                  {r.status === "completed"
                    ? `Completed ${time(r.completedAt)}`
                    : "Withdrawn"}
                </span>
              </div>

              {r.currentCheckin && (
                <div className="mt-1.5">
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {TERRAIN_SIGNALS.filter((s) => typeof r.currentCheckin![s.id] === "number").map(
                      (s) => (
                        <span key={s.id} className="text-xs text-muted-foreground">
                          {s.label} {r.currentCheckin![s.id]}/5
                        </span>
                      ),
                    )}
                  </div>
                  {r.currentCheckin.note && (
                    <p className="text-xs mt-1">"{r.currentCheckin.note}"</p>
                  )}
                  {/*
                    The row's own time, never the completion time. These values
                    are what she currently says, which may not be what she said
                    when she answered him.
                  */}
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    Their {r.currentCheckin.onDate} check-in · updated{" "}
                    {time(r.currentCheckin.updatedAt)}
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
