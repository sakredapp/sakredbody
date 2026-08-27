/**
 * Rhythm — yours, and somebody else's.
 *
 * ── Two cards, one engine ─────────────────────────────────────────────────
 *
 * The same estimate underneath, read from two sides. `My Rhythm` speaks to the
 * person whose body it is; `Their Rhythm` speaks to somebody supporting them.
 * Neither is gated on the member's sex — a woman can hold both, and the male
 * case is simply the one where only the second has anything new to say.
 *
 * ── What each card is allowed to claim ────────────────────────────────────
 *
 * This is the part worth being careful about. Sakred holds the member's own
 * sleep, training and check-ins. It holds *nothing* about their partner's,
 * ever, unless the member typed it in — so the partner card either cites what
 * they entered, or an estimate counted from dates they entered, or it asks a
 * better question. Every card names its own basis on the face of it, and the
 * server decides that; this component only renders it.
 *
 * ── Ordering is state, not sex ────────────────────────────────────────────
 *
 * Whichever card has the strongest source leads. A woman tracking a partner's
 * hard month should see that card first if it is the one with something to
 * say, and she will, because the sort reads authority rather than demographics.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Plus, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { RelationalGuidance } from "@shared/models/relating";
import { useToday, type RhythmSubjectView } from "@/components/TodayRead";

type RhythmResponse = {
  date: string;
  subjects: RhythmSubjectView[];
  sex: "male" | "female" | null;
  relationshipStatus: string | null;
};

const AUTHORITY_RANK: Record<string, number> = {
  first_party: 0,
  shared_by_them: 1,
  entered_by_member: 2,
  estimated: 3,
  general: 4,
};

/** The kinds of week somebody can be having. Mirrors RHYTHM_CONTEXT_KINDS. */
const CONTEXTS: { id: string; label: string }[] = [
  { id: "work_stress", label: "Slammed at work" },
  { id: "short_sleep", label: "Slept badly" },
  { id: "training_hard", label: "Training hard" },
  { id: "travel", label: "Travelling" },
  { id: "illness", label: "Unwell" },
  { id: "big_event", label: "Something big coming" },
  { id: "wants_space", label: "Asked for space" },
];

function useRhythm() {
  return useQuery<RhythmResponse>({
    queryKey: ["/api/rhythm"],
    queryFn: async () => {
      const r = await fetch("/api/rhythm", { credentials: "include" });
      if (!r.ok) throw new Error("rhythm");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["/api/rhythm"] });
  // The self subject feeds the day's read, so Today is stale the moment a
  // period is logged.
  queryClient.invalidateQueries({ queryKey: ["/api/today"] });
}

// ─── Guidance, rendered ────────────────────────────────────────────────────

function GuidanceBody({ g }: { g: RelationalGuidance }) {
  const [deep, setDeep] = useState(false);
  return (
    <div className="space-y-2">
      <p className="font-display text-base leading-snug">{g.title}</p>
      <p className="text-[11px] text-muted-foreground leading-snug">{g.detail}</p>
      <p className="text-xs leading-snug">{g.goodMove}</p>
      <p className="text-xs text-gold/80 leading-snug">
        Worth asking: “{g.worthAsking}”
      </p>
      <p className="text-[11px] text-muted-foreground leading-snug">{g.dontAssume}</p>

      {/* The third layer. Nobody has to read it, and it is never what the card
          leads with — see the ordering rule in relating.ts. */}
      {g.physiology && (
        <button
          onClick={() => setDeep((v) => !v)}
          className="text-[11px] text-gold/70 tap-clean"
        >
          {deep ? "Less" : "What's actually happening"}
        </button>
      )}
      {deep && g.physiology && (
        <p className="text-[11px] text-muted-foreground leading-snug border-l border-[hsl(var(--gold))]/20 pl-3">
          {g.physiology}
        </p>
      )}

      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">{g.basis}</p>
    </div>
  );
}

// ─── Their rhythm ──────────────────────────────────────────────────────────

function TheirRhythm({ subject }: { subject: RhythmSubjectView }) {
  const [adding, setAdding] = useState(false);
  const name = subject.label?.trim() || "Them";

  const addContext = useMutation({
    mutationFn: async (contextKind: string) => {
      const r = await fetch(`/api/rhythm/subjects/${subject.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "context_noted", contextKind }),
      });
      if (!r.ok) throw new Error("context");
    },
    onSuccess: () => {
      setAdding(false);
      invalidate();
    },
  });

  const logPeriod = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/rhythm/subjects/${subject.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "period_started" }),
      });
      if (!r.ok) throw new Error("period");
    },
    onSuccess: invalidate,
  });

  return (
    <div
      className="rounded-xl border border-[hsl(var(--gold))]/12 bg-raise p-4 space-y-3"
      data-testid={`rhythm-partner-${subject.id}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {name}
        </p>
        {/* The phase name, hedged by the server according to how it was
            arrived at, and simply absent when it wasn't. */}
        {subject.phaseLabel && (
          <p className="text-[10px] text-gold/70">{subject.phaseLabel}</p>
        )}
      </div>

      {subject.guidance.map((g, i) => (
        <div key={`${g.authority}-${i}`} className={cn(i > 0 && "border-t border-border/30 pt-3")}>
          <GuidanceBody g={g} />
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] rounded-full border border-border/50 px-3 py-1 tap-clean hover:border-[hsl(var(--gold))]/40"
          data-testid="rhythm-add-context"
        >
          What kind of week?
        </button>
        {/* Offered only where it means something. The subject's sex was asked
            outright at setup precisely so this is never a guess. */}
        {subject.subjectSex === "female" && subject.model === "spontaneous_cycle" && (
          <button
            onClick={() => logPeriod.mutate()}
            disabled={logPeriod.isPending}
            className="text-[11px] rounded-full border border-border/50 px-3 py-1 tap-clean hover:border-[hsl(var(--gold))]/40"
          >
            {logPeriod.isSuccess ? "Logged" : "Her period started today"}
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap gap-2">
          {CONTEXTS.map((c) => (
            <button
              key={c.id}
              onClick={() => addContext.mutate(c.id)}
              className={cn(
                "text-[11px] rounded-full px-3 py-1 tap-clean border",
                subject.contexts.includes(c.id)
                  ? "border-[hsl(var(--gold))]/50 text-gold"
                  : "border-border/50 hover:border-[hsl(var(--gold))]/40",
              )}
            >
              {subject.contexts.includes(c.id) && <Check className="h-3 w-3 inline mr-1" />}
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── My rhythm ─────────────────────────────────────────────────────────────

function MyRhythm({ subject }: { subject: RhythmSubjectView }) {
  const logPeriod = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/rhythm/subjects/${subject.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "period_started" }),
      });
      if (!r.ok) throw new Error("period");
    },
    onSuccess: invalidate,
  });

  return (
    <div
      className="rounded-xl border border-[hsl(var(--gold))]/12 bg-raise p-4 space-y-3"
      data-testid="rhythm-self"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">My rhythm</p>
        {subject.phaseLabel && (
          <p className="text-[10px] text-gold/70">
            {subject.phaseLabel}
            {subject.cycleDay ? ` · day ${subject.cycleDay}` : ""}
          </p>
        )}
      </div>

      {subject.guide ? (
        <>
          <p className="font-display text-base leading-snug">{subject.guide.goodMove}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">{subject.guide.summary}</p>
          <p className="text-xs text-gold/80 leading-snug">
            {subject.guide.worthAsking}
          </p>
        </>
      ) : (
        /*
          Everybody has a rhythm. A cycle is one kind.

          This card used to answer a man with "Phases aren't estimated on your
          current setting" — a sentence about a setting, in a feature called My
          Rhythm, that told him nothing about himself. It was the flattening the
          whole design was supposed to avoid, pointed the other way: the model
          was built role-first precisely so the *self* view works for anyone,
          and then the only content written for it was menstrual.

          His rhythm is load, sleep debt and recovery — which the app already
          measures and already reads every morning. So the fallback is not an
          apology, it is the same read the day is built on, said as a pattern
          about him.
        */
        <OwnRhythm />
      )}

      {subject.model === "spontaneous_cycle" && subject.subjectSex === "female" && (
        <button
          onClick={() => logPeriod.mutate()}
          disabled={logPeriod.isPending}
          className="text-[11px] rounded-full border border-border/50 px-3 py-1 tap-clean hover:border-[hsl(var(--gold))]/40"
          data-testid="rhythm-log-period"
        >
          {logPeriod.isSuccess ? "Logged" : "My period started today"}
        </button>
      )}
    </div>
  );
}

/**
 * The rhythm anybody has: how hard the last few days asked, and what today can
 * carry.
 *
 * Reads the same `/api/today` response the rest of the app does, so it cannot
 * disagree with the day's read — and says nothing at all when there is nothing
 * measured, rather than inventing a pattern from one night.
 */
function OwnRhythm() {
  const { data } = useToday();

  if (!data || data.read.confidence === "none") {
    return (
      <p className="text-[11px] text-muted-foreground leading-snug">
        Once sleep and recovery have a few days behind them, this reads how your
        own load and recovery move — and what today can carry.
      </p>
    );
  }

  const level =
    data.read.level === "depleted"
      ? "Asking for less"
      : data.read.level === "primed"
        ? "Room to push"
        : "Steady";

  return (
    <>
      <p className="font-display text-base leading-snug">{level}</p>
      {data.read.reasons.length > 0 ? (
        <ul className="space-y-1">
          {data.read.reasons.map((r) => (
            <li key={r} className="text-[11px] text-muted-foreground leading-snug">
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Nothing is standing out in your sleep, recovery or recent training.
        </p>
      )}
      {/*
        The half of this feature that works for everybody.

        Their own terrain, turned into how it is likely to land on the people
        around them — built entirely from their own measurements, which is what
        lets it be stated plainly rather than hedged. Each card names the signal
        that is actually off, because "your numbers are down" is not something
        anybody can act on and "you'll read neutral as hostile today" is.
      */}
      {data.relating?.map((note, i) => (
        <div key={`${note.title}-${i}`} className="pt-2 space-y-1 border-t border-border/30">
          <p className="text-xs font-medium leading-snug">{note.title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">{note.detail}</p>
          <p className="text-xs leading-snug">{note.goodMove}</p>
          <p className="text-xs text-gold/80 leading-snug">
            Worth asking: “{note.worthAsking}”
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">{note.dontAssume}</p>
        </div>
      ))}
    </>
  );
}

// ─── Setup ─────────────────────────────────────────────────────────────────

/**
 * Asked, never inferred.
 *
 * Sex is a question here rather than a deduction from the member's own sex,
 * their relationship status or a nickname, because guessing it wrong means
 * showing somebody cycle guidance about their husband. "Prefer not to say" is
 * a real answer and selects the general guidance rather than a default.
 */
function AddSubject({
  open,
  onClose,
  allowSelf,
}: {
  open: boolean;
  onClose: () => void;
  allowSelf: boolean;
}) {
  const [relation, setRelation] = useState<"self" | "partner">(allowSelf ? "self" : "partner");
  const [label, setLabel] = useState("");
  const [sex, setSex] = useState<"male" | "female" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/rhythm/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          relation,
          label: relation === "partner" ? label.trim() || null : null,
          subjectSex: sex,
          model: sex === "female" ? "spontaneous_cycle" : "none",
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "Couldn't save that.");
    },
    onSuccess: () => {
      invalidate();
      setLabel("");
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Whose rhythm?</DialogTitle>
          <DialogDescription className="text-xs">
            Understand your own, or someone you're close to. Nothing here is shared with anyone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {allowSelf && (
              <button
                onClick={() => setRelation("self")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm tap-clean",
                  relation === "self"
                    ? "border-[hsl(var(--gold))] text-gold"
                    : "border-border/50",
                )}
              >
                Mine
              </button>
            )}
            <button
              onClick={() => setRelation("partner")}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm tap-clean",
                relation === "partner"
                  ? "border-[hsl(var(--gold))] text-gold"
                  : "border-border/50",
              )}
            >
              Someone else's
            </button>
          </div>

          {relation === "partner" && (
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">
                What should we call them?
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="A first name is plenty"
                maxLength={60}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">
              {relation === "self" ? "Your sex" : "Their sex"}
            </label>
            <div className="flex gap-2">
              {(
                [
                  { v: "female" as const, l: "Female" },
                  { v: "male" as const, l: "Male" },
                  { v: null, l: "Rather not say" },
                ]
              ).map((o) => (
                <button
                  key={o.l}
                  onClick={() => setSex(o.v)}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-2 text-xs tap-clean",
                    sex === o.v
                      ? "border-[hsl(var(--gold))] text-gold"
                      : "border-border/50",
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug pt-1">
              It decides which guidance applies. We ask rather than guess.
            </p>
          </div>

          {error && <p className="text-[11px] text-destructive">{error}</p>}

          <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
            {create.isPending ? "Saving…" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── The section ───────────────────────────────────────────────────────────

export function RhythmSection() {
  const { data, isLoading } = useRhythm();
  const [adding, setAdding] = useState(false);

  if (isLoading || !data) return null;

  const hasSelf = data.subjects.some((s) => s.relation === "self");

  /**
   * Sorted by the strongest thing each card actually knows.
   *
   * Not by relation, and not by sex. The card with a real source leads because
   * it is the one with something to say today.
   */
  const sorted = [...data.subjects].sort((a, b) => {
    const rank = (s: RhythmSubjectView) =>
      s.relation === "self"
        ? s.guide
          ? 0
          : 4
        : Math.min(...(s.guidance.length ? s.guidance.map((g) => AUTHORITY_RANK[g.authority] ?? 9) : [9]));
    return rank(a) - rank(b);
  });

  return (
    <div className="space-y-3" data-testid="rhythm-section">
      {sorted.map((s) =>
        s.relation === "self" ? (
          <MyRhythm key={s.id} subject={s} />
        ) : (
          <TheirRhythm key={s.id} subject={s} />
        ),
      )}

      <button
        onClick={() => setAdding(true)}
        className="w-full rounded-xl border border-dashed border-border/50 p-3 text-left tap-clean hover:border-[hsl(var(--gold))]/40 transition-colors"
        data-testid="rhythm-add"
      >
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-gold" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              {data.subjects.length ? "Add someone else" : "Understand your rhythm"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {data.subjects.length
                ? "Somebody close to you, and how to show up well for them."
                : "Yours, or somebody you're close to. Private to you."}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-gold/50" />
        </div>
      </button>

      <AddSubject open={adding} onClose={() => setAdding(false)} allowSelf={!hasSelf} />
    </div>
  );
}
