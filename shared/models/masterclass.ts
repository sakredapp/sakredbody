/**
 * Masterclass — Video library with categories & user subscriptions
 *
 * Tables:
 *   1. masterclass_categories — Topics like "Building Muscle", "Meditation", "Nutrition"
 *   2. masterclass_videos     — Individual video entries with metadata
 *   3. user_category_subs     — Which categories a user follows
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  serial,
  integer,
  boolean,
  timestamp,
  index,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth.js";

// ─── 1. CATEGORIES (Admin-managed topic folders) ───────────────────────────

export const masterclassCategories = pgTable("masterclass_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),               // "Building Muscle"
  slug: text("slug").notNull().unique(),       // "building-muscle"
  description: text("description"),
  coverImageUrl: text("cover_image_url"),      // Pinterest-style board cover
  icon: text("icon"),                          // emoji
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMasterclassCategorySchema = createInsertSchema(masterclassCategories).omit({
  id: true,
  createdAt: true,
});

export type MasterclassCategory = typeof masterclassCategories.$inferSelect;
export type InsertMasterclassCategory = z.infer<typeof insertMasterclassCategorySchema>;

// ─── 2. VIDEOS (Admin-managed content) ─────────────────────────────────────

export const masterclassVideos = pgTable(
  "masterclass_videos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    categoryId: uuid("category_id").notNull(),  // FK to masterclass_categories
    title: text("title").notNull(),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),         // poster/cover image
    videoUrl: text("video_url").notNull(),       // actual video embed/URL
    duration: text("duration"),                  // "12:34"
    instructor: text("instructor"),              // who presents
    tags: text("tags").array(),                  // searchable tags
    searchKeywords: text("search_keywords").array(),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_mc_videos_category").on(t.categoryId),
    index("idx_mc_videos_featured").on(t.isFeatured),
  ]
);

export const insertMasterclassVideoSchema = createInsertSchema(masterclassVideos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MasterclassVideo = typeof masterclassVideos.$inferSelect;
export type InsertMasterclassVideo = z.infer<typeof insertMasterclassVideoSchema>;

// ─── 3. USER CATEGORY SUBSCRIPTIONS ───────────────────────────────────────

export const userCategorySubs = pgTable(
  "user_category_subs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_ucs_user").on(t.userId),
    index("idx_ucs_category").on(t.categoryId),
    index("idx_ucs_user_category").on(t.userId, t.categoryId),
  ]
);

export const insertUserCategorySubSchema = createInsertSchema(userCategorySubs).omit({
  id: true,
  createdAt: true,
});

export type UserCategorySub = typeof userCategorySubs.$inferSelect;
export type InsertUserCategorySub = z.infer<typeof insertUserCategorySubSchema>;
