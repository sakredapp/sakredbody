/**
 * Telemetry — what actually happened.
 *
 * There was none. No habit-completion event, no enrollment event, and — for a
 * business that earns on affiliate links — no click event on a buy link. That
 * is fine while nobody is using the app and indefensible the day someone is.
 *
 * ── Shape ─────────────────────────────────────────────────────────────────
 *
 * One table, one row per thing that happened. Not one table per feature: the
 * questions worth asking cut across features ("what did this member do in
 * their first week", "which surface produces buy clicks") and a schema per
 * feature makes those a union of six queries.
 *
 * `name` is `domain.action` — `habit.complete`, `offering.register`,
 * `product.buy_click`. Dotted so a prefix match is a category query, and
 * closed to a known list so it can't drift into `habitComplete`,
 * `habit_completed` and `Habit.Complete` all meaning the same thing.
 *
 * `props` is jsonb, deliberately unvalidated. The moment an event needs a
 * schema migration to add a field, it stops being recorded. What matters is
 * that the *name* is disciplined; the payload can be loose.
 *
 * ── What this is not ──────────────────────────────────────────────────────
 *
 * Not analytics-vendor telemetry — no third party, no device fingerprint, no
 * cross-site anything. It is the app's own record of its own behaviour, in the
 * app's own database, and it is deletable per member because it is keyed on
 * `user_id`.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  jsonb,
  timestamp,
  index,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── The closed list ───────────────────────────────────────────────────────

/**
 * Every event the app may record.
 *
 * Adding one is a line here plus the call site. Keeping it closed is what
 * makes the data answerable a year from now — an open string field becomes
 * six spellings of the same event and no way to tell which is which.
 */
export const EVENT_NAMES = [
  // The daily loop — the core engagement metric, previously untracked.
  "habit.complete",
  "habit.uncomplete",
  "habit.remove",
  "habit.restore",
  "intention.set",
  "intention.met",
  "daily_note.view",

  // Protocols.
  "routine.enroll",
  "routine.pause",
  "routine.resume",
  "routine.abandon",
  "routine.complete",

  // Offerings.
  "offering.view",
  "offering.register",
  "offering.waitlist",
  "offering.apply",
  "offering.withdraw",
  "offering.join_room",
  "session.attend",

  // Commerce. `product.buy_click` is the one that pays for the lights.
  "product.view",
  "product.buy_click",
  "shopping_list.open",
  "shopping_list.checkoff",

  // Library.
  "ebook.open",
  "ebook.read",

  // Community.
  "community.post",
  "community.reply",
  "community.react",
  "community.search",
  // Moderation. A spike on either is a community problem, not a metric.
  "community.report",
  "community.block",

  // Wins.
  "win.earned",
  "win.share",
  "win.export_image",

  // Masterminds. Applications are the demand signal for a cohort — the gap
  // between `applied` and the seats actually confirmed is what says whether
  // the next one should be bigger or the bar should be higher.
  "cohort.created",
  "cohort.applied",

  // Getting in. `auth.throttled` is the one to watch: a spike on it is
  // somebody guessing passwords, and it is the only signal we get.
  "auth.login",
  "auth.register",
  "auth.throttled",
  // Password recovery. `requested` carries whether the address was known and
  // whether the mail provider accepted it — the second is the one that matters
  // operationally, because a provider quietly refusing every send looks
  // identical from the member's side to an email that is merely slow.
  "auth.reset.requested",
  "auth.reset.completed",
  // The way in. `onboarding.answered` is the one that can be audited: it
  // carries what was chosen for each of the three questions, per account, so
  // "has everybody answered" is a query rather than a belief about what is in
  // some phone's localStorage.
  "onboarding.shown",
  "onboarding.answered",
  // What the phone said about its own Health store. Diagnosis, not product
  // behaviour: when a device reports the feature unavailable, this is the only
  // evidence anyone has, and without it the answer is guesswork.
  "health.probe",

  // Administration. Who changed whose access, and when — the one category
  // where the audit trail matters more than the aggregate.
  "member.update",

  // Build. Starting and finishing are separate on purpose: the gap between
  // them is the abandonment rate, which is the number that decides whether
  // prescribed logging actually works.
  "training.session_start",
  "training.session_finish",

  // Support. Worth counting because the category breakdown says where the
  // product is confusing, and a spike in "technical" usually arrives before
  // the error events do.
  "support.submitted",

  // Failures worth knowing about, rather than an empty catch.
  "error.client",
  "error.server",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
export const eventNameEnum = z.enum(EVENT_NAMES);

// ─── The table ─────────────────────────────────────────────────────────────

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    /** Null for something that happened before sign-in. */
    userId: varchar("user_id"),

    name: text("name").notNull(),

    /**
     * Where in the app it happened — "today", "shop_detail", "routine_list".
     * The same event from two surfaces is two different facts: a buy click
     * from a shopping list is not a buy click from a product page.
     */
    surface: text("surface"),

    /** The thing it happened to, when there is one. Not a foreign key: an
     *  event about a deleted product is still a true fact about the past. */
    subjectId: text("subject_id"),

    props: jsonb("props").$type<Record<string, unknown>>().default({}),

    /**
     * The member's own calendar date, in their timezone. Denormalised on
     * purpose: nearly every question here is "per day per member", and
     * deriving it at query time means re-deciding what day it was for someone
     * in Los Angeles at 5pm — which is exactly the bug the habit engine had.
     */
    onDate: text("on_date"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_events_user_time").on(t.userId, t.createdAt),
    index("idx_events_name_time").on(t.name, t.createdAt),
    index("idx_events_subject").on(t.subjectId),
    index("idx_events_date").on(t.onDate),
  ]
);

export type Event = typeof events.$inferSelect;

/** What a client is allowed to send. The server sets user, date and time. */
export const trackSchema = z.object({
  name: eventNameEnum,
  surface: z.string().max(64).optional(),
  subjectId: z.string().max(128).optional(),
  props: z.record(z.unknown()).optional(),
});

export type TrackInput = z.infer<typeof trackSchema>;
