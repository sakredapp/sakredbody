/**
 * Moderation — reporting and blocking.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Not a nice-to-have. Google Play's user-generated content policy and Apple's
 * guideline 1.2 both require an app with member-to-member content to provide a
 * way to *report* content and a way to *block* a person, and both reject
 * listings that don't. The community shipped with neither: an admin could
 * delete a message, which is moderation from above, and a member had no
 * recourse at all.
 *
 * ── Blocking hides, it does not sever ─────────────────────────────────────
 *
 * A block is one-directional and means "I don't want to see this person".
 * Their posts and replies disappear from every room, thread and search result
 * for the blocker, and nothing at all happens on the other side — no notice,
 * no visible change.
 *
 * That asymmetry is deliberate. Telling somebody they have been blocked is how
 * a quiet exit becomes a confrontation, and in a paid community of a few dozen
 * people who will meet on a retreat, that matters more than it would on a
 * public network.
 *
 * What it explicitly does *not* do is hide the blocker from the blocked
 * person. Mutual invisibility sounds fairer and behaves worse here: threads
 * would develop holes only one party could see, and two people would answer
 * questions the other could not read.
 *
 * ── A report is a fact, not a verdict ─────────────────────────────────────
 *
 * Reporting records that somebody objected. It does not hide anything, and it
 * deliberately does not auto-remove on a threshold: in a community this size,
 * a handful of coordinated reports could silence anyone, and the moderator is
 * one person who can read the thing in minutes.
 *
 * Reports survive the deletion of what they point at. `messageId` has no
 * foreign key for exactly that reason — if the fastest resolution is deleting
 * the message, the record of why must not vanish with it.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  timestamp,
  index,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── Reports ───────────────────────────────────────────────────────────────

/**
 * The reasons a member can pick.
 *
 * Short and concrete. A long list makes people choose "other", and "other"
 * tells a moderator nothing they couldn't have guessed.
 */
export const REPORT_REASONS = [
  "harassment",
  "spam",
  "hate",
  "sexual",
  "violence",
  "self_harm",
  "misinformation",
  "other",
] as const;

export const reportReasonEnum = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonEnum>;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Harassment or bullying",
  spam: "Spam or advertising",
  hate: "Hate speech",
  sexual: "Sexual content",
  violence: "Violence or threats",
  self_harm: "Self-harm",
  misinformation: "Harmful misinformation",
  other: "Something else",
};

export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export const reportStatusEnum = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof reportStatusEnum>;

export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    /** Who objected. */
    reporterId: varchar("reporter_id").notNull(),

    /**
     * The message complained about.
     *
     * No foreign key, on purpose. Deleting the message is often the *fix*, and
     * a cascade would erase the record of why it was deleted along with it.
     */
    messageId: uuid("message_id").notNull(),

    /** Denormalised so the queue can show who wrote it after it's gone. */
    authorId: varchar("author_id"),
    /** A copy of the text as reported, so the queue shows what was seen. */
    excerpt: text("excerpt"),

    reason: text("reason").notNull(),
    detail: text("detail"),

    status: text("status").notNull().default("open"),
    reviewedBy: varchar("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_content_reports_status").on(t.status, t.createdAt),
    index("idx_content_reports_message").on(t.messageId),
    // One report per person per message. A second is the same complaint, and
    // counting it twice would make one upset member look like a crowd.
    uniqueIndex("uq_content_reports_reporter_message").on(t.reporterId, t.messageId),
  ],
);

// ─── Blocks ────────────────────────────────────────────────────────────────

export const userBlocks = pgTable(
  "user_blocks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** The person who no longer wants to see the other. */
    blockerId: varchar("blocker_id").notNull(),
    blockedId: varchar("blocked_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_user_blocks_blocker").on(t.blockerId),
    uniqueIndex("uq_user_blocks_pair").on(t.blockerId, t.blockedId),
  ],
);

// ─── Input ─────────────────────────────────────────────────────────────────

export const reportSchema = z.object({
  reason: reportReasonEnum,
  detail: z.string().max(1000).nullable().optional(),
});

export const reviewReportSchema = z.object({
  status: z.enum(["actioned", "dismissed"]),
  reviewNote: z.string().max(1000).nullable().optional(),
  /** Delete the message as part of actioning it. */
  deleteMessage: z.boolean().default(false),
});

export type ContentReport = typeof contentReports.$inferSelect;
export type UserBlock = typeof userBlocks.$inferSelect;
