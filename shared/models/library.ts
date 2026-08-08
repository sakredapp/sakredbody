/**
 * The Library — written guides, paired to protocols
 *
 * The mechanic that matters is the handoff: a guide explains the reasoning, and
 * the protocol it is paired with is one tap from the last section. Reading and
 * doing are the same loop, not two features.
 *
 *   ebooks              — the guide
 *   ebook_sections      — chapters, ordered; each may carry audio
 *   ebook_entitlements  — who may open it, and on what grounds
 *   ebook_progress      — where they stopped
 *
 * Access is an entitlement row, never a tier comparison at read time. A tier
 * check scattered across handlers drifts; a row is checkable in one place and
 * survives a member changing plan.
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

// ─── 1. EBOOKS ─────────────────────────────────────────────────────────────

export const ebooks = pgTable(
  "ebooks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    author: text("author"),
    description: text("description"),
    coverUrl: text("cover_url"),

    // The protocol this guide is the reasoning for. Nullable — some guides are
    // standalone. When set, the reader offers it at the end.
    routineId: text("routine_id"), // FK → wellness_routines.id

    priceCents: integer("price_cents"),
    // 'membership' — included; 'purchase' — bought separately;
    // 'coaching'   — granted by a coach, never bought.
    accessMode: text("access_mode").notNull().default("membership"),

    readingMinutes: integer("reading_minutes"),
    audioUrl: text("audio_url"), // whole-book audio, when sections have none

    searchKeywords: text("search_keywords").array(),
    isFeatured: boolean("is_featured").notNull().default(false),
    isPublished: boolean("is_published").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_ebooks_published").on(t.isPublished),
    index("idx_ebooks_routine").on(t.routineId),
  ]
);

export const ebookAccessModeEnum = z.enum(["membership", "purchase", "coaching"]);
export type EbookAccessMode = z.infer<typeof ebookAccessModeEnum>;

export const insertEbookSchema = createInsertSchema(ebooks, {
  accessMode: ebookAccessModeEnum,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type Ebook = typeof ebooks.$inferSelect;
export type InsertEbook = z.infer<typeof insertEbookSchema>;

// ─── 2. SECTIONS ───────────────────────────────────────────────────────────

export const ebookSections = pgTable(
  "ebook_sections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ebookId: uuid("ebook_id")
      .notNull()
      .references(() => ebooks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Stored as HTML. The reader renders it directly, so anything written here
    // is trusted admin content — never member input.
    content: text("content"),
    audioUrl: text("audio_url"),
    orderIndex: integer("order_index").notNull().default(0),
    // A free section is readable without an entitlement — the sample chapter.
    isFree: boolean("is_free").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_ebook_sections_book").on(t.ebookId),
    uniqueIndex("uq_ebook_sections_order").on(t.ebookId, t.orderIndex),
  ]
);

export const insertEbookSectionSchema = createInsertSchema(ebookSections).omit({
  id: true,
  createdAt: true,
});

export type EbookSection = typeof ebookSections.$inferSelect;
export type InsertEbookSection = z.infer<typeof insertEbookSectionSchema>;

// ─── 3. ENTITLEMENTS ───────────────────────────────────────────────────────

export const ebookEntitlements = pgTable(
  "ebook_entitlements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    ebookId: uuid("ebook_id")
      .notNull()
      .references(() => ebooks.id, { onDelete: "cascade" }),
    // Why they have it. Kept for the same reason a ledger keeps a reason:
    // revoking a membership shouldn't take back a coach's gift.
    source: text("source").notNull().default("membership"),
    grantedBy: varchar("granted_by"), // admin/coach user id, when granted by hand
    grantedAt: timestamp("granted_at").defaultNow(),
  },
  (t) => [
    index("idx_ebook_entitlements_user").on(t.userId),
    uniqueIndex("uq_ebook_entitlements").on(t.userId, t.ebookId),
  ]
);

export const entitlementSourceEnum = z.enum(["membership", "purchase", "coaching", "gift"]);
export type EntitlementSource = z.infer<typeof entitlementSourceEnum>;

export type EbookEntitlement = typeof ebookEntitlements.$inferSelect;

// ─── 4. PROGRESS ───────────────────────────────────────────────────────────

export const ebookProgress = pgTable(
  "ebook_progress",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    ebookId: uuid("ebook_id")
      .notNull()
      .references(() => ebooks.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => ebookSections.id, { onDelete: "set null" }),
    // 0–1 through the current section, so resuming lands mid-chapter.
    scrollFraction: integer("scroll_fraction").notNull().default(0), // stored ×1000
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_ebook_progress_user").on(t.userId),
    uniqueIndex("uq_ebook_progress").on(t.userId, t.ebookId),
  ]
);

export type EbookProgress = typeof ebookProgress.$inferSelect;
