/**
 * What Sakred recommended, to whom, when, and on what grounds.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 *
 * The app has an events table, and it records what a *member* did: completed a
 * habit, started a session, clicked a buy link. It has never recorded what the
 * product said first. So every question of the form "did the thing we suggested
 * actually help" was unanswerable — not hard, unanswerable, because the left
 * side of the join did not exist.
 *
 * ── One row per recommendation, not per render ────────────────────────────
 *
 * `/api/today` recomputes on every open. A member who checks the app four
 * times before lunch has not been recommended four different things; they have
 * been shown the same three, four times. Recording a row per response would
 * make "how many recommendations did Sakred make" a number about scrolling.
 *
 * So a recommendation is identified by what it *is* — member, local date,
 * type, key — and re-deriving it is an upsert. The row is created once and its
 * id is stable, which is also what makes it addressable: feedback and
 * behaviour attribution both need something to point at, and the client can
 * only point at an id it was given.
 *
 * ── Reason codes, not reason sentences ────────────────────────────────────
 *
 * The obvious thing to store is the because-line the member read: "You slept
 * 5h 10m against your usual 7h 20m." Storing it would put a health measurement
 * into a second table, in prose, where no health policy is looking.
 *
 * Codes instead. `sleep_deficit_large` says everything the analysis needs — it
 * is queryable, it survives a copy change, and it carries no number. The
 * sentence stays where it was generated and is never persisted.
 *
 * ── Lifecycle only where it is derivable ──────────────────────────────────
 *
 * shown / accepted / started / completed / dismissed / expired is the standard
 * funnel and most of it would be fiction here. A row gets a timestamp when
 * something in the product genuinely establishes it: `dismissedAt` from the
 * dismissal the member actually sent, `completedAt` from a finished session in
 * the category that was suggested. Nothing writes a stage to make the funnel
 * look complete. A NULL means we do not know, which is a fact worth storing
 * and the one most analytics schemas quietly destroy.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  BRAIN_VERSION,
  DECISION_LOGIC,
  GUIDANCE_VERSION,
  PATTERN_ALGORITHM_VERSION,
  REASON_CODES,
  type DecisionEngine,
  type ReasonCode,
} from "./brain.js";

/**
 * The vocabulary of grounds lives in brain.ts, with the versions it moves
 * with — a reason code is part of the engine's identity, not of the table's.
 * Re-exported here because this is where callers already look.
 */
export { REASON_CODES, type ReasonCode };
export const reasonCodeEnum = z.enum(REASON_CODES);

// ─── What counts as a recommendation ───────────────────────────────────────

/**
 * The closed list, and it is short on purpose.
 *
 * A recommendation is something Sakred *chose* for *this member* out of
 * alternatives it could have chosen instead. That rules out most of what looks
 * like intelligence on the screen:
 *
 *   · the moon and season cards — the same words for everybody in the world
 *     that day, selected by an ephemeris. True, useful, not a recommendation.
 *   · a habit the member themselves committed to, appearing because it is due.
 *     That is their schedule, not our advice.
 *   · a coach's habit proposal. A person recommended that, and a 👎 on it is
 *     feedback about a human being, which is a different product with
 *     different consequences. See server/habits/routes.ts.
 */
export const RECOMMENDATION_TYPES = [
  /** One of the three options on Today. Three rows per member per day. */
  "today_option",
  /** Restore or build — the canonical read of the day. */
  "terrain_direction",
  /** Whether today's session is gated, and what the gate asks for. */
  "build_gate",
  /** What the phase estimate suggests, for a member tracking a rhythm. */
  "rhythm_guidance",
  /** How their own state is likely to land on other people. */
  "relating_read",
] as const;

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];
export const recommendationTypeEnum = z.enum(RECOMMENDATION_TYPES);

/**
 * Which engine decided it.
 *
 * Not every versioned engine appears here. `habit` is versioned in brain.ts
 * and owns no recommendation type, because everything the habit engine decides
 * is either the member's own schedule or a coach's proposal. That asymmetry is
 * the audit's finding, kept visible rather than smoothed over by inventing a
 * type to fill the gap.
 */
export const ENGINE_OF: Readonly<Record<RecommendationType, DecisionEngine>> = {
  today_option: "today",
  terrain_direction: "terrain",
  build_gate: "build",
  rhythm_guidance: "rhythm",
  relating_read: "rhythm",
};

// ─── What it points at ─────────────────────────────────────────────────────

/**
 * The canonical thing a member would do about it.
 *
 * Deliberately the id of something that already exists elsewhere in the
 * database rather than a new noun. Attribution works by finding the existing
 * completion row — a finished workout, a tracked-habit entry — and matching
 * it, so inventing a parallel "recommended action" record would create a
 * second truth to keep in step with the first.
 */
export const CANONICAL_ACTION_TYPES = [
  "exercise_category",
  "training_session",
  "tracked_habit",
] as const;
export type CanonicalActionType = (typeof CANONICAL_ACTION_TYPES)[number];

// ─── The record ────────────────────────────────────────────────────────────

export const recommendationEvents = pgTable(
  "recommendation_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    userId: varchar("user_id").notNull(),

    recommendationType: text("recommendation_type").notNull(),

    /**
     * What distinguishes this recommendation from the others of its type on
     * the same day — a category id for a Today option, the lean for terrain,
     * a constant for the ones there is only ever one of.
     */
    recommendationKey: text("recommendation_key").notNull(),

    /** The member's own calendar date, as Today computed it. */
    onDate: text("on_date").notNull(),

    /** Where it was shown. Same recommendation from two screens is two facts. */
    surface: text("surface").notNull(),

    // ── which decision system produced it ────────────────────────────────
    brainVersion: text("brain_version").notNull(),
    /** `engine@semver` — see brain.ts on why this is one column and not six. */
    decisionLogicVersion: text("decision_logic_version").notNull(),
    guidanceVersion: text("guidance_version").notNull(),
    /** Null unless a learned pattern actually moved this recommendation. */
    patternAlgorithmVersion: text("pattern_algorithm_version"),

    // ── and, for the one corner of the product that has a model, which ───
    /**
     * NULL for everything the member currently sees, and that is the finding
     * rather than an omission. docs/intelligence-map.md holds the proof and
     * script/test-intelligence-map.ts fails the day it stops being true.
     */
    modelProvider: text("model_provider"),
    modelId: text("model_id"),
    promptVersion: text("prompt_version"),

    // ── what it pointed toward ───────────────────────────────────────────
    canonicalActionType: text("canonical_action_type"),
    canonicalActionId: text("canonical_action_id"),

    // ── why ──────────────────────────────────────────────────────────────
    /** REASON_CODES, no values. See the header. */
    reasonCodes: jsonb("reason_codes").$type<ReasonCode[]>().notNull().default(sql`'[]'::jsonb`),
    /**
     * The decision's own shape — rank within its slot, whether it was the
     * stretch option, the readiness level it was chosen under. Never a
     * measurement, never a sentence a member read.
     */
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

    // ── lifecycle, written only where it is derivable ────────────────────
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Refreshed each time the recommendation is served, so re-derivation is visible. */
    lastShownAt: timestamp("last_shown_at", { withTimezone: true }).notNull().defaultNow(),
    /** The member started the thing it pointed at. */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** They finished it. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** They said not this, explicitly. Not the same as ignoring it. */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => [
    /**
     * The identity of a recommendation.
     *
     * Re-deriving the same advice on the same day is one recommendation shown
     * again, and the upsert that lands on this index is what keeps the table a
     * record of decisions rather than a record of page loads.
     */
    uniqueIndex("uq_recommendation_identity").on(
      t.userId,
      t.onDate,
      t.recommendationType,
      t.recommendationKey,
      t.surface,
    ),
    index("idx_recommendation_user_date").on(t.userId, t.onDate),
    index("idx_recommendation_type_time").on(t.recommendationType, t.createdAt),
    index("idx_recommendation_action").on(t.canonicalActionType, t.canonicalActionId),
  ],
);

export type RecommendationEvent = typeof recommendationEvents.$inferSelect;

// ─── The versions a row carries ────────────────────────────────────────────

export type RecommendationVersions = {
  brainVersion: string;
  decisionLogicVersion: string;
  guidanceVersion: string;
  patternAlgorithmVersion: string | null;
  modelProvider: string | null;
  modelId: string | null;
  promptVersion: string | null;
};

/**
 * Stamp a recommendation with the system that produced it.
 *
 * One function so no call site can record a partial identity — a row with a
 * brain version and no decision version is worse than no row, because it looks
 * answerable and isn't.
 */
export function recommendationVersions(
  type: RecommendationType,
  opts: { patternInformed?: boolean } = {},
): RecommendationVersions {
  const engine = ENGINE_OF[type];
  return {
    brainVersion: BRAIN_VERSION,
    decisionLogicVersion: `${engine}@${DECISION_LOGIC[engine].version}`,
    guidanceVersion: GUIDANCE_VERSION,
    patternAlgorithmVersion: opts.patternInformed ? PATTERN_ALGORITHM_VERSION : null,
    /**
     * Not a placeholder. No member-facing recommendation in this repository is
     * produced by a language model, and writing a provider here to make the
     * schema look complete would make deterministic output indistinguishable
     * from generated output the first time either is wrong.
     */
    modelProvider: null,
    modelId: null,
    promptVersion: null,
  };
}

// ─── Feedback ──────────────────────────────────────────────────────────────

/**
 * Why a member said no.
 *
 * Optional, always — a thumbs-down that demands a reason before it registers
 * is a survey, and the member who was about to tell us something closes it.
 * The list exists so that the ones who do answer produce data that can be
 * counted rather than read.
 *
 * "Too difficult" and "too easy" are opposite failures of the same decision
 * and are the two most actionable rows in the table; "bad timing" is the one
 * that must never be read as a preference, because it is about a Tuesday.
 */
export const FEEDBACK_REASONS = [
  "not_right_for_me",
  "bad_timing",
  "already_do_this",
  "too_difficult",
  "too_easy",
  "didnt_feel_good",
  "not_relevant",
  "other",
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_REASON_LABELS: Readonly<Record<FeedbackReason, string>> = {
  not_right_for_me: "Not right for me",
  bad_timing: "Bad timing",
  already_do_this: "I already do this",
  too_difficult: "Too difficult",
  too_easy: "Too easy",
  didnt_feel_good: "Didn't feel good",
  not_relevant: "Not relevant",
  other: "Other",
};

export const VERDICTS = ["helpful", "not_helpful"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const recommendationFeedback = pgTable(
  "recommendation_feedback",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendationEvents.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    verdict: text("verdict").notNull(),
    /** One of FEEDBACK_REASONS, and null is the common case. */
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * One verdict per member per recommendation.
     *
     * Changing your mind updates the row rather than appending. The history of
     * a member toggling a thumb is not evidence about anything, and keeping it
     * would mean every aggregate had to work out which of five rows counted.
     */
    uniqueIndex("uq_recommendation_feedback").on(t.recommendationId, t.userId),
    index("idx_recommendation_feedback_user").on(t.userId, t.createdAt),
  ],
);

export type RecommendationFeedback = typeof recommendationFeedback.$inferSelect;

export const feedbackSchema = z.object({
  verdict: z.enum(VERDICTS),
  reason: z.enum(FEEDBACK_REASONS).nullish(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

/**
 * What the client is handed alongside a recommendation.
 *
 * The id is the whole point — a thumb with nothing to point at is a shrug.
 */
export type RecommendationHandle = {
  recommendationId: string;
  feedback: { verdict: Verdict; reason: FeedbackReason | null } | null;
};
