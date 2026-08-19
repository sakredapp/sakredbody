/**
 * Connecting a recommendation to what the member actually did.
 *
 * ── The rule this file exists to keep ─────────────────────────────────────
 *
 * No new completion system. Sakred already knows when a workout finished, when
 * a habit was ticked, when a suggestion was refused — in the tables that own
 * those facts. Attribution means finding the recommendation those existing
 * rows answer, and stamping it. It never means recording the completion a
 * second time in a shape that suits analytics, because two records of one
 * event drift, and the analytics copy is always the one that gets believed.
 *
 * ── And the rule about what is NOT derivable ──────────────────────────────
 *
 * The standard funnel is shown → accepted → started → completed → dismissed →
 * expired, and most of it would be invention here.
 *
 *   shown      Yes — the recommendation was computed and returned.
 *   accepted   Only from an explicit act. The member tapped this card. Not
 *              from "they later did something in that category", because a
 *              man who was always going to run on Thursday did not accept a
 *              recommendation to run, and counting him as having accepted one
 *              would make the engine look persuasive by measuring the weather.
 *   completed  Yes — they finished a session in the category that was
 *              recommended, that day. Stated as co-occurrence, which is what
 *              it is; the acceptance stamp is what separates the two cases.
 *   dismissed  Yes — they said no, explicitly, and the app has the row.
 *   expired    Not implemented. A recommendation that was neither taken nor
 *              refused is a NULL in three columns, and that is already the
 *              complete truth about it. A nightly job stamping `expired_at`
 *              on yesterday's rows would add a timestamp and no information.
 *
 * Everything here is best-effort. A member's workout is saved whether or not
 * the stamp lands, and an attribution failure must never fail the request that
 * carried the real event.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db.js";
import { trackError } from "../telemetry/index.js";
import { recommendationEvents } from "../../shared/models/recommendation.js";

/**
 * They said no to this category, explicitly.
 *
 * Both scopes stamp the same column. "Not today" and "not for me" are a real
 * and important distinction and it is already recorded, in
 * `suggestion_dismissals`, which is where it belongs; duplicating the scope
 * here would create a second place to get it wrong.
 */
export async function markDismissed(userId: string, onDate: string, category: string): Promise<void> {
  try {
    await db
      .update(recommendationEvents)
      .set({ dismissedAt: sql`now()` })
      .where(
        and(
          eq(recommendationEvents.userId, userId),
          eq(recommendationEvents.onDate, onDate),
          eq(recommendationEvents.recommendationType, "today_option"),
          eq(recommendationEvents.recommendationKey, category),
          isNull(recommendationEvents.dismissedAt),
        ),
      );
  } catch (err) {
    trackError("recommendation.dismiss", err);
  }
}

/**
 * They tapped it.
 *
 * The only honest source of acceptance, and it is why there is an endpoint for
 * this rather than an inference. Idempotent: the first tap is the acceptance,
 * and a member who opens the same card three times has not accepted it three
 * times.
 */
export async function markAccepted(userId: string, recommendationId: string): Promise<boolean> {
  try {
    const rows = await db
      .update(recommendationEvents)
      .set({ acceptedAt: sql`now()` })
      .where(
        and(
          eq(recommendationEvents.id, recommendationId),
          eq(recommendationEvents.userId, userId),
          isNull(recommendationEvents.acceptedAt),
        ),
      )
      .returning({ id: recommendationEvents.id });
    return rows.length > 0;
  } catch (err) {
    trackError("recommendation.accept", err);
    return false;
  }
}

/**
 * They did something in a category that was recommended today.
 *
 * Categories, plural, because one session genuinely contributes to several —
 * "Back + Mobility" is strength and mobility and recovery, and it answers all
 * three recommendations if all three were made.
 *
 * Scoped to the member's own date so a session finished at 00:30 credits the
 * day the member is living rather than the day UTC is having.
 */
export async function markCompleted(
  userId: string,
  onDate: string,
  categories: readonly string[],
): Promise<void> {
  if (categories.length === 0) return;
  try {
    await db
      .update(recommendationEvents)
      .set({ completedAt: sql`now()` })
      .where(
        and(
          eq(recommendationEvents.userId, userId),
          eq(recommendationEvents.onDate, onDate),
          eq(recommendationEvents.recommendationType, "today_option"),
          inArray(recommendationEvents.recommendationKey, [...categories]),
          isNull(recommendationEvents.completedAt),
        ),
      );
  } catch (err) {
    trackError("recommendation.complete", err);
  }
}
