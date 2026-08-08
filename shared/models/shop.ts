/**
 * The Apothecary — supply layer
 *
 * A protocol that tells a member to do a castor oil pack and then can't tell
 * them where to get castor oil is an unfinished protocol. This closes that.
 *
 * The shape:
 *   products            — what we stand behind, and why (curated, not a catalog)
 *   product_links       — where to actually buy it (many vendors per product)
 *   habit_products      — this habit needs these things
 *   routine_products    — this protocol needs these things, in this phase
 *   user_shop_checkoffs — "I already have this" — drives the sourcing list
 *
 * Deliberately *not* a store. We don't take payment or hold inventory; we
 * source. `product_links` is the whole commerce model.
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

// ─── Categories ────────────────────────────────────────────────────────────

export const PRODUCT_CATEGORIES = [
  "Herbs & Tinctures",
  "Minerals & Salts",
  "Oils & Packs",
  "Teas & Infusions",
  "Whole Foods",
  "Water & Filtration",
  "Tools & Instruments",
  "Movement & Recovery",
  "Sleep & Light",
  "Skin & Ritual",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export const productCategoryEnum = z.enum(PRODUCT_CATEGORIES);

// ─── 1. PRODUCTS ───────────────────────────────────────────────────────────

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    brand: text("brand"),
    category: text("category").notNull(),
    description: text("description"),

    // The two fields that make this ours rather than an affiliate page.
    // `whyThisOne` is the coach's argument; `sourcingNotes` is what to avoid.
    whyThisOne: text("why_this_one"),
    sourcingNotes: text("sourcing_notes"),

    imageUrl: text("image_url"),
    // Indicative price in cents — links carry the real vendor price.
    priceCents: integer("price_cents"),
    priceNote: text("price_note"), // "per 8oz", "monthly", "one-time"

    terrainTags: text("terrain_tags").array(),
    searchKeywords: text("search_keywords").array(),

    isFeatured: boolean("is_featured").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_products_category").on(t.category),
    index("idx_products_active").on(t.isActive),
  ]
);

export const insertProductSchema = createInsertSchema(products, {
  category: productCategoryEnum,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

// ─── 2. PRODUCT LINKS ──────────────────────────────────────────────────────

export const productLinks = pgTable(
  "product_links",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // "Amazon", "Direct from maker"
    url: text("url").notNull(),
    vendor: text("vendor"),
    priceCents: integer("price_cents"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_product_links_product").on(t.productId)]
);

export const insertProductLinkSchema = createInsertSchema(productLinks).omit({
  id: true,
  createdAt: true,
});

export type ProductLink = typeof productLinks.$inferSelect;
export type InsertProductLink = z.infer<typeof insertProductLinkSchema>;

// ─── 3. HABIT ↔ PRODUCT ────────────────────────────────────────────────────

export const habitProducts = pgTable(
  "habit_products",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    habitId: uuid("habit_id").notNull(), // FK → routine_habits.id
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    note: text("note"), // "2 tbsp, warmed"
    isEssential: boolean("is_essential").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_habit_products_habit").on(t.habitId),
    index("idx_habit_products_product").on(t.productId),
    uniqueIndex("uq_habit_products").on(t.habitId, t.productId),
  ]
);

export type HabitProduct = typeof habitProducts.$inferSelect;
export const insertHabitProductSchema = createInsertSchema(habitProducts).omit({
  id: true,
  createdAt: true,
});
export type InsertHabitProduct = z.infer<typeof insertHabitProductSchema>;

// ─── 4. ROUTINE ↔ PRODUCT ──────────────────────────────────────────────────

/**
 * `phase` lets a 28-day protocol stage its supply list — you don't need the
 * rebuild-phase minerals in week one, and telling someone to buy everything on
 * day one is how a protocol starts feeling like a shopping trip.
 */
export const routineProducts = pgTable(
  "routine_products",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    routineId: text("routine_id").notNull(), // FK → wellness_routines.id
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    phase: text("phase").notNull().default("prepare"), // prepare | clear | rebuild
    note: text("note"),
    isEssential: boolean("is_essential").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_routine_products_routine").on(t.routineId),
    index("idx_routine_products_product").on(t.productId),
    uniqueIndex("uq_routine_products").on(t.routineId, t.productId),
  ]
);

export const routinePhaseEnum = z.enum(["prepare", "clear", "rebuild"]);
export type RoutinePhase = z.infer<typeof routinePhaseEnum>;

export type RoutineProduct = typeof routineProducts.$inferSelect;
export const insertRoutineProductSchema = createInsertSchema(routineProducts, {
  phase: routinePhaseEnum,
}).omit({ id: true, createdAt: true });
export type InsertRoutineProduct = z.infer<typeof insertRoutineProductSchema>;

// ─── 5. USER CHECK-OFFS ────────────────────────────────────────────────────

/**
 * "I already have this." One row per (user, product) — the presence of the row
 * is the state, so toggling off is a delete. No boolean to drift.
 */
export const userShopCheckoffs = pgTable(
  "user_shop_checkoffs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at").defaultNow(),
  },
  (t) => [
    index("idx_shop_checkoffs_user").on(t.userId),
    uniqueIndex("uq_shop_checkoffs").on(t.userId, t.productId),
  ]
);

export type UserShopCheckoff = typeof userShopCheckoffs.$inferSelect;
