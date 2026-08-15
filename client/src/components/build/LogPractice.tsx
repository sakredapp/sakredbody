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
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WORKOUT_FOCUSES } from "@shared/models/health";
import { activityLabel } from "@shared/models/training";
import { MovementPicker, type Movement } from "./MovementPicker";
import { cn } from "@/lib/utils";

/** The lengths classes and sessions actually come in. */
const COMMON_MINUTES = [15, 20, 30, 45, 60, 75, 90];

const FOCUS_LABEL: Record<string, string> = {
  chest: "Chest", back: "Back", legs: "Legs", shoulders: "Shoulders",
  arms: "Arms", core: "Core", full_body: "Full body",
  conditioning: "Conditioning", other: "Other",
};

/** A local YYYY-MM-DD, N days back. Never UTC — the member's day is theirs. */
function dayBack(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(iso: string): string {
  if (iso === dayBack(0)) return "Today";
  if (iso === dayBack(1)) return "Yesterday";
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** What the server found already imported for that day. */
type Clash = {
  id: string;
  workoutType: string | null;
  durationSeconds: number | null;
  sourceApp: string | null;
  onDate: string;
};

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

export function LogPractice({
  onClose,
  onLogged,
  /**
   * Recording a day that has already gone.
   *
   * ── Why history needs a way in ──────────────────────────────────────────
   *
   * A member could see that Thursday was missing and do nothing about it. The
   * phone was on the bench, the session was at somebody else's gym, the app
   * was closed — and the app's answer was that it did not happen. A history
   * you cannot correct is a history you stop trusting, and every reading built
   * on it inherits the gap.
   *
   * The same three questions as logging today, plus which day, plus the whole
   * catalogue rather than only the practices: "Tuesday was legs" is the case
   * this exists for, and `Leg Session` is now a movement you can name.
   */
  past,
}: {
  onClose: () => void;
  onLogged?: () => void;
  past?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<Movement | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [shareWithCoach, setShareWithCoach] = useState(true);
  const [onDate, setOnDate] = useState(() => dayBack(past ? 1 : 0));
  /** What the server found already imported for this day, if anything. */
  const [clash, setClash] = useState<Clash | null>(null);
  const [clashFocus, setClashFocus] = useState<string | null>(null);

  const mins = minutes ?? (custom ? Number(custom) : 0);

  const log = useMutation<{ clash: Clash } | { saved: true }, Error, boolean | undefined>({
    mutationFn: async (force?: boolean) => {
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
      /**
       * `apiFetch` rather than `apiRequest`, because a 409 here is an answer.
       * The server has found a workout the phone already recorded for that day
       * and is handing it over; flattening that into `Error("409: {…}")` would
       * mean parsing a JSON document back out of an error message.
       */
      const res = await apiFetch("/api/training/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: chosen.id,
          title: chosen.name,
          durationMinutes: Math.round(mins),
          ...(km > 0 ? { distanceM: km * 1000 } : {}),
          ...(rpe != null ? { rpe } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(past ? { onDate } : {}),
          ...(force ? { force: true } : {}),
          shareWithCoach,
        }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as { workout: Clash };
        return { clash: body.workout };
      }
      if (!res.ok) throw new Error((await res.text()) || "Couldn't save that.");
      return { saved: true as const };
    },
    onSuccess: (result) => {
      /**
       * Not a failure — the better record already exists.
       *
       * The imported row carries the real duration, the heart rate and the
       * source; what it lacks is the only thing the member was adding. So the
       * offer is to put the detail on it rather than to charge the same hour to
       * their body twice.
       */
      if ("clash" in result) {
        setClash(result.clash);
        return;
      }
      qc.invalidateQueries({ queryKey: ["/api/training/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/training/today"] });
      qc.invalidateQueries({ queryKey: ["/api/terrain/today"] });
      toast({
        title: `${chosen?.name} — ${Math.round(mins)} min`,
        description: shareWithCoach ? "Your coach can see it." : undefined,
      });
      onLogged?.();
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  /** Put the detail on the workout the phone already recorded. */
  const enrich = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/health/workouts/${clash!.id}`, {
        reviewed: true,
        ...(clashFocus ? { focus: clashFocus } : {}),
        label: chosen?.name ?? "",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/terrain/today"] });
      qc.invalidateQueries({ queryKey: ["/api/health/workouts/confirm"] });
      toast({ title: "Added to what your phone recorded." });
      onLogged?.();
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // Distance is offered only where somebody plausibly knows it. Asking a
  // Pilates class for its kilometres is the sort of field that makes an app
  // feel assembled rather than designed.
  const wantsDistance = chosen?.category === "endurance";

  /**
   * ── Your phone already has this ─────────────────────────────────────────
   *
   * Three claims kept apart, as everywhere else: what the platform recorded,
   * what Sakred makes of it, and what the member is adding. Saving a second
   * session here would charge one hour of training to the body twice — and the
   * imported row is the better record, because it has the real duration and the
   * heart rate. What it lacks is the muscles, which is what the member came to
   * say. So the offer is to put it there.
   *
   * "It was separate" is a real answer and stays available. Two leg sessions in
   * a day is unusual and not impossible, and the member is the one who knows.
   */
  if (clash) {
    const found = activityLabel(clash.workoutType ?? "") || clash.workoutType || "a workout";
    const mins = clash.durationSeconds ? Math.round(clash.durationSeconds / 60) : null;
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md" data-testid="past-activity-clash">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Your phone already recorded this
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 p-3 space-y-0.5">
              <p className="text-sm">{found}</p>
              <p className="text-xs text-muted-foreground">
                {dayLabel(clash.onDate)}
                {mins ? ` · ${mins} min` : ""}
                {clash.sourceApp ? ` · from ${clash.sourceApp}` : ""}
              </p>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              It knows how long and how hard. It doesn't know what you trained.
              Add that to it rather than logging the same session twice.
            </p>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                What did you train?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {WORKOUT_FOCUSES.map((f) => (
                  <button
                    key={f}
                    onClick={() => setClashFocus(clashFocus === f ? null : f)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs tap-clean transition-colors",
                      clashFocus === f
                        ? "border-[hsl(var(--gold))]/60 bg-[hsl(var(--gold))]/10 text-foreground"
                        : "border-border/60 text-muted-foreground",
                    )}
                    data-testid={`clash-focus-${f}`}
                  >
                    {FOCUS_LABEL[f] ?? f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={enrich.isPending}
                onClick={() => enrich.mutate()}
                data-testid="clash-enrich"
              >
                {enrich.isPending ? "Saving…" : "Add it to that"}
              </Button>
              <Button
                variant="ghost"
                className="flex-1 text-muted-foreground"
                disabled={log.isPending}
                onClick={() => {
                  setClash(null);
                  log.mutate(true);
                }}
                data-testid="clash-separate"
              >
                It was separate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88svh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-display text-xl">
            {chosen ? chosen.name : past ? "What did you do?" : "What did you do?"}
          </DialogTitle>
          {past && !chosen && (
            <p className="text-xs text-muted-foreground">
              Something Sakred didn't see. Pick it, say which day.
            </p>
          )}
        </DialogHeader>

        {!chosen ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <MovementPicker
              /* The whole catalogue when filling in a past day: "Tuesday was
                 legs" is the case this exists for, and `Leg Session` is a
                 movement you can name. Today's quick log stays narrow, because
                 counted work belongs in a session you keep open. */
              only={past ? undefined : "practices"}
              placeholder={past ? "Leg Session, Pilates, basketball…" : "Pilates, basketball, a bike ride…"}
              onPick={(m) => setChosen(m)}
              onClose={onClose}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto scroll-touch space-y-5">
            {/* ── Which day ──
                Only when filling in history. Two weeks of chips covers what
                anybody can place from memory, and the field behind them covers
                the rest — the server refuses the future and anything older than
                sixty days, because past that it is not recall, it is a guess. */}
            {past && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Which day
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                    const iso = dayBack(n);
                    return (
                      <button
                        key={iso}
                        onClick={() => setOnDate(iso)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs tap-clean transition-colors",
                          onDate === iso
                            ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]"
                            : "border-border/60 text-muted-foreground",
                        )}
                        data-testid={`past-day-${iso}`}
                      >
                        {dayLabel(iso)}
                      </button>
                    );
                  })}
                </div>
                <Input
                  type="date"
                  value={onDate}
                  max={dayBack(0)}
                  min={dayBack(60)}
                  onChange={(e) => e.target.value && setOnDate(e.target.value)}
                  className="h-9 w-44"
                  aria-label="Date"
                  data-testid="past-date"
                />
              </div>
            )}

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

            {past && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Anything worth remembering{" "}
                  <span className="normal-case tracking-normal">— optional</span>
                </p>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Felt strong. Left knee a bit tight."
                  maxLength={200}
                  data-testid="past-note"
                />
              </div>
            )}

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
              onClick={() => log.mutate(undefined)}
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
