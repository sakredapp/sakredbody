/**
 * Did this help?
 *
 * ── Where this may and may not appear ─────────────────────────────────────
 *
 * Only on something Sakred *chose* for this member out of alternatives it
 * could have chosen instead. That is a much smaller set than "things on the
 * screen that look intelligent":
 *
 *   yes   the three options on Today, the direction Terrain settled on
 *   no    the moon and season cards — the same words for everybody on the
 *         planet that day, and a thumbs-down on them is a vote about the
 *         calendar
 *   no    a habit the member committed to themselves, appearing because it
 *         is due
 *   no    a coach's proposal. A person recommended that, and a 👎 on it is
 *         feedback about a human being.
 *   no    library articles, navigation, static copy
 *
 * The rule is not squeamishness. A thumb attached to something Sakred did not
 * decide produces data that looks like engine performance and is not, and the
 * aggregate it poisons is the one that will eventually be allowed to argue for
 * a rule change.
 *
 * ── Why it is this quiet ──────────────────────────────────────────────────
 *
 * A recommendation the member is being asked to grade is a recommendation
 * competing with itself for attention. The control sits at the bottom of the
 * card at the weight of a caption, and it is deliberately not the thing your
 * eye lands on — the point of Today is the advice, not the survey.
 *
 * ── The reason list never blocks the verdict ──────────────────────────────
 *
 * 👎 registers immediately and the reasons appear afterwards, already
 * optional. The other order — ask why, then record — loses the member who was
 * about to tell us the single most useful thing in this whole loop, because a
 * modal appeared and they closed it.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FEEDBACK_REASONS,
  FEEDBACK_REASON_LABELS,
  type FeedbackReason,
  type RecommendationHandle,
  type Verdict,
} from "@shared/models/recommendation";

/**
 * What the server attached to a recommendation, if it managed to record one.
 *
 * Optional in the type because recording is best-effort by design: a database
 * hiccup must cost a thumb, never the advice. No id, no control, no gap where
 * one used to be.
 */
export type Feedbackable = Partial<RecommendationHandle>;

export function RecommendationFeedback({
  handle,
  label,
  className,
}: {
  handle: Feedbackable;
  /** What the member is grading, for the screen reader. */
  label: string;
  className?: string;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(handle.feedback?.verdict ?? null);
  const [reason, setReason] = useState<FeedbackReason | null>(handle.feedback?.reason ?? null);
  const [askingWhy, setAskingWhy] = useState(false);

  const id = handle.recommendationId;

  const save = useMutation({
    mutationFn: async (next: { verdict: Verdict; reason: FeedbackReason | null } | null) => {
      if (!id) return;
      if (next === null) {
        await fetch(`/api/recommendations/${id}/feedback`, {
          method: "DELETE",
          credentials: "include",
        });
        return;
      }
      await fetch(`/api/recommendations/${id}/feedback`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    },
  });

  if (!id) return null;

  /**
   * Tapping the verdict you already gave takes it back.
   *
   * Not a hidden gesture — it is the only way to undo, and a member who
   * mis-taps on a phone needs one. The alternative, a permanent record of an
   * accident, quietly corrupts exactly the data this exists to collect.
   */
  function choose(next: Verdict) {
    if (verdict === next) {
      setVerdict(null);
      setReason(null);
      setAskingWhy(false);
      save.mutate(null);
      return;
    }
    setVerdict(next);
    setReason(null);
    setAskingWhy(next === "not_helpful");
    save.mutate({ verdict: next, reason: null });
  }

  function chooseReason(r: FeedbackReason) {
    const next = reason === r ? null : r;
    setReason(next);
    setAskingWhy(false);
    if (verdict) save.mutate({ verdict, reason: next });
  }

  return (
    <div className={cn("pt-2", className)} data-testid={`feedback-${id}`}>
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mr-1">
          Helpful?
        </span>
        <button
          type="button"
          onClick={() => choose("helpful")}
          aria-pressed={verdict === "helpful"}
          aria-label={`${label} was helpful`}
          data-testid="feedback-up"
          className={cn(
            "h-7 w-7 grid place-items-center rounded-full tap-clean transition-colors",
            verdict === "helpful"
              ? "text-gold bg-[hsl(var(--gold))]/10"
              : "text-muted-foreground/60 hover:text-foreground",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => choose("not_helpful")}
          aria-pressed={verdict === "not_helpful"}
          aria-label={`${label} was not helpful`}
          data-testid="feedback-down"
          className={cn(
            "h-7 w-7 grid place-items-center rounded-full tap-clean transition-colors",
            verdict === "not_helpful"
              ? "text-foreground bg-foreground/10"
              : "text-muted-foreground/60 hover:text-foreground",
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/*
        Already recorded by the time this renders. Skipping it costs nothing,
        which is why there is no "skip" button to tap — walking away is the
        skip, and a control that says so would imply the verdict were pending.
      */}
      {askingWhy && (
        <div className="flex flex-wrap gap-1.5 mt-2" data-testid="feedback-reasons">
          {FEEDBACK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => chooseReason(r)}
              className={cn(
                "text-[11px] rounded-full border px-2.5 py-1 tap-clean transition-colors",
                reason === r
                  ? "border-[hsl(var(--gold))]/50 text-foreground"
                  : "border-border/50 text-muted-foreground hover:border-[hsl(var(--gold))]/40",
              )}
            >
              {FEEDBACK_REASON_LABELS[r]}
            </button>
          ))}
        </div>
      )}

      {reason && !askingWhy && (
        <p className="text-[10px] text-muted-foreground/70 mt-1.5">
          {FEEDBACK_REASON_LABELS[reason]}
        </p>
      )}
    </div>
  );
}
