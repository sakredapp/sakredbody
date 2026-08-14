/**
 * Logging something you did, rather than something you counted.
 *
 * ── Why this is not the set grid with fewer boxes ─────────────────────────
 *
 * Somebody who has just walked out of a fifty-minute Lagree class has one
 * piece of information: it was fifty minutes of Lagree. They did not count
 * their Bears. Nobody in that room was holding a phone. The same is true of
 * ninety minutes of basketball, an hour on the bike and a yoga class.
 *
 * An app that will only accept a set grid tells all of those people that what
 * they did doesn't count — and then compounds it by having no record of a
 * genuinely demanding day, which is exactly the day that matters most when
 * deciding what tomorrow should be.
 *
 * So: pick it, say how long, done. Three taps, one of which is a number.
 *
 * ── The one optional question ─────────────────────────────────────────────
 *
 * How hard it felt, on Borg's 1–10 category-ratio scale. Optional because
 * most people will skip it, and asked anyway because duration alone cannot
 * distinguish a recovery spin from an interval session, and session RPE ×
 * minutes is the oldest and least contested measure of training load there is
 * (Foster, 1998). It is stored on the set as plain RPE — the same column a
 * heavy triple uses — so nothing downstream needs to learn a new number.
 *
 * Everything written here lands in `workout_sessions` and `workout_sets`
 * alongside prescribed work and self-written lifting. One history.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MovementPicker, type Movement } from "./MovementPicker";
import { cn } from "@/lib/utils";

/** The lengths classes and sessions actually come in. */
const COMMON_MINUTES = [15, 20, 30, 45, 60, 75, 90];

/**
 * Three words, mapped onto the Borg scale.
 *
 * A member is not going to distinguish a 6 from a 7, and pretending they can
 * is how a slider gets dragged to the middle every time. Three honest buckets
 * carry the signal that matters — was this restorative, ordinary, or hard.
 */
const EFFORT = [
  { label: "Easy", rpe: 3, hint: "Could have kept going all day" },
  { label: "Moderate", rpe: 6, hint: "Working, but comfortable" },
  { label: "Hard", rpe: 8.5, hint: "Took something out of me" },
] as const;

export function LogPractice({ onClose, onLogged }: { onClose: () => void; onLogged?: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<Movement | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [shareWithCoach, setShareWithCoach] = useState(true);

  const mins = minutes ?? (custom ? Number(custom) : 0);

  const log = useMutation({
    mutationFn: async () => {
      if (!chosen || !mins) throw new Error("How long was it?");
      /**
       * One call, one transaction.
       *
       * This was three — create, write the set, finish — and a failure between
       * any two left a finished session with nothing in it. Inert, as it turned
       * out, because movementEvents selects FROM workout_sets and an empty
       * session contributes no rows. Inert is not the same as correct: either
       * the practice exists complete or it does not exist.
       */
      const km = Number(distanceKm);
      return apiRequest("POST", "/api/training/practice", {
        exerciseId: chosen.id,
        title: chosen.name,
        durationMinutes: Math.round(mins),
        ...(km > 0 ? { distanceM: km * 1000 } : {}),
        ...(rpe != null ? { rpe } : {}),
        shareWithCoach,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/training/today"] });
      toast({
        title: `${chosen?.name} — ${Math.round(mins)} min`,
        description: shareWithCoach ? "Your coach can see it." : undefined,
      });
      onLogged?.();
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // Distance is offered only where somebody plausibly knows it. Asking a
  // Pilates class for its kilometres is the sort of field that makes an app
  // feel assembled rather than designed.
  const wantsDistance = chosen?.category === "endurance";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88svh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-display text-xl">
            {chosen ? chosen.name : "What did you do?"}
          </DialogTitle>
        </DialogHeader>

        {!chosen ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <MovementPicker
              only="practices"
              placeholder="Pilates, basketball, a bike ride…"
              onPick={(m) => setChosen(m)}
              onClose={onClose}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto scroll-touch space-y-5">
            {/* ── How long ── */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                How long
              </p>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_MINUTES.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMinutes(m);
                      setCustom("");
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs tap-clean transition-colors",
                      minutes === m
                        ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]"
                        : "border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`practice-minutes-${m}`}
                  >
                    {m} min
                  </button>
                ))}
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Other"
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    setMinutes(null);
                  }}
                  className="h-8 w-20 text-xs"
                  aria-label="Minutes"
                />
              </div>
            </div>

            {wantsDistance && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Distance <span className="normal-case tracking-normal">— if you know it</span>
                </p>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="km"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  className="h-9 w-28"
                  aria-label="Distance in kilometres"
                />
              </div>
            )}

            {/* ── How hard ── */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                How hard <span className="normal-case tracking-normal">— optional</span>
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {EFFORT.map((e) => (
                  <button
                    key={e.label}
                    onClick={() => setRpe(rpe === e.rpe ? null : e.rpe)}
                    className={cn(
                      "rounded-xl border px-2 py-2.5 text-center tap-clean transition-colors",
                      rpe === e.rpe
                        ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/15"
                        : "border-border/60",
                    )}
                    data-testid={`practice-effort-${e.label.toLowerCase()}`}
                  >
                    <span
                      className={cn(
                        "block text-xs",
                        rpe === e.rpe ? "text-[hsl(var(--gold))]" : "text-foreground",
                      )}
                    >
                      {e.label}
                    </span>
                    <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {e.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShareWithCoach((v) => !v)}
              className="flex items-center gap-2.5 w-full text-left tap-clean"
              data-testid="practice-share"
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
                Send to your coach
              </span>
            </button>
          </div>
        )}

        {chosen && (
          <div className="shrink-0 flex gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => setChosen(null)}
              className="flex-1 text-muted-foreground"
            >
              Back
            </Button>
            <Button
              onClick={() => log.mutate()}
              disabled={!mins || log.isPending}
              className="flex-1"
              data-testid="practice-log"
            >
              {log.isPending ? "Saving…" : mins ? `Log ${Math.round(mins)} min` : "Log it"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
