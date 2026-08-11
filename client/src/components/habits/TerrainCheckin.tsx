/**
 * The seven things a person knows that no device does.
 *
 * ── Why it collapses ──────────────────────────────────────────────────────
 *
 * Seven sliders open on a screen somebody visits every morning is seven
 * sliders they stop touching by Thursday. So it opens as one line — what they
 * said today, or an invitation — and expands when they want it.
 *
 * ── Why every question can be skipped ─────────────────────────────────────
 *
 * A form that demands all seven produces sevens. Three honest answers beat
 * seven guessed ones, and a null is a fact — "they didn't say" — where a
 * forced 3 is noise that reads as data.
 *
 * No total, no score, no ring. Seven values, shown as seven values.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Panel } from "@/components/portal/Panel";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { TERRAIN_SIGNALS, type TerrainSignalId } from "@shared/models/terrainSignals";

type Checkin = Partial<Record<TerrainSignalId, number | null>> & {
  onDate?: string;
  empty?: boolean;
};

export function TerrainCheckin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const today = useQuery<Checkin>({
    queryKey: ["/api/terrain/checkin"],
    queryFn: async () => (await apiRequest("GET", "/api/terrain/checkin")).json(),
  });

  const save = useMutation({
    mutationFn: async (v: Partial<Record<TerrainSignalId, number>>) =>
      (await apiRequest("POST", "/api/terrain/checkin", v)).json(),
    // Optimistic would be wrong here: the answer is the point, and showing a
    // value that failed to save is worse than a half-second of nothing.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/terrain/checkin"] }),
  });

  const answered = TERRAIN_SIGNALS.filter(
    (s) => typeof today.data?.[s.id] === "number",
  ).length;

  return (
    <Panel data-testid="terrain-checkin">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        data-testid="terrain-checkin-toggle"
      >
        <div>
          <p className="text-sm">How are you actually doing?</p>
          <p className="text-[11px] text-muted-foreground">
            {answered === 0
              ? "Nothing your watch can tell us. Takes ten seconds."
              : `${answered} of ${TERRAIN_SIGNALS.length} answered today`}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {TERRAIN_SIGNALS.map((signal) => {
            const value = today.data?.[signal.id] ?? null;
            return (
              <div key={signal.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm">{signal.label}</span>
                  <span className="text-[11px] text-muted-foreground">{signal.question}</span>
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={save.isPending}
                      onClick={() => save.mutate({ [signal.id]: n })}
                      aria-label={`${signal.label}: ${n} out of 5`}
                      className={cn(
                        "h-9 flex-1 rounded-md border text-xs transition-colors",
                        value === n
                          ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/15"
                          : "border-muted-foreground/20 text-muted-foreground hover:border-[hsl(var(--gold))]/40",
                      )}
                      data-testid={`terrain-${signal.id}-${n}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{signal.low}</span>
                  <span>{signal.high}</span>
                </div>
              </div>
            );
          })}

          <p className="text-[11px] text-muted-foreground">
            Skip anything you're not sure about. A blank is more useful than a guess.
          </p>

          <Button
            variant="ghost"
            className="w-full text-sm text-muted-foreground"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      )}
    </Panel>
  );
}
