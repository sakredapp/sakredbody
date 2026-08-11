/**
 * The habits a member has chosen to track — their Restore list and their Build
 * list.
 *
 * ── Separate from `habits`, on purpose ────────────────────────────────────
 *
 * `habits` holds one row per habit per day: the thing you tick. This holds the
 * *standing choice* behind those rows — "magnesium is part of my evening" is
 * true until it isn't, and it should not have to be re-decided every morning
 * or reconstructed by looking at which rows happen to exist.
 *
 * Keeping them apart also means removing a habit stops tomorrow without
 * rewriting yesterday. A member who drops cold exposure in March should still
 * see that they did it in February; deleting the daily rows would quietly
 * revise their own history.
 *
 * ── No cap on how many ────────────────────────────────────────────────────
 *
 * Three to five a side is the number most habit research lands on, and it is
 * good advice. It is not a rule the database should enforce: what somebody can
 * carry is theirs to judge, and an app that refuses a sixth habit is telling a
 * person it knows their capacity better than they do — which is the opposite
 * of the whole premise. The UI can say what tends to work. It should not
 * prevent.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { EMPHASES } from "./terrain.js";

export const trackedHabits = pgTable(
  "tracked_habits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    routineHabitId: uuid("routine_habit_id").notNull(),

    /**
     * Copied from the habit rather than joined for it.
     *
     * The one place denormalisation earns its keep here: the two lists are
     * read on every home screen load, and a habit's own emphasis could in
     * principle be edited by an admin afterwards. A member who put something
     * on their Restore list should not find it silently moved to Build because
     * somebody retagged the template.
     */
    emphasis: text("emphasis").notNull(),

    /** Their own number, when they want one other than the habit's default. */
    target: doublePrecision("target"),

    /** 'member' | 'coach' — who put it there. */
    addedBy: text("added_by").notNull().default("member"),
    /** The coach, when a coach did. Null when the member chose it themselves. */
    addedByUserId: text("added_by_user_id"),

    orderIndex: integer("order_index").notNull().default(0),

    /**
     * Removed rather than deleted.
     *
     * A member who drops a habit and picks it up again next month is the
     * common case, and `active` keeps that from looking like two unrelated
     * decisions. The unique index is partial for the same reason.
     */
    active: boolean("active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_tracked_habits_active").on(t.userId, t.routineHabitId),
    index("idx_tracked_habits_user").on(t.userId, t.emphasis),
  ],
);

export type TrackedHabit = typeof trackedHabits.$inferSelect;

export const addTrackedHabitSchema = z.object({
  routineHabitId: z.string().uuid(),
  /** Optional override of the habit's own default. */
  target: z.number().positive().nullable().optional(),
});

export const reorderTrackedSchema = z.object({
  emphasis: z.enum(EMPHASES),
  /** Every id on that side, in the order they should appear. */
  ids: z.array(z.string().uuid()).max(200),
});

/**
 * What the UI says about how many to take on.
 *
 * Advice, not a limit — see the note at the top of this file. Shown once the
 * list is longer than the number that tends to hold, and never as a blocker.
 */
export const HABITS_THAT_TEND_TO_HOLD = 5;
