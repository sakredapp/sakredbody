/**
 * Coaching Engine — Habits, Routines, Rewards
 *
 * Architecture layers:
 *   1. Admin CRUD      → wellness_routines, routine_habits, habit_routine_assignments
 *   2. Enrollment      → user_routines (+ bulk-insert into habits)
 *   3. Daily Execution → habits (pre-scheduled rows, toggle completed)
 *   4. Analytics        → computed from habits + rewards
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth.js";

// ─── 1. WELLNESS ROUTINES (Admin-managed program templates) ────────────────

export const wellnessRoutines = pgTable("wellness_routines", {
  id: text("id").primaryKey(), // human-readable slug e.g. "sleep_mastery_lite"
  name: text("name").notNull(),
  description: text("description").notNull(),
  goal: text("goal"),
  goalDescription: text("goal_description"),
  durationDays: integer("duration_days").notNull().default(14),
  icon: text("icon"), // emoji or icon name
  color: text("color"), // hex color for theming
  tier: text("tier").notNull().default("free"), // 'free' | 'premium'
  category: text("category").notNull(), // "Sleep", "Gut Health", "Detox", etc.
  terrainTags: text("terrain_tags").array(),
  searchKeywords: text("search_keywords").array(),
  whoIsThisFor: text("who_is_this_for"),
  whatToExpect: text("what_to_expect"),
  expectedResults: text("expected_results"),
  isFeatured: boolean("is_featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  routineType: text("routine_type"), // optional sub-categorization
  copyBlockId: text("copy_block_id"), // optional CMS reference
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWellnessRoutineSchema = createInsertSchema(wellnessRoutines).omit({
  createdAt: true,
  updatedAt: true,
});

export type WellnessRoutine = typeof wellnessRoutines.$inferSelect;
export type InsertWellnessRoutine = z.infer<typeof insertWellnessRoutineSchema>;

// ─── 2. ROUTINE HABITS (Admin-managed habit templates) ─────────────────────

export const routineHabits = pgTable(
  "routine_habits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    routineId: text("routine_id"), // legacy direct FK (superseded by junction)
    title: text("title").notNull(),
    shortDescription: text("short_description"),
    detailedDescription: text("detailed_description"),
    description: text("description"), // alternative description field
    instructions: text("instructions"),
    scienceExplanation: text("science_explanation"),
    tips: text("tips"),
    expectToNotice: text("expect_to_notice"),
    cadence: text("cadence").notNull().default("daily"), // 'daily' | 'weekly' | 'as-needed'
    recommendedTime: text("recommended_time"), // "Morning", "Evening", "Anytime"
    durationMinutes: integer("duration_minutes"),
    dayStart: integer("day_start").default(1), // first day this habit appears (1-based)
    dayEnd: integer("day_end"), // last day this habit appears
    orderIndex: integer("order_index").notNull().default(0),
    intensity: text("intensity").notNull().default("lite"), // 'lite' | 'intense'
    icon: text("icon"),
    terrainTags: text("terrain_tags").array(),
    searchKeywords: text("search_keywords").array(),
    isFree: boolean("is_free").notNull().default(true),
    copyBlockId: text("copy_block_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_routine_habits_routine").on(table.routineId),
    index("idx_routine_habits_intensity").on(table.intensity),
  ]
);

export const insertRoutineHabitSchema = createInsertSchema(routineHabits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type RoutineHabit = typeof routineHabits.$inferSelect;
export type InsertRoutineHabit = z.infer<typeof insertRoutineHabitSchema>;

// ─── 3. HABIT ↔ ROUTINE ASSIGNMENTS (Many-to-many junction) ───────────────

export const habitRoutineAssignments = pgTable(
  "habit_routine_assignments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    habitId: uuid("habit_id").notNull(), // FK → routine_habits.id
    routineId: text("routine_id").notNull(), // FK → wellness_routines.id
  },
  (table) => [
    index("idx_hra_habit").on(table.habitId),
    index("idx_hra_routine").on(table.routineId),
  ]
);

export type HabitRoutineAssignment = typeof habitRoutineAssignments.$inferSelect;

// ─── 4. USER ROUTINES (Enrollment tracking) ───────────────────────────────

export const userRoutines = pgTable(
  "user_routines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(), // FK → users.id
    routineId: text("routine_id").notNull(), // FK → wellness_routines.id
    startDate: date("start_date").notNull(),
    // The last day habits are scheduled — start_date + duration_days - 1, so
    // a 21-day routine starting the 1st ends on the 21st, not the 22nd.
    endDate: date("end_date").notNull(),
    // scheduled — enrolled with a future start; nothing materialised yet
    // active    — running
    // paused    — stopped by the member; future rows cleared, resumable
    // completed — ran to end_date
    // abandoned — ended early by the member
    status: text("status").notNull().default("active"),
    intensity: text("intensity").notNull().default("lite"), // 'lite' | 'intense'
    // Set when paused. Resuming shifts end_date by the days spent paused, so a
    // 21-day routine still delivers 21 days of habits.
    pausedAt: date("paused_at"),
    clientRequestId: text("client_request_id"), // SHA-256 idempotency key
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_user_routines_user").on(table.userId),
    index("idx_user_routines_status").on(table.status),
    index("idx_user_routines_idempotency").on(table.clientRequestId),
  ]
);

export const insertUserRoutineSchema = createInsertSchema(userRoutines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const userRoutineStatusEnum = z.enum([
  "scheduled",
  "active",
  "paused",
  "completed",
  "abandoned",
]);
export type UserRoutineStatus = z.infer<typeof userRoutineStatusEnum>;

/** Statuses that should still be serving habits. */
export const LIVE_ROUTINE_STATUSES = ["active"] as const;
/** Statuses a member can resume from. */
export const RESUMABLE_ROUTINE_STATUSES = ["paused"] as const;

export type UserRoutine = typeof userRoutines.$inferSelect;
export type InsertUserRoutine = z.infer<typeof insertUserRoutineSchema>;

// ─── 5. HABITS (Pre-scheduled daily execution rows) ───────────────────────

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(), // FK → users.id
    userRoutineId: uuid("user_routine_id"), // FK → user_routines.id (NULL for standalone)
    routineHabitId: uuid("routine_habit_id"), // FK → routine_habits.id (NULL for custom)
    title: text("title").notNull(),
    description: text("description"),
    cadence: text("cadence").notNull().default("daily"),
    completed: boolean("completed").notNull().default(false),
    scheduledDate: date("scheduled_date").notNull(),
    dayNumber: integer("day_number"), // which day of the routine (1-based)
    isFromRoutine: boolean("is_from_routine").notNull().default(true),
    completedAt: timestamp("completed_at"), // when the user toggled it complete
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    // THE critical index: powers the daily "what do I do today?" query
    index("idx_habits_user_date").on(table.userId, table.scheduledDate),
    index("idx_habits_user_routine").on(table.userRoutineId),
    index("idx_habits_completed").on(table.userId, table.completed),
  ]
);

export const insertHabitSchema = createInsertSchema(habits).omit({
  id: true,
  completed: true,
  completedAt: true,
  createdAt: true,
});

export type Habit = typeof habits.$inferSelect;
export type InsertHabit = z.infer<typeof insertHabitSchema>;

// ─── 6. REWARDS (Coin economy transaction log) ────────────────────────────

export const rewards = pgTable(
  "rewards",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(), // FK → users.id
    // The habit that earned it. A partial unique index on (user_id, habit_id)
    // where type = 'earn' is what makes a habit payable exactly once — the macro
    // app guarded this in client memory, so an app restart re-paid every toggle.
    habitId: uuid("habit_id"), // FK → habits.id, NULL for non-habit rewards
    amount: integer("amount").notNull(), // positive = earn, negative = spend
    reason: text("reason").notNull(), // e.g. "Completed habit: Morning Meditation"
    type: text("type").notNull(), // 'earn' | 'spend'
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_rewards_user").on(table.userId),
    index("idx_rewards_user_date").on(table.userId, table.createdAt),
    index("idx_rewards_habit").on(table.habitId),
  ]
);

export const rewardTypeEnum = z.enum(["earn", "spend"]);

export type Reward = typeof rewards.$inferSelect;

// ─── 7. USER ASSIGNED HABITS (Standalone / catalog picks) ─────────────────

export const userAssignedHabits = pgTable(
  "user_assigned_habits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(), // FK → users.id
    routineHabitId: uuid("routine_habit_id"), // FK → routine_habits.id (NULL for custom)
    title: text("title").notNull(),
    description: text("description"),
    cadence: text("cadence").notNull().default("daily"),
    recommendedTime: text("recommended_time"),
    isActive: boolean("is_active").notNull().default(true),
    isCustom: boolean("is_custom").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_user_assigned_habits_user").on(table.userId),
  ]
);

export type UserAssignedHabit = typeof userAssignedHabits.$inferSelect;

// ─── 8. REMOVED HABITS (suppression tombstones) ───────────────────────────

/**
 * "I don't want this one." Without a tombstone, the next resume or re-enrol
 * re-materialises exactly what the member just deleted.
 *
 * Two suppression kinds: by template id, or by title for a custom habit that
 * has no template row. Scoped to an enrollment where one is known, so removing
 * a habit from one protocol doesn't blacklist it from every future one.
 */
export const userRemovedHabits = pgTable(
  "user_removed_habits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    userRoutineId: uuid("user_routine_id"), // FK → user_routines.id, nullable
    routineHabitId: uuid("routine_habit_id"), // FK → routine_habits.id, nullable
    title: text("title"), // used when there is no template
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_removed_habits_user").on(table.userId)]
);

export type UserRemovedHabit = typeof userRemovedHabits.$inferSelect;

// ─── Coaching-specific enums & constants ──────────────────────────────────

export const routineIntensityEnum = z.enum(["lite", "intense"]);
export const habitCadenceEnum = z.enum(["daily", "weekly", "as-needed"]);
export const routineTierEnum = z.enum(["free", "premium"]);

export const ROUTINE_CATEGORIES = [
  "Sleep",
  "Gut Health",
  "Detox",
  "Movement",
  "Mindfulness",
  "Nutrition",
  "Recovery",
  "Energy",
  "Stress",
  "Performance",
] as const;

export type RoutineCategory = (typeof ROUTINE_CATEGORIES)[number];

export const COINS_PER_HABIT_COMPLETION = 10;

// ─── COACHING MESSAGES (member ↔ coach thread) ─────────────────────────────

export const coachingMessages = pgTable(
  "coaching_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull().references(() => users.id),
    senderRole: text("sender_role").notNull().default("member"), // 'member' | 'coach'
    messageType: text("message_type").notNull().default("text"), // 'text' | 'progress_update' | 'photo'
    content: text("content").notNull(),
    imageUrl: text("image_url"),
    metadata: text("metadata"), // JSON string for progress data (routine name, stats, etc.)
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_coaching_msgs_user").on(t.userId),
    index("idx_coaching_msgs_user_created").on(t.userId, t.createdAt),
  ]
);

export const insertCoachingMessageSchema = createInsertSchema(coachingMessages).omit({
  id: true,
  readAt: true,
  createdAt: true,
});

export type CoachingMessage = typeof coachingMessages.$inferSelect;
export type InsertCoachingMessage = z.infer<typeof insertCoachingMessageSchema>;
