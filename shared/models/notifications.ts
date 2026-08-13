/**
 * A notification exists because something actually happened.
 *
 * Not because a feature exists and wants attention. Same rule the coaching
 * navigation follows — Coach exists because a relationship does, Your Plan
 * because a plan does — and it is the reason there is no "turn on coaching
 * notifications" module for somebody who has no coach.
 *
 * ── Evidence, not state ───────────────────────────────────────────────────
 *
 * A row here records that a human interaction occurred and has not been seen.
 * It makes nothing true. An old `checkin_requested` does not mean a request is
 * still open, and an old `plan_activated` does not resurrect an ended plan —
 * those are read from `coaching_checkin_requests.status` and
 * `coaching_plans.status`, unchanged. Tapping a notification never grants
 * access to anything; the app re-fetches under current authorization.
 *
 * ── The type is the identity, the copy is not ─────────────────────────────
 *
 * `type` and `resource_*` are what code matches on. `title`/`body` are
 * sentences somebody will eventually want reworded, and a reworded sentence
 * must never change behaviour.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * The events worth telling a human about.
 *
 * All five are things a *person* did. No `sleep.poor`, no `readiness.dropped`,
 * no `steps.low` — a coach can look at authorized terrain when they choose to,
 * and a product that pushes body state at them has made the member into a
 * monitored subject rather than someone being coached.
 *
 * Notably absent: `coaching.plan_revised`. Revising an active plan is not an
 * operation this app has — every mutating plan route requires a draft, so a
 * "revision" is a new plan with a new id, and its activation already notifies.
 * A revision type would need a stable revision identity to dedupe on, and
 * inventing one to fill the gap would be faking idempotency.
 */
export const NOTIFICATION_TYPES = [
  "coaching.message",
  "coaching.checkin_requested",
  "coaching.checkin_completed",
  "coaching.plan_activated",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    type: text("type").notNull(),
    /** The human who did it. Null for anything the system did on its own. */
    actorUserId: varchar("actor_user_id"),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),

    /** Safe on a lock screen, because one day it will be on one. */
    title: text("title").notNull(),
    body: text("body"),

    dedupeKey: text("dedupe_key").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_notification_dedupe").on(t.dedupeKey),
    index("idx_notifications_user").on(t.userId, t.createdAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;

/**
 * Copy that says what happened and nothing about a body.
 *
 * ── The rule, stated where it can be checked ──────────────────────────────
 *
 * "Sarah completed your check-in" is fine. "Sarah reports severe soreness and
 * poor sleep" is a health disclosure on a lock screen, readable by anyone
 * holding the phone, retained by whatever caches notifications. The difference
 * is not tone — it is whether opening the app was required to learn it.
 *
 * So these take a first name and nothing else. There is no parameter here that
 * could carry a value, which is deliberate: the function cannot leak what it
 * cannot receive.
 */
export const NOTIFICATION_COPY: Readonly<
  Record<NotificationType, (who: string) => { title: string; body?: string }>
> = {
  "coaching.message": (who) => ({ title: `${who} sent you a message` }),
  "coaching.checkin_requested": (who) => ({ title: `${who} asked for a quick check-in` }),
  "coaching.checkin_completed": (who) => ({ title: `${who} completed your check-in` }),
  /**
   * Deliberately impersonal when the actor is not the member's coach.
   *
   * An admin with `superviseCoaching` can activate a plan. Printing "Nick
   * updated your Coach's Plan" over an admin's action would attribute somebody
   * else's decision to Nick — the same lie the plan tables refuse to store, so
   * the sentence must not tell it either.
   */
  "coaching.plan_activated": (who) =>
    who ? { title: `${who} updated your Coach's Plan` } : { title: "Your Coach's Plan was updated" },
};

/**
 * The dedupe key for an event.
 *
 * Built only from ids that already exist and do not change when a request is
 * retried. No clock, no random, no rendered copy — each of those would produce
 * a different key on the second attempt and a duplicate notification, which is
 * exactly the failure the unique index is there to prevent.
 */
export function dedupeKeyFor(input: {
  type: NotificationType;
  resourceId: string;
  recipientId: string;
}): string {
  return `${input.type}:${input.resourceId}:${input.recipientId}`;
}
