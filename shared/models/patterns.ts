/**
 * What Sakred has learned about one member, and how sure it is allowed to be.
 *
 * ── The thing this is deliberately not ────────────────────────────────────
 *
 * A memory. There is no free-text store of impressions here, nothing a model
 * wrote about somebody and nothing that has to be re-read to be understood. A
 * pattern is a counted claim with a denominator attached, and the denominator
 * is the whole point: "you never do mobility" and "you skipped mobility twice"
 * are the same observation described by a system that is either honest about
 * how much it knows or isn't.
 *
 * ── One 👎 is not a preference ────────────────────────────────────────────
 *
 * The failure mode that ruins personalisation is instant learning. A member
 * refuses one evening practice on a night they had guests, and the product
 * quietly decides they dislike evening practices — permanently, invisibly, and
 * with no way for them to notice, let alone argue. From their side the app has
 * simply become worse for no reason.
 *
 * Three defences, and they are all in this file:
 *
 *   evidence-weighted  a claim needs a minimum weight of observation before it
 *                      exists at all, and its confidence is a function of that
 *                      weight rather than of how recently it was reinforced.
 *   decaying           every observation loses half its weight every
 *                      `HALF_LIFE_DAYS`. A season of evidence from March does
 *                      not still be governing August.
 *   reversible         nothing here accumulates. Patterns are recomputed from
 *                      the observations that currently exist, so behaviour
 *                      that stops is a pattern that fades on its own rather
 *                      than one somebody has to remember to delete.
 *
 * ── And what a pattern is allowed to do ───────────────────────────────────
 *
 * Reorder. Nothing else. `rankingAdjustment` is bounded well below what the
 * read of the day is worth, for the same reason `cycleLean` is clamped: a
 * product that lets a preference outrank a body has stopped reading the body.
 * A member who has declined long evening practices eleven times gets short
 * ones offered first; a member who is wrecked gets restoration offered first
 * no matter what they usually like.
 */

import type { ReasonCode } from "./brain.js";

// ─── What can be claimed ───────────────────────────────────────────────────

/**
 * The closed list, and it is short because it is limited to what the app can
 * actually count today.
 *
 * Absent on purpose: anything requiring a causal read. "Lower-output days tend
 * to follow two consecutive hard sessions" is a real and valuable claim and it
 * is a claim about a body, derived by correlating training load against
 * next-day output — which needs a second kind of evidence (measured output)
 * and a much more careful method than counting. Writing it as if it were the
 * same sort of fact as "declines evening practices" would put a hypothesis and
 * a tally in one table with one confidence scale.
 */
export const PATTERN_TYPES = [
  /**
   * Of the recommendations Sakred made in this category, how many the member
   * went on to do. Their answer in behaviour.
   */
  "category_completion",
  /**
   * How often they refused it outright — a dismissal or a 👎. Distinct from
   * not completing: ignoring a suggestion is silence, and refusing it is an
   * answer.
   */
  "category_refusal",
] as const;

export type PatternType = (typeof PATTERN_TYPES)[number];

/** One thing that happened to one recommendation. */
export type Observation = {
  /** The member's own date the recommendation was made on. */
  onDate: string;
  /** What it was about — a category id. */
  key: string;
  /** Did they do it. */
  completed: boolean;
  /** Did they say no: dismissed the card, or 👎 it. */
  refused: boolean;
};

// ─── How much an old observation is worth ──────────────────────────────────

/**
 * Three weeks to halve.
 *
 * Chosen so that a month of consistent behaviour outweighs a week of it and a
 * season of it does not outweigh the last fortnight. Short enough that
 * somebody who changes — a new job, an injury healed, winter ending — is not
 * arguing with their own March.
 */
export const HALF_LIFE_DAYS = 21;

/** Beyond this an observation is not decayed, it is discarded. */
export const WINDOW_DAYS = 90;

/**
 * The weight below which nothing may be claimed at all.
 *
 * Deliberately expressed in decayed weight rather than in a raw count, so
 * three things that happened last week clear the bar and three that happened
 * in May do not.
 */
export const MIN_WEIGHT = 3;

export const CONFIDENCE_MODERATE = 6;
export const CONFIDENCE_HIGH = 12;

export type Confidence = "low" | "moderate" | "high";

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** What one observation from `ageDays` ago still counts for. */
export function weightAt(ageDays: number): number {
  if (ageDays < 0 || ageDays > WINDOW_DAYS) return 0;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

// ─── A claim ───────────────────────────────────────────────────────────────

export type Pattern = {
  type: PatternType;
  /** The category the claim is about. */
  key: string;
  /**
   * The claim, as a proportion — and never on its own.
   *
   * `rate` without `weight` is the number that makes a product say "you always
   * skip this" about somebody who skipped it once. They travel together
   * everywhere, including into the database, precisely so that no consumer can
   * pick up one without the other.
   */
  rate: number;
  /** Decayed weight behind it. Not a count — see MIN_WEIGHT. */
  weight: number;
  /** Raw observations, for a human reading the record. */
  observationCount: number;
  windowStart: string;
  windowEnd: string;
  confidence: Confidence;
};

/**
 * Everything currently claimable about one member.
 *
 * Recomputed whole, never merged into what was there before. That is what
 * makes a pattern reversible: a member who starts doing the thing they used to
 * refuse has no stale row arguing otherwise, because there is no accumulation
 * to argue with.
 */
export function derivePatterns(observations: readonly Observation[], today: string): Pattern[] {
  type Bucket = { key: string; weight: number; done: number; refused: number; n: number; first: string; last: string };
  const buckets = new Map<string, Bucket>();

  for (const o of observations) {
    const w = weightAt(daysBetween(o.onDate, today));
    if (w === 0) continue;
    const b = buckets.get(o.key) ?? {
      key: o.key, weight: 0, done: 0, refused: 0, n: 0, first: o.onDate, last: o.onDate,
    };
    b.weight += w;
    if (o.completed) b.done += w;
    if (o.refused) b.refused += w;
    b.n += 1;
    if (o.onDate < b.first) b.first = o.onDate;
    if (o.onDate > b.last) b.last = o.onDate;
    buckets.set(o.key, b);
  }

  const out: Pattern[] = [];
  for (const b of Array.from(buckets.values())) {
    if (b.weight < MIN_WEIGHT) continue;
    const confidence: Confidence =
      b.weight >= CONFIDENCE_HIGH ? "high" : b.weight >= CONFIDENCE_MODERATE ? "moderate" : "low";

    const base = {
      key: b.key,
      weight: round(b.weight),
      observationCount: b.n,
      windowStart: b.first,
      windowEnd: b.last,
      confidence,
    };
    out.push({ ...base, type: "category_completion", rate: round(b.done / b.weight) });
    out.push({ ...base, type: "category_refusal", rate: round(b.refused / b.weight) });
  }

  /* Stable order, so a stored set and a recomputed set compare cleanly. */
  return out.sort((a, b) => a.type.localeCompare(b.type) || a.key.localeCompare(b.key));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ─── What a claim is allowed to do ─────────────────────────────────────────

/**
 * The most a member's history may move a category, in the same units
 * `suggestToday` scores in.
 *
 * Fit contributes up to 2 and novelty up to 1 there. This is 0.5, which means
 * a learned preference can reorder two options the day already permits and can
 * never promote one it doesn't. That bound is the entire safety argument for
 * letting the loop touch ranking at all.
 */
export const MAX_ADJUSTMENT = 0.5;

/**
 * Low confidence moves nothing.
 *
 * Not a small effect — none. The alternative is a product that acts on three
 * observations "only a little", which is indistinguishable to the member from
 * acting on three observations, and is how a bad Tuesday becomes a preference.
 */
const CONFIDENCE_WEIGHT: Readonly<Record<Confidence, number>> = {
  low: 0,
  moderate: 0.6,
  high: 1,
};

/**
 * How much this member's own history should move each category today.
 *
 * Completion pulls up, refusal pulls down, and refusal is weighted heavier:
 * saying no is an answer and not doing something is silence, and silence has a
 * hundred explanations that have nothing to do with the suggestion.
 */
export function rankingAdjustments(patterns: readonly Pattern[]): Map<string, number> {
  const byKey = new Map<string, { completion?: Pattern; refusal?: Pattern }>();
  for (const p of patterns) {
    const e = byKey.get(p.key) ?? {};
    if (p.type === "category_completion") e.completion = p;
    else e.refusal = p;
    byKey.set(p.key, e);
  }

  const out = new Map<string, number>();
  for (const [key, { completion, refusal }] of Array.from(byKey.entries())) {
    let score = 0;
    if (completion) {
      /* Centred on a half: doing half of what was suggested is neutral. */
      score += (completion.rate - 0.5) * 2 * CONFIDENCE_WEIGHT[completion.confidence];
    }
    if (refusal) {
      score -= refusal.rate * 2 * CONFIDENCE_WEIGHT[refusal.confidence];
    }
    const bounded = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, score * MAX_ADJUSTMENT));
    if (bounded !== 0) out.set(key, round(bounded));
  }
  return out;
}

/**
 * What a member is told about a claim, if they ask.
 *
 * Plain, countable, and always with the denominator. There is no sentence
 * available here that says "you always" or "you never" — those are the two
 * words that make a tally sound like a judgement about a person.
 */
export function patternSentence(p: Pattern, label: string): string {
  const pct = Math.round(p.rate * 100);
  if (p.type === "category_completion") {
    return `You've done ${pct}% of the ${label.toLowerCase()} Sakred suggested, across ${p.observationCount} suggestions.`;
  }
  return `You've turned down ${pct}% of the ${label.toLowerCase()} Sakred suggested, across ${p.observationCount} suggestions.`;
}

/** The code a recommendation carries when a pattern moved it. */
export const PATTERN_REASON: ReasonCode = "personal_pattern";
