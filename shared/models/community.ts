/**
 * Membership tiers and community.
 *
 * ── Tiers ─────────────────────────────────────────────────────────────────
 *
 * A tier is a rank, not a set of flags. Access is always "rank >= N", which
 * means adding a tier between two existing ones is a row, not a migration
 * across every gate in the codebase.
 *
 * ── Community ─────────────────────────────────────────────────────────────
 *
 * One general room, and threads that hang off any message — Reddit's shape,
 * not Slack's. A thread is just a message with a parent, so it nests as far as
 * a conversation actually goes rather than being capped at one level.
 *
 * Channels are gated by tier rank. Someone in a $10k engagement and someone on
 * the entry tier should not be in the same room by default, and the gate has
 * to be enforceable in one place rather than remembered at every call site.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── 1. TIERS ──────────────────────────────────────────────────────────────

export const membershipTiers = pgTable(
  "membership_tiers",
  {
    /** Readable slug — 'free', 'member', 'inner', 'executive'. */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /**
     * The whole access model. Higher includes everything lower. Spaced by 10
     * on purpose, so a new tier can be slotted between two without renumbering.
     */
    rank: integer("rank").notNull().default(0),
    description: text("description"),
    priceCents: integer("price_cents"),
    priceNote: text("price_note"), // "per month", "per year"
    /** Shown on the tier card. Plain lines, not marketing. */
    includes: text("includes").array(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_membership_tiers_rank").on(t.rank)]
);

export type MembershipTier = typeof membershipTiers.$inferSelect;
export const insertMembershipTierSchema = createInsertSchema(membershipTiers).omit({
  createdAt: true,
});
export type InsertMembershipTier = z.infer<typeof insertMembershipTierSchema>;

/**
 * The tiers the app ships with. Seeded, then editable — the ranks are what
 * code depends on, so they're named here rather than looked up by string.
 */
export const TIER_RANKS = {
  free: 0,
  member: 10,
  inner: 20,
  executive: 30,
} as const;

export type TierKey = keyof typeof TIER_RANKS;

// ─── 2. CHANNELS ───────────────────────────────────────────────────────────

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    /** Minimum tier rank to see this room at all. 0 = everyone. */
    minTierRank: integer("min_tier_rank").notNull().default(0),
    /**
     * An offering-bound room: only confirmed registrants of that offering get
     * in, regardless of tier. This is how a mastermind, a retreat or a
     * recurring webinar gets its own space.
     */
    offeringId: uuid("offering_id"),
    /**
     * Invite-only. The explicit member list in `channelMembers` becomes the
     * only way in — tier rank is ignored entirely, so a private room stays
     * private however senior somebody is. Admins still see everything.
     */
    isPrivate: boolean("is_private").notNull().default(false),
    /** Read-only for members — announcements. */
    isReadOnly: boolean("is_read_only").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_channels_tier").on(t.minTierRank),
    index("idx_channels_offering").on(t.offeringId),
  ]
);

/**
 * Who is explicitly invited to a room.
 *
 * The third way into a channel, alongside tier rank and offering registration.
 * `channels.isPrivate` makes this list the only way in.
 */
export const channelMembers = pgTable(
  "channel_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    channelId: uuid("channel_id").notNull(),
    userId: varchar("user_id").notNull(),
    /** Useful a year later when nobody remembers why this person is here. */
    addedBy: varchar("added_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_channel_members").on(t.channelId, t.userId),
    index("idx_channel_members_user").on(t.userId),
  ],
);

export type ChannelMember = typeof channelMembers.$inferSelect;

export type Channel = typeof channels.$inferSelect;
export const insertChannelSchema = createInsertSchema(channels).omit({
  id: true,
  createdAt: true,
});
export type InsertChannel = z.infer<typeof insertChannelSchema>;

// ─── 3. MESSAGES ───────────────────────────────────────────────────────────

/**
 * One table for both messages and threads.
 *
 * `parentId` null means it's top-level in the channel; set means it's a reply,
 * and a reply can itself have replies. `rootId` is denormalised to the
 * top-level ancestor so a whole thread is one indexed query rather than a
 * recursive walk — the read pattern is "give me this thread", always.
 *
 * `path` keeps sibling order stable inside a thread without sorting the whole
 * tree in application code.
 */
export const communityMessages = pgTable(
  "community_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),

    /** Null for a top-level message. */
    parentId: uuid("parent_id"),
    /** The top-level ancestor. Equals `id` for a top-level message. */
    rootId: uuid("root_id"),
    /** How deep. 0 = top level. Capped in the handler, not here. */
    depth: integer("depth").notNull().default(0),

    /**
     * The words. Empty string for a voice-only message — the column stays NOT
     * NULL and a database CHECK requires either text or a recording, so a
     * message that says nothing at all is still impossible.
     */
    body: text("body").notNull(),

    /**
     * A voice memo, when there is one.
     *
     * `audioMime` is the real recorded type, stored rather than guessed from
     * the URL. Browsers disagree about what they record — iOS Safari produces
     * mp4, Android Chrome produces webm — and iOS cannot play webm at all, so
     * the player needs to know which it has in order to say so honestly
     * instead of rendering a control that produces silence.
     */
    audioUrl: text("audio_url"),
    audioMime: text("audio_mime"),
    audioDurationSeconds: integer("audio_duration_seconds"),

    /**
     * Deleting a message with replies would orphan the conversation, so a
     * delete is a tombstone: the row stays, the body is replaced, and the
     * thread keeps its shape.
     */
    deletedAt: timestamp("deleted_at"),
    editedAt: timestamp("edited_at"),

    /** Denormalised so a thread list doesn't need a count per row. */
    replyCount: integer("reply_count").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_community_channel").on(t.channelId, t.createdAt),
    index("idx_community_root").on(t.rootId, t.createdAt),
    index("idx_community_parent").on(t.parentId),
    index("idx_community_user").on(t.userId),
  ]
);

export type CommunityMessage = typeof communityMessages.$inferSelect;

/**
 * A message needs words or a recording — the refinement mirrors the database
 * CHECK exactly, so an empty message is refused with a sentence here rather
 * than a constraint violation from Postgres.
 */
export const postMessageSchema = z
  .object({
    channelId: z.string().uuid(),
    parentId: z.string().uuid().nullable().optional(),
    body: z.string().max(8000).default(""),
    audioUrl: z.string().url().nullable().optional(),
    audioMime: z.string().max(80).nullable().optional(),
    audioDurationSeconds: z.number().int().min(1).max(600).nullable().optional(),
  })
  .refine((v) => v.body.trim().length > 0 || !!v.audioUrl, {
    message: "Say something, or record it.",
  });

export const editMessageSchema = z.object({
  body: z.string().min(1).max(8000),
});

/** How deep a thread may go before replies attach to the parent instead. */
export const MAX_THREAD_DEPTH = 8;

// ─── 4. REACTIONS ──────────────────────────────────────────────────────────

/**
 * Presence is the state — un-reacting is a delete, so there's no boolean to
 * drift. Same shape as the Apothecary's check-offs.
 */
export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    messageId: uuid("message_id")
      .notNull()
      .references(() => communityMessages.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_reactions_message").on(t.messageId),
    uniqueIndex("uq_reactions").on(t.messageId, t.userId, t.emoji),
  ]
);

export type MessageReaction = typeof messageReactions.$inferSelect;
