/**
 * Today — the read, three things worth doing, and the sky said plainly.
 *
 * ── One request, rendered ─────────────────────────────────────────────────
 *
 * Everything here comes from `/api/today` in a single response, and this
 * component decides nothing. That is deliberate and it is the reason the
 * screen can be trusted: the thresholds, the ordering and the rule about never
 * inventing a reason all live in `shared/models/recommend.ts`, where they are
 * covered by tests that run without a browser or a database.
 *
 * The failure this replaces was a screen assembling itself from four requests
 * that could each fail separately — two resolved out of four gives you "we
 * don't know much about your day" printed above a card that has obviously read
 * your sleep.
 *
 * ── Consequence first, name second, explanation third ─────────────────────
 *
 * The ordering rule the whole product runs on. A card leads with what to
 * actually do — "Keep tonight uncomplicated" — and the vocabulary that
 * produced it sits underneath in smaller type for anyone who wants it. Nobody
 * has to know what late luteal or a waning gibbous is to use this screen, and
 * nobody who does know is patronised.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ChevronRight, MoreHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Suggestion, MoonGuidance, SeasonGuidance, ReadinessRead } from "@shared/models/recommend";
import type { RelationalGuidance } from "@shared/models/relating";

export type TodayStat = {
  metric: string;
  value: number | null;
  onDate: string | null;
  baseline: number | null;
};

export type RhythmSubjectView = {
  id: string;
  relation: "self" | "partner";
  label: string | null;
  subjectSex: "male" | "female" | null;
  supportPreference: string | null;
  model: string;
  phaseLabel: string | null;
  phase: string | null;
  cycleDay: number | null;
  confidence: string;
  stale: boolean;
  contexts: string[];
  guide: { theme: string; summary: string; goodMove: string; worthAsking: string } | null;
  guidance: RelationalGuidance[];
};

export type TodayResponse = {
  date: string;
  read: ReadinessRead;
  line: string;
  suggestions: Suggestion[];
  moon: MoonGuidance | null;
  season: SeasonGuidance | null;
  sky: string | null;
  stats: TodayStat[];
  checkedIn: boolean;
  rhythm: RhythmSubjectView[];
  /**
   * How their own state is landing on other people — up to two, each naming
   * the signal that is actually off rather than an aggregate.
   */
  relating: RelationalGuidance[];
};

export function useToday() {
  return useQuery<TodayResponse>({
    queryKey: ["/api/today"],
    queryFn: async () => {
      const r = await fetch("/api/today", { credentials: "include" });
      if (!r.ok) throw new Error("today");
      return r.json();
    },
    // The read changes when sleep syncs or a check-in lands, not by the
    // second. Refetching on every focus would make the copy shift under
    // somebody mid-sentence.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * One thing worth doing, with the actual reason attached.
 *
 * `because` is empty whenever the engine has no signals, and the card must
 * render nothing in its place rather than reaching for a filler line. An
 * invented reason is worse than no reason: it is the first thing a member
 * catches the app being wrong about.
 */
function Option({
  suggestion,
  showBecause,
  onOpen,
  onDismiss,
}: {
  suggestion: Suggestion;
  /**
   * Only the first card says why.
   *
   * The reason is a fact about the day, not about the option — printing
   * "You slept well — 8h 3m" under all three reads as a stutter and makes the
   * app look like it is padding. The note at the top of this file said exactly
   * that, and the first version repeated it anyway.
   */
  showBecause: boolean;
  onOpen: (s: Suggestion) => void;
  onDismiss: (category: string, scope: "today" | "forever") => void;
}) {
  const [asking, setAsking] = useState(false);

  return (
    <div
      className="relative rounded-xl border border-[hsl(var(--gold))]/12 bg-white/[0.03] overflow-hidden"
      data-testid={`suggestion-${suggestion.category}`}
    >
      <button
        onClick={() => onOpen(suggestion)}
        className="w-full text-left p-4 pr-11 tap-clean hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[10px] uppercase tracking-widest",
              suggestion.side === "restore"
                ? "text-[hsl(var(--gold))]/70"
                : "text-[hsl(var(--gold))]",
            )}
          >
            {suggestion.side === "restore" ? "Restore" : "Build"}
          </span>
          {/* Named rather than badged with a word like "novel", which reads as
              a system talking about you. */}
          {suggestion.isStretch && (
            <span className="text-[10px] text-muted-foreground">· something new</span>
          )}
        </div>

        <p className="font-display text-base mt-1 leading-snug">{suggestion.headline}</p>
        <p className="text-xs text-[hsl(var(--gold))]/80 mt-0.5">{suggestion.label}</p>
        {showBecause && suggestion.because && (
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
            {suggestion.because}
          </p>
        )}
      </button>

      {/* Two answers, not one. "Busy today" and "never suggest this" are
          different, and collapsing them is how somebody ends up with four
          categories left because they were busy four mornings running. */}
      <button
        onClick={() => setAsking((v) => !v)}
        className="absolute top-3 right-2 h-8 w-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground tap-clean"
        aria-label="Not this"
        data-testid={`dismiss-${suggestion.category}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {asking && (
        <div className="flex gap-2 px-4 pb-3 -mt-1">
          <button
            onClick={() => {
              onDismiss(suggestion.category, "today");
              setAsking(false);
            }}
            className="text-[11px] rounded-full border border-border/50 px-3 py-1 tap-clean hover:border-[hsl(var(--gold))]/40"
          >
            Not today
          </button>
          <button
            onClick={() => {
              onDismiss(suggestion.category, "forever");
              setAsking(false);
            }}
            className="text-[11px] rounded-full border border-border/50 px-3 py-1 tap-clean hover:border-[hsl(var(--gold))]/40"
          >
            Never suggest {suggestion.label.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The moon and the season, as instructions.
 *
 * These were on the screen from the start as "waning gibbous" and an
 * illumination percentage, which half the audience read as horoscope filler.
 * The content was never the problem — the tradition attaches something
 * concrete to each phase, and that part survives translation. So the practice
 * is the headline and the names are the subtitle, never the other way round.
 */
function Sky({ moon, season, sky }: { moon: MoonGuidance | null; season: SeasonGuidance | null; sky: string | null }) {
  // Moon leads because it changes weekly; the season is the slower backdrop.
  const lead = moon ?? season;
  if (!lead || !sky) return null;

  return (
    <div
      className="rounded-xl border border-[hsl(var(--gold))]/12 bg-white/[0.03] p-4"
      data-testid="sky-card"
    >
      {/*
        No icon. A small line-art moon beside the copy added nothing the words
        did not already say, and it read as stock wellness decoration next to
        the celestial artwork this product actually draws. The typography, the
        gold and the constellation figures are the visual language here; a
        picked-from-a-set glyph is not part of it.
      */}
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className="font-display text-base leading-snug">{lead.title}</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{lead.detail}</p>
          {/* The vocabulary, underneath, for whoever wants it. */}
          <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--gold))]/60 mt-2">
            {sky}
          </p>
          {moon && season && (
            <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
              {season.title}. {season.detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * How their own state is likely to land on other people.
 *
 * Built from their own measurements, which is what makes it the one card in
 * this family that can be stated at full strength. Everything about somebody
 * else is hedged or asks a question — see relating.ts.
 */
export function RelatingCard({ note }: { note: RelationalGuidance }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-xl border border-[hsl(var(--gold))]/12 bg-white/[0.03] p-4 tap-clean"
      data-testid="relating-card"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-[hsl(var(--gold))] mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base leading-snug">{note.title}</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{note.detail}</p>
          {open && (
            <div className="mt-3 space-y-2">
              <p className="text-xs leading-snug">{note.goodMove}</p>
              <p className="text-xs text-[hsl(var(--gold))]/80 leading-snug">
                Worth asking yourself: {note.worthAsking}
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">{note.dontAssume}</p>
            </div>
          )}
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-2">
            {note.basis}
          </p>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-[hsl(var(--gold))]/50 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
      </div>
    </button>
  );
}

/**
 * The whole screen above the doors.
 *
 * Rendered only once the request resolves. A skeleton here would be three grey
 * boxes where three sentences about somebody's body are about to appear, which
 * is a worse first impression than a beat of nothing.
 */
export function TodayRead({
  side,
  onOpenCategory,
  onCheckIn,
}: {
  /**
   * Which half of the practice this screen is.
   *
   * Restore shows the restorative options, Build the demanding ones. Undefined
   * shows all three — nothing uses that today, and it exists so the component
   * does not have to change if a combined surface ever comes back.
   */
  side?: "restore" | "build";
  onOpenCategory: (suggestion: Suggestion) => void;
  onCheckIn?: () => void;
}) {
  const { data, isLoading } = useToday();

  const dismiss = useMutation({
    mutationFn: async (input: { category: string; scope: "today" | "forever" }) => {
      const r = await fetch("/api/today/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error("dismiss");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/today"] }),
  });

  if (isLoading || !data) return null;

  const shown = side ? data.suggestions.filter((s) => s.side === side) : data.suggestions;
  // Nothing for this side means nothing to render. An empty heading is worse
  // than an absent one.
  if (!shown.length) return null;

  return (
    <div className="space-y-3" data-testid="today-read">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-lg leading-snug flex-1">{data.line}</p>
        {/* The check-in is the highest-value signal the app can get and the
            only one that needs the member. Offered when it's missing, and
            silent once it's done. */}
        {!data.checkedIn && onCheckIn && (
          <button
            onClick={onCheckIn}
            className="shrink-0 text-[11px] rounded-full border border-[hsl(var(--gold))]/30 px-3 py-1 text-[hsl(var(--gold))] tap-clean"
            data-testid="today-checkin"
          >
            Check in
          </button>
        )}
      </div>

      {/* The reasons, once, above the options rather than repeated on each —
          three cards each carrying the same sentence reads as a stutter. */}
      {data.read.reasons.length > 1 && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {data.read.reasons.slice(1).join(" ")}
        </p>
      )}

      <div className="space-y-2">
        {shown.map((s, i) => (
          <Option
            key={s.category}
            suggestion={s}
            showBecause={i === 0}
            onOpen={onOpenCategory}
            onDismiss={(category, scope) => dismiss.mutate({ category, scope })}
          />
        ))}
      </div>

      {data.relating?.map((note, i) => (
        <RelatingCard key={`${note.title}-${i}`} note={note} />
      ))}

      <Sky moon={data.moon} season={data.season} sky={data.sky} />
    </div>
  );
}
