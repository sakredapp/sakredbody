/**
 * Writing down what was recommended, at the moment it was recommended.
 *
 * ── Why this is on the read path ──────────────────────────────────────────
 *
 * `/api/today` is a GET that computes advice and returns it. There is no later
 * moment at which the recommendation "happens" — it happens here, and if it is
 * not written here it is not written at all. Every design that defers this to
 * a background job ends up recording what the job could reconstruct rather
 * than what the member was shown, which are the same thing right up until the
 * engine changes and then are never the same thing again.
 *
 * So it costs one round trip on the screen that opens first, and the cost is
 * bounded on purpose: one statement, all rows, one conflict target.
 *
 * ── Why it is awaited and not fired-and-forgotten ─────────────────────────
 *
 * Because the response carries the ids. A thumb with nothing to point at is a
 * shrug, and generating the id client-side would mean the client deciding what
 * counts as the same recommendation — which is the one decision that has to be
 * the database's, since it is the database that has to answer "how many
 * recommendations did Sakred make" without counting page loads.
 *
 * ── Failing quietly ───────────────────────────────────────────────────────
 *
 * A recording failure must not take Today down. The member came for advice,
 * not for analytics, and a learning loop that can break the product it is
 * learning about has its priorities exactly backwards. On failure the drafts
 * come back with no ids, the thumbs do not render, and Today is unchanged.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { trackError } from "../telemetry/index.js";
import {
  recommendationEvents,
  recommendationFeedback,
  recommendationVersions,
  type CanonicalActionType,
  type FeedbackReason,
  type RecommendationHandle,
  type RecommendationType,
  type ReasonCode,
  type Verdict,
} from "../../shared/models/recommendation.js";

/**
 * One recommendation, as the engine that made it describes it.
 *
 * No versions here on purpose — the caller says what it decided and why, and
 * `recommendationVersions` says which system decided it. A call site that
 * could pass its own version could pass a stale one.
 */
export type RecommendationDraft = {
  type: RecommendationType;
  /** Distinguishes this one from the others of its type today. */
  key: string;
  surface: string;
  canonicalActionType?: CanonicalActionType | null;
  canonicalActionId?: string | null;
  reasonCodes: readonly ReasonCode[];
  /** The shape of the decision. Never a measurement, never a rendered line. */
  provenance?: Record<string, unknown>;
  /** True only when a learned personal pattern actually moved this. */
  patternInformed?: boolean;
};

/** How a draft is addressed once it has an id. */
export const handleKey = (type: RecommendationType, key: string) => `${type}:${key}`;

export type Recorded = Map<string, RecommendationHandle>;

/**
 * Record what was just decided, and hand back what the client can point at.
 *
 * Re-deriving the same advice on the same day updates the row rather than
 * adding one. `created_at` therefore marks the first time Sakred said this
 * today and `last_shown_at` the most recent — and the grounds are the most
 * recent derivation's, because a member who checks in at noon has genuinely
 * changed why the afternoon's advice says what it says.
 */
export async function record(
  userId: string,
  onDate: string,
  drafts: readonly RecommendationDraft[],
): Promise<Recorded> {
  const out: Recorded = new Map();
  if (drafts.length === 0) return out;

  try {
    const rows = drafts.map((d) => {
      const v = recommendationVersions(d.type, { patternInformed: d.patternInformed });
      return {
        userId,
        recommendationType: d.type,
        recommendationKey: d.key,
        onDate,
        surface: d.surface,
        brainVersion: v.brainVersion,
        decisionLogicVersion: v.decisionLogicVersion,
        guidanceVersion: v.guidanceVersion,
        patternAlgorithmVersion: v.patternAlgorithmVersion,
        modelProvider: v.modelProvider,
        modelId: v.modelId,
        promptVersion: v.promptVersion,
        canonicalActionType: d.canonicalActionType ?? null,
        canonicalActionId: d.canonicalActionId ?? null,
        reasonCodes: [...d.reasonCodes] as ReasonCode[],
        provenance: d.provenance ?? {},
      };
    });

    const saved = await db
      .insert(recommendationEvents)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          recommendationEvents.userId,
          recommendationEvents.onDate,
          recommendationEvents.recommendationType,
          recommendationEvents.recommendationKey,
          recommendationEvents.surface,
        ],
        set: {
          lastShownAt: sql`now()`,
          /**
           * The versions are updated, not preserved.
           *
           * A brain that shipped at lunchtime genuinely produced the
           * afternoon's advice, and a row that kept the morning's version
           * would attribute an answer to a system that did not give it. The
           * bracket `created_at`…`last_shown_at` is what says the day spanned
           * a change; the version says which system spoke last.
           */
          brainVersion: sql`excluded.brain_version`,
          decisionLogicVersion: sql`excluded.decision_logic_version`,
          guidanceVersion: sql`excluded.guidance_version`,
          patternAlgorithmVersion: sql`excluded.pattern_algorithm_version`,
          canonicalActionType: sql`excluded.canonical_action_type`,
          canonicalActionId: sql`excluded.canonical_action_id`,
          reasonCodes: sql`excluded.reason_codes`,
          provenance: sql`excluded.provenance`,
        },
      })
      .returning({
        id: recommendationEvents.id,
        type: recommendationEvents.recommendationType,
        key: recommendationEvents.recommendationKey,
      });

    for (const r of saved) {
      out.set(handleKey(r.type as RecommendationType, r.key), {
        recommendationId: r.id,
        feedback: null,
      });
    }

    // Whatever they have already said about these.
    const ids = saved.map((r) => r.id);
    if (ids.length) {
      const verdicts = await db
        .select({
          recommendationId: recommendationFeedback.recommendationId,
          verdict: recommendationFeedback.verdict,
          reason: recommendationFeedback.reason,
        })
        .from(recommendationFeedback)
        .where(
          and(
            inArray(recommendationFeedback.recommendationId, ids),
            eq(recommendationFeedback.userId, userId),
          ),
        );
      const byId = new Map(verdicts.map((v) => [v.recommendationId, v]));
      for (const [k, handle] of Array.from(out.entries())) {
        const v = byId.get(handle.recommendationId);
        if (v) {
          out.set(k, {
            ...handle,
            feedback: {
              verdict: v.verdict as Verdict,
              reason: (v.reason as FeedbackReason | null) ?? null,
            },
          });
        }
      }
    }
  } catch (err) {
    /*
      Deliberately swallowed. See the header: the member came for advice.
      An empty map renders a Today with no thumbs and nothing else missing.
    */
    trackError("recommendation.record", err);
    return new Map();
  }

  return out;
}

/**
 * Attach the handle to whatever the engine produced, without the engine
 * knowing this layer exists.
 *
 * `recommend.ts` returns `Suggestion[]` and is tested without a database. It
 * must not learn about ids to be recordable, so the join happens here.
 */
export function withHandle<T extends object>(
  recorded: Recorded,
  type: RecommendationType,
  key: string,
  value: T,
): T & Partial<RecommendationHandle> {
  const handle = recorded.get(handleKey(type, key));
  /*
    No id means the recording failed, and the field is absent rather than
    null — the client renders a thumb when it has something to point at and
    nothing when it doesn't, and `undefined` is the shape that says so.
  */
  return { ...value, ...(handle ?? {}) } as T & Partial<RecommendationHandle>;
}
