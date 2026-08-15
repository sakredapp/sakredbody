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

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  recallFor,
  recallLine,
  restoreLine,
  type Observation,
} from "@shared/models/trainingMemory";
import { cn } from "@/lib/utils";

export const MEMORY_KEY = ["/api/training/memory"] as const;

export function useTrainingMemory() {
  return useQuery<{ observations: Observation[] }>({
    queryKey: MEMORY_KEY,
    /**
     * It changes when a session is finished, which invalidates it. Between
     * those it is the same short list, and re-asking on every movement added to
     * a workout would be a request per tap.
     */
    staleTime: 5 * 60 * 1000,
  });
}

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
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 space-y-1.5",
        seekCare ? "border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/[0.04]" : "border-border/50",
      )}
      data-testid={testid}
    >
      <p className="text-xs text-foreground/90 leading-relaxed flex items-start gap-1.5">
        {seekCare && (
          <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--gold))] shrink-0 mt-0.5" />
        )}
        <span>{headline}</span>
      </p>
      {/* Quoted, and visibly so. The member should be able to see that this is
          their sentence and not the app's account of it. */}
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
  const found = recallFor(data?.observations ?? [], movement);
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
  if (!notes.length) return null;

  // Newest, which is the ordering the server already returns.
  const line = restoreLine(notes[0]);
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
