/**
 * Today's Terrain — the line that sits under everything else.
 *
 * ── A lean, not a gauge ───────────────────────────────────────────────────
 *
 * The brief asked for "YIN 62 / 38 YANG". This shows which way the terrain is
 * leaning and why, and no number — because a composite invented from sleep,
 * HRV and training load is arithmetic across three different measurement
 * qualities wearing the costume of a measurement, and because the member will
 * optimise whatever number you show them.
 *
 * PillarHome, one screen up, already made this argument and won it: "A number
 * invented out of other numbers is a character sheet, and this is a practice."
 * Two screens in the same app disagreeing about that would be worse than
 * either answer.
 *
 * Everything here is arguable. "Sleeping 40 minutes less than usual" is a
 * claim a member can check against their own week. "38" is not.
 *
 * ── The bar is a relationship, not a score ────────────────────────────────
 *
 * There is still a bar, because the polarity is easier seen than read — but it
 * is a *marker on an axis between two named ends*, not a filled percentage.
 * The difference is that nothing here reads as "62% of the way to good": both
 * ends are legitimate places to be, which is the whole philosophy.
 */

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  RecommendationFeedback,
} from "@/components/intelligence/RecommendationFeedback";
import type { FeedbackReason } from "@shared/models/recommendation";

type Lean = "restore" | "build" | "either" | "unknown";

type Reading = {
  lean: Lean;
  /** Present when the server recorded this read as a recommendation. */
  recommendationId?: string;
  feedback?: { verdict: "helpful" | "not_helpful"; reason: FeedbackReason | null } | null;
  headline: string;
  reasons: { source: "measured" | "reported"; text: string; pulls: "restore" | "build" }[];
  week: { stress: number; restoration: number; sessions: number };
  hasBody: boolean;
};

/** Where the marker sits on the Restore ←→ Build axis, as a percentage. */
const POSITION: Record<Lean, number> = {
  restore: 20,
  either: 50,
  build: 80,
  unknown: 50,
};

export function TerrainToday({ onOpenRestore }: { onOpenRestore?: () => void }) {
  const { data, isLoading } = useQuery<Reading>({
    queryKey: ["/api/terrain/today"],
  });

  // Nothing at all rather than a skeleton: this sits above the doors on the
  // home screen, and a grey block that becomes a sentence is more disruptive
  // than a sentence that arrives.
  if (isLoading || !data) return null;

  const unknown = data.lean === "unknown";

  /*
    Whether anything in this reading came from a device rather than from the
    member. Derived from the reasons themselves rather than from a separate
    "is health connected" query, so the sentence describes *this* reading and
    cannot claim measured context for a card that has none.

    Three states rather than two, because "no measured reason" and "no reasons
    at all" are different facts. A card with reported reasons and no measured
    one can honestly say devices are missing; an empty card cannot — the member
    may well have a watch connected on a day nothing was worth saying — so it
    says what is true in every case instead.
  */
  const measured = data.reasons.some((r) => r.source === "measured");

  /*
    A wrapper, because the card itself is a button and the thumbs are buttons.

    Nesting them would be invalid markup and, more practically, every tap on a
    thumb would also open Restore — the member would grade the reading and be
    thrown onto another screen for their trouble.
  */
  return (
    <div>
    <button
      type="button"
      onClick={onOpenRestore}
      disabled={!onOpenRestore}
      className={cn(
        "w-full text-left rounded-xl border border-[hsl(var(--gold))]/12 bg-well px-4 py-3.5 tap-clean",
        onOpenRestore && "hover:border-[hsl(var(--gold))]/30 transition-colors",
      )}
      data-testid="terrain-today"
      data-tour-id="terrain-now"
    >
      {/* Was "Today's terrain". Two readers in a row asked what that meant and
          guessed diet, then protocols — so the label says what the card is for
          instead of what the model is called. */}
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        How you're doing
      </p>

      <p className="font-display text-lg leading-snug mt-1">{data.headline}</p>

      {!unknown && (
        <>
          {/* Restore ←──●──→ Build. Both ends named, so neither reads as the
              failing end of a scale. */}
          <div className="mt-3 flex items-center gap-2.5">
            <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--yin,200_20%_62%))] shrink-0">
              Restore
            </span>
            <span className="relative h-px flex-1 bg-[hsl(var(--gold))]/25">
              <span
                className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-[hsl(var(--gold))]"
                style={{ left: `${POSITION[data.lean]}%` }}
              />
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
              Build
            </span>
          </div>

          {data.reasons.length > 0 && (
            <ul className="mt-2.5 space-y-0.5">
              {data.reasons.slice(0, 3).map((r) => (
                <li key={r.text} className="text-xs text-muted-foreground">
                  {r.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/*
        Where the reading came from.

        `source` has been on every reason since terrain was written and was
        thrown away here — the card said "Sleep was short" without saying
        whether that was a watch or something the member typed. Those are
        different claims, and a member deciding whether to trust the reading
        needs to know which one they are reading.

        It is also the only place in the member's app that speaks about
        measured data as such, which is why the walkthrough's health lesson
        points at it rather than at the coaching HealthCard: health is not a
        separate pillar of Home, it is one of the things terrain is made of.
      */}
      <p
        className="mt-2.5 text-[10px] text-muted-foreground/70"
        data-tour-id="health-context"
        data-testid="terrain-provenance"
      >
        {measured
          ? "Includes measured context from your devices."
          : data.reasons.length > 0
            ? "This reads what you've told it. Devices can add measured context."
            : "Devices can add measured context here when you connect them."}
      </p>

      {unknown && (
        <p className="text-xs text-muted-foreground mt-1">
          Connect health data or log a session and this starts reading.
        </p>
      )}
    </button>

    {/*
      Only when there is a reading to grade. An `unknown` terrain is the engine
      saying it cannot read this body yet, and asking whether that was helpful
      is asking somebody to rate an admission.
    */}
    {!unknown && (
      <div className="px-4">
        <RecommendationFeedback handle={data} label="this reading" />
      </div>
    )}
    </div>
  );
}
