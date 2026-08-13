/**
 * Writing a notification, inside the transaction that earned it.
 *
 * ── Why `tx` is required and not optional ─────────────────────────────────
 *
 * Every caller of this is in the middle of a business transaction, and the
 * point of the whole design is that the notification commits with it. An
 * optional `tx` would make the safe form the one you have to remember, and the
 * unsafe form the one that compiles — which is how the nested-transaction bug
 * in plan activation happened. Making it mandatory means "this notification can
 * outlive a rolled-back message" is not a state the type system permits.
 *
 * ── Deduped by the database ───────────────────────────────────────────────
 *
 * `onConflictDoNothing` against the unique index. A retried request, a
 * double-tapped send, two instances racing — one notification. Nothing here
 * remembers anything; the constraint is the mechanism.
 *
 * ── And the push waits for the commit ─────────────────────────────────────
 *
 * Writing the row is the notification; the push is a consequence of it, queued
 * through `onCommit` and sent only once the transaction the caller was in has
 * actually committed. The row is what a member can always come back to. The
 * push is a tap on the shoulder that may never land — no permission, no device,
 * a Firebase outage — and nothing about the product depends on it landing.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, onCommit, type Tx } from "../db.js";
import { pushToUser } from "./push.js";
import { users } from "../../shared/models/auth.js";
import {
  notifications,
  NOTIFICATION_COPY,
  dedupeKeyFor,
  type NotificationType,
} from "../../shared/models/notifications.js";

/**
 * The actor's first name, for the copy.
 *
 * Read inside the transaction so it cannot disagree with what the event
 * recorded. Falls back to nothing rather than to "Your coach", which lets
 * `NOTIFICATION_COPY` choose the impersonal sentence — better than naming
 * somebody the reader has no relationship with.
 */
async function firstNameOf(tx: Tx, userId: string | null): Promise<string> {
  if (!userId) return "";
  const [row] = await tx
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.firstName?.trim() || "";
}

/**
 * Record that something happened, for one person.
 *
 * Returns whether a row was created — false means the dedupe key already
 * existed, which is a success, not a failure.
 */
export async function notify(
  tx: Tx,
  input: {
    /** Resolved from canonical state, at the event. Never inferred later. */
    recipientId: string;
    type: NotificationType;
    /** The human who did it, if a human did. */
    actorId: string | null;
    resourceType: string;
    resourceId: string;
    /**
     * Overrides the actor's name in the copy — pass `""` to get the
     * impersonal sentence. Used when the actor is an admin acting under
     * `superviseCoaching`, whose name would attribute the action to the wrong
     * person and whose identity the member has no reason to be shown.
     */
    nameOverride?: string;
  },
): Promise<boolean> {
  // Nobody is notified about their own action. It is not an interaction they
  // are waiting on; it is the thing they just did.
  if (input.recipientId === input.actorId) return false;

  const who =
    input.nameOverride !== undefined ? input.nameOverride : await firstNameOf(tx, input.actorId);
  const copy = NOTIFICATION_COPY[input.type](who);

  const rows = await tx
    .insert(notifications)
    .values({
      userId: input.recipientId,
      type: input.type,
      actorUserId: input.actorId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      title: copy.title,
      body: copy.body ?? null,
      dedupeKey: dedupeKeyFor({
        type: input.type,
        resourceId: input.resourceId,
        recipientId: input.recipientId,
      }),
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });

  if (!rows.length) return false;

  /**
   * The phone hears about it only if the database kept it.
   *
   * Queued rather than sent, because this statement is still a proposal — see
   * `onCommit` in db.ts. Two things fall out of putting it here rather than in
   * each producer, and both are the point:
   *
   *   · Every producer gets delivery by writing a notification, so "we forgot to
   *     push for check-in completions" is not a bug that can be introduced.
   *   · The dedupe is the same dedupe. A retried request that inserts no row
   *     returns above and sends nothing — one notification, one push, enforced
   *     by the unique index rather than by anyone remembering.
   */
  onCommit(tx, () =>
    pushToUser(input.recipientId, {
      title: copy.title,
      body: copy.body ?? null,
      data: {
        notificationId: rows[0]!.id,
        type: input.type,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        /**
         * Which client a coach's tap should open. An opaque id and nothing
         * else — the workspace still has to find it in its own authorized
         * client list before any thread opens, so a notification about a member
         * since reassigned away resolves to nothing.
         */
        actorUserId: input.actorId ?? "",
      },
    }),
  );

  return true;
}

/**
 * Mark the notifications about a resource as seen.
 *
 * So opening Nick's conversation clears the "Nick sent you a message" badge
 * rather than leaving two unread systems disagreeing forever — the coach badge
 * saying one while the thread says zero.
 */
export async function markResourceSeen(opts: {
  userId: string;
  type: NotificationType;
  resourceIds: string[];
}): Promise<void> {
  if (!opts.resourceIds.length) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, opts.userId),
        eq(notifications.type, opts.type),
        inArray(notifications.resourceId, opts.resourceIds),
        isNull(notifications.readAt),
      ),
    );
}
