/**
 * The daily note, and the member's own intention.
 *
 *   daily_notes       — what the app says to this member about today
 *   daily_intentions  — what the member says to themselves about today
 *
 * Two different things that share a screen. The note is written for them; the
 * intention is written by them, and nothing generates it.
 *
 * A note is generated once per member per day and stored. Not regenerated on
 * refresh: the member should see the same thing at 9am and 9pm, it costs a
 * model call, and — most importantly — what a member was told has to exist as
 * a row someone can read afterwards.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── 1. DAILY NOTES ────────────────────────────────────────────────────────

export const dailyNotes = pgTable(
  "daily_notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    /** The member's own calendar date, not the server's. */
    onDate: date("on_date").notNull(),

    /** Two or three words. The thing they remember. */
    headline: text("headline").notNull(),
    /** A short paragraph. Never more than a few sentences. */
    body: text("body").notNull(),
    /** One concrete thing to actually do. Optional. */
    invitation: text("invitation"),

    /**
     * The almanac this was written from, stored verbatim. Without it you
     * cannot tell later whether a strange note was a bad generation or a bad
     * input, and that is the difference between a prompt fix and a maths fix.
     */
    inputs: jsonb("inputs"),

    /** 'model' | 'fallback' | 'authored' — where the words came from. */
    source: text("source").notNull().default("model"),
    model: text("model"),
    /** How many generations were rejected before this one passed. */
    attempts: integer("attempts").notNull().default(1),

    /** Set by an admin who has read it. Unreviewed is the default, honestly. */
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: varchar("reviewed_by"),
    /** An admin can flag a note as bad; flagged notes train the prompt. */
    flagged: boolean("flagged").notNull().default(false),
    flagNote: text("flag_note"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_daily_notes_user").on(t.userId),
    index("idx_daily_notes_date").on(t.onDate),
    index("idx_daily_notes_flagged").on(t.flagged),
    // One note per member per day. Generation is idempotent because of this.
    uniqueIndex("uq_daily_notes").on(t.userId, t.onDate),
  ]
);

export const dailyNoteSourceEnum = z.enum(["model", "fallback", "authored"]);
export type DailyNoteSource = z.infer<typeof dailyNoteSourceEnum>;

export type DailyNote = typeof dailyNotes.$inferSelect;
export const insertDailyNoteSchema = createInsertSchema(dailyNotes).omit({
  id: true,
  createdAt: true,
});
export type InsertDailyNote = z.infer<typeof insertDailyNoteSchema>;

// ─── 2. DAILY INTENTIONS ───────────────────────────────────────────────────

/**
 * The member's own line for the day. One per day, editable until the day ends
 * — an intention you can rewrite a week later isn't one.
 */
export const dailyIntentions = pgTable(
  "daily_intentions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    onDate: date("on_date").notNull(),
    intention: text("intention").notNull(),
    /** Set when they mark the day as met. Not a score — just a mark. */
    metAt: timestamp("met_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_daily_intentions_user").on(t.userId),
    uniqueIndex("uq_daily_intentions").on(t.userId, t.onDate),
  ]
);

export type DailyIntention = typeof dailyIntentions.$inferSelect;

export const setIntentionSchema = z.object({
  intention: z.string().min(1, "Say something").max(280),
});

// ─── 3. FREQUENCIES ────────────────────────────────────────────────────────

/**
 * Healing frequencies — audio a member can put on, tied to a moment rather
 * than filed in a media library. "Play this when you wake up" is the product;
 * a list of tracks is not.
 */
export const frequencies = pgTable(
  "frequencies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    /** 432, 528, 396 — null for anything not pitched to a single tone. */
    hz: integer("hz"),
    description: text("description"),
    audioUrl: text("audio_url").notNull(),
    durationSeconds: integer("duration_seconds"),

    /** When it's meant to be used: waking | practice | evening | anytime. */
    moment: text("moment").notNull().default("anytime"),
    /** The energy centre it pairs with, if any. */
    centreId: text("centre_id"),

    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_frequencies_moment").on(t.moment),
    index("idx_frequencies_active").on(t.isActive),
  ]
);

export const frequencyMomentEnum = z.enum(["waking", "practice", "evening", "anytime"]);
export type FrequencyMoment = z.infer<typeof frequencyMomentEnum>;

export type Frequency = typeof frequencies.$inferSelect;
export const insertFrequencySchema = createInsertSchema(frequencies, {
  moment: frequencyMomentEnum,
}).omit({ id: true, createdAt: true });
export type InsertFrequency = z.infer<typeof insertFrequencySchema>;
