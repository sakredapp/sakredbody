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
  jsonb,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

import { setVolumeKg } from "./training.js";

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
 * What a member published to the Room about a workout.
 *
 * ── Why this is a copy and not a reference ────────────────────────────────
 *
 * It used to be a reference. The message carried the session id and the card
 * was rendered from `workout_sets` on every read, on the reasoning that a
 * corrected set should correct the post rather than leave the Room insisting
 * on a typo.
 *
 * That reasoning is wrong about whose record each of the two is. The session
 * is the member's private training log and they may correct it for years. The
 * post is a sentence they said out loud, once, to other people — and other
 * people replied to it. Re-deriving the card from live rows means editing a
 * private note silently rewrites a public conversation: eight replies
 * congratulating a lift that, by the time anybody scrolls back, the post no
 * longer claims. Nobody edited the post. Nobody was told it changed.
 *
 * So publishing takes a copy. `sharedSessionId` stays as provenance — it is
 * how the card links back to the real training and how "is this mine" is
 * answered — and this is what was actually said.
 *
 * ── What a copy is allowed to contain ─────────────────────────────────────
 *
 * Only what a member chose to make public: which movements, how many working
 * sets, the top weight, the shape of the session. Never the session note,
 * per-set notes, RPE, or whether they went to failure — see
 * `server/community/sharedWorkout.ts`, which is the only thing that builds
 * one. Health measurements, Terrain reasons and Training Memory are not
 * reachable from there at all, which is the strongest form of the same rule.
 *
 * ── Validated on the way out, not trusted ─────────────────────────────────
 *
 * A jsonb column has no shape at rest. Anything that reads a snapshot parses
 * it through this schema first, so a row hand-edited in a console, or written
 * by a version of this code that no longer exists, degrades to no card rather
 * than to a client rendering `undefined`.
 */
export const sharedMovementSchema = z.object({
  exerciseId: z.string(),
  name: z.string(),
  /** Working sets only — a warm-up ramp is not what somebody is sharing. */
  sets: z.number().int().min(0),
  reps: z.number().int().nullable(),
  /** The heaviest working set, in kilograms. Null for unweighted work. */
  topWeightKg: z.number().nullable(),
  /** Movements performed together carry the same key. */
  supersetGroup: z.string().nullable(),
});

export const sharedWorkoutSchema = z.object({
  sessionId: z.string(),
  title: z.string().nullable(),
  onDate: z.string(),
  durationMinutes: z.number().int().nullable(),
  movements: z.array(sharedMovementSchema),
  /** Total working-set volume, kilograms. Null when nothing was weighted. */
  volumeKg: z.number().nullable(),
  /**
   * When the copy was taken. The card is as of this moment and no other —
   * which is the whole point, and worth being able to say out loud rather
   * than inferring from the message's own timestamp.
   */
  publishedAt: z.string(),
});

export type SharedMovement = z.infer<typeof sharedMovementSchema>;
export type SharedWorkout = z.infer<typeof sharedWorkoutSchema>;

/**
 * Read a stored snapshot, or nothing.
 *
 * Never throws. A message whose snapshot cannot be parsed is still a message,
 * and the words the member wrote alongside it are still worth showing.
 */
export function readSharedWorkout(value: unknown): SharedWorkout | null {
  if (!value) return null;
  const parsed = sharedWorkoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The session facts a card may show. Deliberately four columns. */
export type SessionRow = {
  id: string;
  title: string | null;
  onDate: string;
  durationMinutes: number | null;
};

/** One movement's place in the session. No notes, no prescription. */
export type CompositionRow = {
  exerciseId: string;
  supersetGroup: string | null;
  name: string | null;
  /**
   * What the weight box meant, and whether the set was done a side at a time.
   *
   * Here because the volume on the card cannot be computed without them. It
   * was `weightKg × reps`, which counts a dumbbell set entered per hand at
   * half of what happened and a one-sided set at half of its two sides — so
   * "5,361 kg moved" was published as a fact and was neither.
   */
  loadEntry: string;
  unilateral: boolean;
};

/** One working set. Weight and reps only — not RPE, failure, or its note. */
export type SetRow = {
  exerciseId: string;
  reps: number | null;
  /** As the member entered it. See `loadEntry` on the movement. */
  weightKg: number;
};

/**
 * The presentation, from rows that have already been narrowed.
 *
 * Here rather than beside the queries so the arithmetic can be tested with no
 * database at all — importing the server module pulls in a connection, and a
 * rule this load-bearing should not be untestable for that reason.
 *
 * The narrowing lives in the three row types above and in the `select` calls
 * in server/community/sharedWorkout.ts: nothing private can reach this
 * function to be leaked by it.
 */
export function summarise(
  session: SessionRow,
  composition: readonly CompositionRow[],
  sets: readonly SetRow[],
  publishedAt: string,
): SharedWorkout {
  /* How each movement's number is to be read. See CompositionRow. */
  const shapeOf = new Map(composition.map((c) => [c.exerciseId, c]));

  const byMovement = new Map<string, { sets: number; reps: number | null; top: number | null; volume: number }>();
  for (const s of sets) {
    const acc = byMovement.get(s.exerciseId) ?? { sets: 0, reps: null, top: null, volume: 0 };
    acc.sets += 1;
    // The rep count shown is the one performed most recently that had any —
    // a single number on a card, not a claim about every set.
    if (s.reps != null) acc.reps = s.reps;
    const shape = shapeOf.get(s.exerciseId);
    if (s.weightKg > 0) {
      /* The top set is what they entered, not the normalised figure — "70"
         is the number they put on the bar, and rewriting it to 140 on their
         own card would be the app disagreeing with their memory. */
      acc.top = Math.max(acc.top ?? 0, s.weightKg);
    }
    acc.volume += setVolumeKg({
      reps: s.reps,
      enteredKg: s.weightKg,
      loadEntry: shape?.loadEntry ?? "total",
      unilateral: shape?.unilateral ?? false,
      /*
        Bodyweight is deliberately not in the card's number, and was not
        before this change either. `workout_sets` does not carry what the
        member weighed — it is looked up by date where it is needed — and
        adding a second correction while fixing the per-limb one would make
        every published total move for two reasons at once.

        So this fixes what was wrong: a dumbbell set entered per hand counted
        once, and a one-sided set counted one of its two sides.
      */
      bodyweightFactor: 0,
      bodyweightKg: null,
    });
    byMovement.set(s.exerciseId, acc);
  }

  const movements: SharedMovement[] = composition.map((c) => {
    const acc = byMovement.get(c.exerciseId);
    return {
      exerciseId: c.exerciseId,
      // The slug is a readable last resort — a card that says nothing at all
      // is worse than one that says "incline-chest-press".
      name: c.name ?? c.exerciseId,
      sets: acc?.sets ?? 0,
      reps: acc?.reps ?? null,
      topWeightKg: acc?.top ?? null,
      supersetGroup: c.supersetGroup,
    };
  });

  const volume = movements.reduce(
    (total, m) => total + (byMovement.get(m.exerciseId)?.volume ?? 0),
    0,
  );

  return {
    sessionId: session.id,
    title: session.title,
    onDate: session.onDate,
    durationMinutes: session.durationMinutes,
    movements,
    volumeKg: volume > 0 ? Math.round(volume) : null,
    publishedAt,
  };
}

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
     * A photograph, when there is one.
     *
     * A reference into `media_assets` rather than a URL column, because the
     * question "who may see this" is answered by the asset's purpose and not
     * by whoever happens to be rendering the message. See
     * `shared/models/media.ts`.
     */
    imageAssetId: uuid("image_asset_id"),

    /**
     * Which training this post came from. Provenance, not content.
     *
     * `ON DELETE SET NULL` in the migration: deleting a workout must not
     * delete the conversation about it. What the member published survives in
     * `sharedWorkout` — the Room is edited from the Room, and a private
     * deletion is not a public retraction. Removing the post removes the card.
     */
    sharedSessionId: uuid("shared_session_id"),

    /**
     * What was actually published. Written once, at publish time, and never
     * again — see `sharedWorkoutSchema` above for why it is a copy.
     */
    sharedWorkout: jsonb("shared_workout").$type<SharedWorkout>(),

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
    imageAssetId: z.string().uuid().nullable().optional(),
    sharedSessionId: z.string().uuid().nullable().optional(),
  })
  /*
    A message has to be *something*. Words, a recording, a photograph, or a
    workout — four ways to say something and one rule, rather than a refinement
    that quietly stopped being true when photos arrived.
  */
  .refine(
    (v) => v.body.trim().length > 0 || !!v.audioUrl || !!v.imageAssetId || !!v.sharedSessionId,
    { message: "Say something, or show something." },
  );

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
