/**
 * What you told Sakred, said back at the moment it matters.
 *
 * ── Where this appears, and where it deliberately does not ────────────────
 *
 * Directly above the movement it is about, inside the workout, before the
 * first set of it is loaded. Not on Home, not as a feed, not as a list of past
 * complaints — a member scrolling a history of their own aches is a different
 * product, and one that makes people feel worse rather than train better.
 *
 * The rule is that a recall appears where it could change a decision and
 * nowhere else. Everywhere else it is noise wearing the clothes of care.
 *
 * ── The quote is theirs ───────────────────────────────────────────────────
 *
 * The frame is Sakred's — "Last time you did Single-Leg RDL, you noted
 * left-sided discomfort" — and the sentence inside it is quoted whole. Nothing
 * here paraphrases what somebody wrote, because a paraphrase of "the glute
 * didn't seem to connect" is a claim Sakred did not have the right to make.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  recallFor,
  recallLine,
  restoreLine,
  type Observation,
} from "@shared/models/trainingMemory";
import { loadGuidance, type TrainingResponse } from "@shared/models/trainingResponse";
import { formatLocalDateString } from "@shared/utils/dates";

/**
 * The member's own today, so a shape match can be aged out.
 *
 * Local rather than UTC: whether a note from "last week" still speaks is a
 * question about their week, and a member training at 9pm on the west coast is
 * already tomorrow in UTC.
 */
const localToday = formatLocalDateString;

export const MEMORY_KEY = ["/api/training/memory"] as const;

export function useTrainingMemory() {
  return useQuery<{ observations: Observation[]; response?: TrainingResponse }>({
    queryKey: MEMORY_KEY,
    /**
     * It changes when a session is finished, which invalidates it. Between
     * those it is the same short list, and re-asking on every movement added to
     * a workout would be a request per tap.
     */
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * ── The size of it is the argument ────────────────────────────────────────
 *
 * One line, quoting them:
 *
 *     Last time: slight left low-back discomfort.
 *
 * Not a bordered warning across every future leg day. A note is information a
 * member weighs, and an app that escalates one sentence into a standing
 * caution has stopped helping them adapt and started telling them what they
 * are allowed to do. The guidance line — warm it, start lighter — is available
 * behind a tap rather than asserted every time, because most days they already
 * know.
 *
 * The exception is the only one worth making. Where the sentence tripped the
 * red-flag screen it keeps the border, the icon and the guidance, because that
 * is the one case where the useful thing is not a smaller nudge.
 */
function Card({
  headline,
  quote,
  guidance,
  seekCare,
  testid,
}: {
  headline: string;
  quote: string | null;
  guidance: string;
  seekCare: boolean;
  testid: string;
}) {
  const [open, setOpen] = useState(false);

  if (!seekCare) {
    return (
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left tap-clean py-0.5"
        data-testid={testid}
      >
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-foreground/70">Last time:</span>{" "}
          {/* Their sentence where they wrote one, the short form where they
              only picked a word. Never a paraphrase of the sentence. */}
          {quote ?? headline.replace(/^Last time(?: on [^:]+)?:\s*/, "")}
        </p>
        {open && (
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed mt-1">{guidance}</p>
        )}
      </button>
    );
  }

  return (
    <div
      className="rounded-xl border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/[0.04] px-3 py-2.5 space-y-1.5"
      data-testid={testid}
    >
      <p className="text-xs text-foreground/90 leading-relaxed flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-gold shrink-0 mt-0.5" />
        <span>{headline}</span>
      </p>
      {quote && (
        <p className="text-xs text-muted-foreground italic leading-relaxed border-l border-border/60 pl-2">
          “{quote}”
        </p>
      )}
      <p className="text-[11px] text-muted-foreground leading-relaxed">{guidance}</p>
    </div>
  );
}

/**
 * The recall for one movement, or nothing.
 *
 * Nothing is the overwhelmingly common case and is rendered as nothing — no
 * "no notes yet", no empty state. A card that appears on every movement to say
 * it has nothing to say would make the one that matters invisible.
 */
export function MovementMemory({
  movement,
}: {
  movement: { id: string; name: string; pattern?: string | null; category?: string | null };
}) {
  const { data } = useTrainingMemory();
  const found = recallFor(data?.observations ?? [], movement, localToday());
  if (!found) return null;

  const line = recallLine(found, movement.name);
  return (
    <Card
      headline={line.headline}
      quote={line.quote}
      guidance={line.guidance}
      seekCare={line.seekCare}
      testid={`memory-${movement.id}`}
    />
  );
}

/**
 * The most recent notable thing, on the Restore side.
 *
 * The other half of the same answer: Build says warm it and start light,
 * Restore says today might be better spent giving that area something than
 * asking more of it. One observation, one voice, two useful readings.
 */
export function RestoreMemory() {
  const { data } = useTrainingMemory();
  const notes = data?.observations ?? [];
  /**
   * Optional, like every field added to a payload a bundled client reads: an
   * app built before the server sent this gets `undefined` and behaves exactly
   * as it did.
   */
  const load = data?.response ?? null;

  /**
   * ── One card, both halves ────────────────────────────────────────────────
   *
   * What the member said and what they actually did are different evidence and
   * they answer the same question, so they are read together rather than
   * stacked as two panels. Restore is a screen somebody opens looking for one
   * useful thing to do; giving them two boxes about training load is how a
   * quiet screen becomes a dashboard.
   *
   * The note wins when there is one. A sentence a member wrote about their own
   * body is more specific than a count of hard sets, and the load only sharpens
   * what the note already says — see `restoreLine`.
   */
  if (notes.length) {
    // Newest, which is the ordering the server already returns.
    const line = restoreLine(notes[0], load);
    return (
      <Card
        headline={line.headline}
        quote={line.quote}
        guidance={line.guidance}
        seekCare={line.seekCare}
        testid="restore-memory"
      />
    );
  }

  /**
   * Nothing was said, but something was done. Most days this is null too —
   * `loadGuidance` only speaks for a session inside two days that went to
   * failure or sat at the top end, because a screen that produces a sentence
   * about training load every single day teaches people to stop reading it.
   */
  const fromLoad = load ? loadGuidance(load) : null;
  if (!fromLoad) return null;

  return (
    <Card
      headline={fromLoad.headline}
      quote={null}
      guidance={fromLoad.guidance}
      seekCare={false}
      testid="restore-load"
    />
  );
}
