/**
 * Your training remembers.
 *
 * ── What this turns Build into ────────────────────────────────────────────
 *
 * A recommendation engine that reads sleep and HRV can say "chest looks useful
 * today". It cannot say the only thing that would have been worth saying:
 * that the last time this person loaded a single-leg hinge their left low back
 * complained and their glute didn't fire. That fact exists — they typed it —
 * and until now nothing read it.
 *
 * So this is the reader. It takes what somebody said about their training and
 * decides whether it is worth saying back to them, when, and how.
 *
 * ── Three rules it exists to hold ─────────────────────────────────────────
 *
 *   the sentence is theirs      what surfaces is quoted, not paraphrased. The
 *                               app adds the frame around it and never rewrites
 *                               the middle
 *
 *   only where it changes       a note is recalled at the moment it could
 *   something                   change a decision — before loading the movement
 *                               it was about — and not as a feed of past
 *                               complaints
 *
 *   and it never diagnoses      see `RED_FLAGS`. Sakred can adapt training
 *                               around what a member reports. Deciding what is
 *                               wrong with them is a different act, performed
 *                               by a different kind of professional, and the
 *                               cases where it would be most tempting to guess
 *                               are exactly the ones where guessing is worst
 */

/** The words that make a note worth recalling. "Felt good" is not one. */
const NOTABLE = new Set(["tight", "weak", "discomfort", "unstable"]);

export type Observation = {
  exerciseId: string | null;
  /** The member's own sentence. Never rewritten. */
  note: string | null;
  quality: string | null;
  side: string | null;
  onDate: string;
  /** Joined from the catalogue, so a note can be matched to like movements. */
  exerciseName?: string | null;
  pattern?: string | null;
  category?: string | null;
};

/**
 * How far back a note still speaks.
 *
 * Long enough to cover the gap between two leg days that happen to fall three
 * weeks apart, short enough that a member is not shown a complaint about a
 * shoulder that stopped hurting in the spring. Recency is the whole reason
 * this is useful and the whole reason it becomes noise.
 */
export const MEMORY_WINDOW_DAYS = 45;

/**
 * ── The boundary ──────────────────────────────────────────────────────────
 *
 * Sakred personalizes around soreness, stiffness, poor connection and training
 * response. It does not turn a sentence into a diagnosis, and it does not
 * promise to heal anything.
 *
 * These are the words that mean the honest answer is "this is worth somebody
 * qualified looking at" rather than "start with a lighter hinge". They are
 * deliberately blunt and deliberately over-inclusive: the cost of treating an
 * ordinary ache as worth mentioning to a professional is a sentence somebody
 * ignores. The cost of the reverse is an app that coached a member through a
 * nerve impingement.
 *
 * Matched against the member's own sentence, never against the one-word
 * quality — nobody picks "discomfort" and means radiculopathy, but plenty of
 * people write "shooting down my leg" underneath it.
 */
const RED_FLAGS: readonly RegExp[] = [
  // Neurological.
  /\b(numb|numbness|tingl\w*|pins and needles|shooting|radiat\w*|nerve|sciatic\w*)\b/i,
  // Sharp or sudden, as distinct from sore.
  /\b(sharp|stabbing|searing|popped|pop\b|snapped|gave way|gave out|buckl\w*)\b/i,
  // Loss of function.
  /\b(can'?t (lift|move|straighten|bend|walk|grip)|couldn'?t (lift|move|walk)|locked up|no strength)\b/i,
  // Swelling and its friends.
  /\b(swell\w*|swollen|bruis\w*|hot to touch|clicking and pain|giving way)\b/i,
  // Said plainly.
  /\b(worse each|getting worse|worsening|every session|weeks now|months now|still hurts)\b/i,
];

/**
 * Does this sentence describe something a professional should see?
 *
 * A screen, not an assessment. It changes what Sakred says — from a training
 * adjustment to "worth somebody qualified looking at" — and it never names a
 * condition, because naming one is the act this exists to prevent.
 */
export function needsProfessionalEyes(note: string | null | undefined): boolean {
  if (!note) return false;
  return RED_FLAGS.some((r) => r.test(note));
}

/** Is this observation worth ever saying back to somebody? */
export function isNotable(o: Observation): boolean {
  if (o.quality && NOTABLE.has(o.quality)) return true;
  // A sentence with a red flag in it is notable whatever word was picked
  // beside it — including none.
  return needsProfessionalEyes(o.note);
}

/**
 * The most recent thing worth saying about a movement, or about movements like
 * it.
 *
 * Matching is exact first, then by shape. "The last time you loaded a
 * single-leg hinge" is the useful recall, and a member who did Single-Leg RDLs
 * in March and B-Stance RDLs today has not changed the question their low back
 * is being asked — those share a `pattern` and a `category`, which is exactly
 * what those columns are for.
 *
 * One note, not a list. A history of every complaint is a screen somebody
 * learns to scroll past; the last one is the one that might change today.
 */
export function recallFor(
  observations: readonly Observation[],
  movement: { id: string; pattern?: string | null; category?: string | null },
): Observation | null {
  const notable = observations.filter(isNotable);
  const exact = notable.filter((o) => o.exerciseId === movement.id);
  const alike = notable.filter(
    (o) =>
      o.exerciseId !== movement.id &&
      !!movement.pattern &&
      o.pattern === movement.pattern &&
      o.category === movement.category,
  );
  // Newest of the exact matches, else newest of the ones like it.
  const pick = (rows: Observation[]) =>
    rows.length ? rows.reduce((a, b) => (b.onDate > a.onDate ? b : a)) : null;
  return pick(exact) ?? pick(alike);
}

/**
 * The most recent thing worth saying about a *kind* of work.
 *
 * Build recommends a category — "Chest", "Ground movement" — not a movement,
 * so this is the resolution a recommendation can honestly be matched at.
 * Matching more precisely than the thing being recommended would be inventing
 * precision: the suggestion does not know which chest press they will pick.
 */
export function recallForCategory(
  observations: readonly Observation[],
  category: string,
): Observation | null {
  const rows = observations.filter((o) => isNotable(o) && o.category === category);
  return rows.length ? rows.reduce((a, b) => (b.onDate > a.onDate ? b : a)) : null;
}

/** "left low back", from the two structured fields, where they were given. */
function whereItWas(o: Observation): string {
  const side = o.side === "left" || o.side === "right" ? `${o.side}-sided ` : "";
  const what =
    o.quality === "discomfort"
      ? "discomfort"
      : o.quality === "tight"
        ? "tightness"
        : o.quality === "weak"
          ? "a weak connection"
          : o.quality === "unstable"
            ? "some instability"
            : "something";
  return `${side}${what}`;
}

export type Recall = {
  /** The frame, in Sakred's voice. */
  headline: string;
  /** The member's own sentence, quoted and unaltered. Null when they only picked a word. */
  quote: string | null;
  /** What to do about it. Conservative always; professional-care where flagged. */
  guidance: string;
  /** True where the note tripped a red flag. Surfaces differently, and louder. */
  seekCare: boolean;
};

/**
 * What to say, before they load it again.
 *
 * The frame is Sakred's and the middle is theirs. Nothing here summarises the
 * member's sentence — it is quoted whole or not shown, because a paraphrase of
 * "the glute didn't seem to connect" is a claim Sakred did not have the right
 * to make.
 */
export function recallLine(o: Observation, movementName: string): Recall {
  const when = o.exerciseName && o.exerciseName !== movementName ? o.exerciseName : "this";
  const seekCare = needsProfessionalEyes(o.note);

  return {
    headline:
      when === "this"
        ? `Last time, you noted ${whereItWas(o)}.`
        : `Last time you did ${when}, you noted ${whereItWas(o)}.`,
    quote: o.note?.trim() || null,
    /**
     * Two registers, and the line between them is the product's ethics.
     *
     * The ordinary case is a training adjustment: warm the pattern, start
     * light, let the first set decide. The flagged case does not get a better
     * training adjustment — it gets a smaller one and a sentence saying this is
     * not Sakred's call. It never names what might be wrong.
     */
    guidance: seekCare
      ? "Keep it light today, or leave the pattern out. What you described is worth someone qualified looking at rather than training through."
      : "Warm that pattern first and start lighter than last time. Let the first set decide how far you take it.",
    seekCare,
  };
}

/**
 * The same observation, on the Restore side.
 *
 * A member who reported a tight left low back after hinging does not need
 * Restore to repeat the Build advice back to them; they need the other half of
 * the answer — that today might be better spent giving that area something
 * than asking more of it.
 */
export function restoreLine(o: Observation): Recall {
  const seekCare = needsProfessionalEyes(o.note);
  return {
    headline: `Your last session left ${whereItWas(o)}.`,
    quote: o.note?.trim() || null,
    guidance: seekCare
      ? "Gentle movement and rest are reasonable today. What you described is worth someone qualified looking at."
      : "Mobility and easy work around that area may be more useful today than adding load to it.",
    seekCare,
  };
}

/**
 * The one-paragraph explanation of why any of this is worth five seconds.
 *
 * Shown once on Build rather than as a tooltip on every note field. A member
 * who does not know that what they type changes anything will not type
 * anything, and the feature is worth exactly what people put into it.
 */
export const MEMORY_DISCLOSURE = {
  title: "Your training remembers",
  body:
    "Sakred learns from more than weight and reps. What you notice — discomfort, stiffness, a weak connection, what felt strong — shapes future warm-ups, what gets suggested, and what Restore offers.",
} as const;
