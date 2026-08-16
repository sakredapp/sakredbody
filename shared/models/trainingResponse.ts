/**
 * How hard the last few days actually were — the half of training response
 * that is not a sentence.
 *
 * ── Why this is separate from Training Memory ─────────────────────────────
 *
 * Training Memory is what the member *said*: "the glute didn't feel like it
 * was firing". This is what they *did*: sets at the top end, sets taken to
 * failure, and how long ago. The two are different kinds of evidence and they
 * answer Restore's question together — a hinge note on its own is a note, and
 * a hinge note after four sets at RPE 9 is a reason to spend today on
 * mobility rather than adding load.
 *
 * ── What it must not become ───────────────────────────────────────────────
 *
 * Not a second Terrain. Terrain Now is the canonical reading of state and this
 * does not touch it, feed it, or reproduce a fragment of it. What lives here
 * is context for one screen: given that the member is standing in Restore
 * looking for something useful to do, what does the last few days of training
 * make more useful. If a number here ever starts being compared against a
 * terrain threshold, it has escaped its purpose.
 *
 * And it says nothing about why anything hurt. See `guidanceFor` — the
 * strongest sentence available to it is that easy work may be worth more today
 * than load, which is a statement about training, not about a body.
 */

/** Four days. Longer and "recently" stops meaning anything a member recognises. */
export const RESPONSE_WINDOW_DAYS = 4;

/**
 * RPE 8 is the conventional line where a set stops being submaximal — two or
 * so reps left. Below it, a set is work; at or above it, it is a demand the
 * body has to recover from, which is the only thing Restore cares about here.
 */
export const HARD_RPE = 8;

/** Only the columns that say how hard it was. */
export type ResponseSet = {
  /** The member's own day, from the session. */
  onDate: string;
  rpe: number | null;
  toFailure: boolean;
  isWarmup: boolean;
};

export type TrainingResponse = {
  /** Working sets at or above `HARD_RPE`, inside the window. */
  hardSets: number;
  /** Sets the member marked as taken to failure. A different event, counted separately. */
  failureSets: number;
  /** The most recent day carrying either, or null. */
  lastHardOn: string | null;
  /** 0 for today, 1 for yesterday. Null when there is nothing to count from. */
  daysSinceHard: number | null;
};

/** Whole days between two calendar dates, neither parsed into an instant. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * The window, read.
 *
 * Warm-ups are excluded from both counts. A ramp set carried to RPE 8 by
 * somebody being honest about a heavy first rep is not a demand, and counting
 * it would make careful members look overtrained.
 */
export function readTrainingResponse(
  sets: readonly ResponseSet[],
  today: string,
): TrainingResponse {
  let hardSets = 0;
  let failureSets = 0;
  let lastHardOn: string | null = null;

  for (const s of sets) {
    if (s.isWarmup) continue;
    if (daysBetween(s.onDate, today) > RESPONSE_WINDOW_DAYS) continue;

    const hard = (s.rpe != null && s.rpe >= HARD_RPE) || s.toFailure;
    if (!hard) continue;

    hardSets++;
    if (s.toFailure) failureSets++;
    if (!lastHardOn || s.onDate > lastHardOn) lastHardOn = s.onDate;
  }

  return {
    hardSets,
    failureSets,
    lastHardOn,
    daysSinceHard: lastHardOn ? daysBetween(lastHardOn, today) : null,
  };
}

/** "today", "yesterday", "on Saturday" — as somebody would actually say it. */
export function whenItWas(days: number, onDate: string): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  const d = new Date(`${onDate}T12:00:00`);
  return `on ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
}

/**
 * What the last few days make worth doing — or nothing, which is the usual
 * answer.
 *
 * ── Deliberately quiet ────────────────────────────────────────────────────
 *
 * Returns null unless there is something a member would recognise as true. A
 * screen that produces a sentence about training load every single day teaches
 * people to stop reading it, and then the one day it matters it is furniture.
 *
 * Two days is the horizon. A hard session on Monday is not a reason to change
 * Thursday, and pretending otherwise is the sort of confident nonsense that
 * makes an app feel like it is guessing — which it would be.
 */
export function loadGuidance(
  r: TrainingResponse,
): { headline: string; guidance: string } | null {
  if (r.daysSinceHard == null || !r.lastHardOn) return null;
  if (r.daysSinceHard > 2) return null;

  const when = whenItWas(r.daysSinceHard, r.lastHardOn);

  /**
   * Failure is its own event. An RPE of 10 is the member's judgement that they
   * had nothing left; going to actual failure is a rep the body refused, and
   * it costs more to come back from — which is why the two are stored apart.
   */
  if (r.failureSets > 0) {
    return {
      headline: `You took ${r.failureSets === 1 ? "a set" : `${r.failureSets} sets`} to failure ${when}.`,
      guidance:
        "Breath, easy mobility and sleep will do more for the next session than more output today.",
    };
  }

  // Four is roughly one hard movement's worth. Fewer than that is a normal
  // session with a heavy set in it, which is not news.
  if (r.hardSets >= 4) {
    return {
      headline: `${r.hardSets} sets sat at the top end ${when}.`,
      guidance: "Easy work and down-regulation are likely worth more today than adding load.",
    };
  }

  return null;
}
