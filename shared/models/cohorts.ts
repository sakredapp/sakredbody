import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Masterminds — cohorts, their roster, and their schedule.
 *
 * supabase/cohorts.sql has said "Mirrors shared/models/cohorts.ts" since it
 * was written. That file did not exist: the tables were created, RLS was
 * enabled and policies were written, and then nothing in the server or the
 * client ever referenced them. This is the missing half.
 *
 * A cohort is the general shape — `kind` distinguishes a mastermind from a
 * smaller circle — so the same tables carry every group program rather than
 * one set per product.
 */
export const cohorts = pgTable(
  "cohorts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    /** 'mastermind' | 'cohort' | 'circle' */
    kind: text("kind").notNull().default("mastermind"),
    description: text("description"),
    coverUrl: text("cover_url"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    /** 'in_person' | 'virtual' | 'hybrid' */
    format: text("format").notNull().default("hybrid"),
    location: text("location"),
    capacity: integer("capacity").notNull().default(12),
    /**
     * Cents, unlike properties.price_per_night which is whole units. The
     * difference is deliberate — a nightly rate is quoted round, a program
     * price is not — but it is exactly the kind of thing that gets divided by
     * a hundred in the wrong place, so it is spelled out in the column name
     * and again here.
     */
    priceCents: integer("price_cents"),
    priceNote: text("price_note"),
    applicationRequired: boolean("application_required").notNull().default(true),
    /** 'draft' | 'open' | 'closed' | 'running' | 'complete' */
    status: text("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_cohorts_status").on(table.status)],
);

/**
 * The roster.
 *
 * A withdrawal is a state change, never a delete — a coach needs to know
 * someone left the room, and when. `reviewNote` is internal and the API
 * strips it before the row goes to a member.
 */
export const cohortMembers = pgTable(
  "cohort_members",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    cohortId: varchar("cohort_id").notNull(),
    userId: varchar("user_id").notNull(),
    /** 'applied' | 'invited' | 'confirmed' | 'declined' | 'withdrawn' */
    status: text("status").notNull().default("applied"),
    /** What the applicant wrote. */
    note: text("note"),
    /** Internal. Never leaves the server on a member-facing route. */
    reviewNote: text("review_note"),
    appliedAt: timestamp("applied_at").defaultNow(),
    decidedAt: timestamp("decided_at"),
  },
  (table) => [
    index("idx_cohort_members_cohort").on(table.cohortId),
    index("idx_cohort_members_user").on(table.userId),
    uniqueIndex("uq_cohort_members").on(table.cohortId, table.userId),
  ],
);

export const cohortSessions = pgTable(
  "cohort_sessions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    cohortId: varchar("cohort_id").notNull(),
    title: text("title").notNull(),
    agenda: text("agenda"),
    startsAt: timestamp("starts_at"),
    durationMinutes: integer("duration_minutes"),
    location: text("location"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_cohort_sessions_cohort").on(table.cohortId)],
);

export const cohortAttendance = pgTable(
  "cohort_attendance",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: varchar("session_id").notNull(),
    userId: varchar("user_id").notNull(),
    present: boolean("present").notNull().default(true),
    note: text("note"),
    recordedAt: timestamp("recorded_at").defaultNow(),
  },
  (table) => [
    index("idx_cohort_attendance_session").on(table.sessionId),
    uniqueIndex("uq_cohort_attendance").on(table.sessionId, table.userId),
  ],
);

export type Cohort = typeof cohorts.$inferSelect;
export type CohortMember = typeof cohortMembers.$inferSelect;
export type CohortSession = typeof cohortSessions.$inferSelect;
export type CohortAttendance = typeof cohortAttendance.$inferSelect;

/**
 * Kept in one place so the form, the zod schema, the check constraint in
 * supabase/cohorts.sql and the admin filter all agree.
 */
export const COHORT_KINDS = ["mastermind", "cohort", "circle"] as const;
export const COHORT_FORMATS = ["in_person", "virtual", "hybrid"] as const;
export const COHORT_STATUSES = ["draft", "open", "closed", "running", "complete"] as const;
export const COHORT_MEMBER_STATUSES = [
  "applied",
  "invited",
  "confirmed",
  "declined",
  "withdrawn",
] as const;

/** Statuses that occupy a seat. Used for the "8 of 12" count. */
export const COHORT_SEAT_TAKEN: readonly string[] = ["invited", "confirmed"];
