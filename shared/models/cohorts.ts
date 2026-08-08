/**
 * Masterminds — cohorts
 *
 * Retreats are places. A mastermind is a group moving through time together,
 * which is a different shape: it has a roster, a schedule, and a beginning and
 * end that everyone shares. Modelling it as a retreat with extra columns would
 * have meant a booking_request per person and no way to see the room.
 *
 *   cohorts        — the group and its run
 *   cohort_members — the roster, with where each person is in joining
 *   cohort_sessions — the schedule
 *   cohort_attendance — who was in the room
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
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── 1. COHORTS ────────────────────────────────────────────────────────────

export const cohorts = pgTable(
  "cohorts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("mastermind"), // mastermind | cohort | circle
    description: text("description"),
    coverUrl: text("cover_url"),

    startDate: date("start_date"),
    endDate: date("end_date"),

    format: text("format").notNull().default("hybrid"), // in_person | virtual | hybrid
    location: text("location"),

    // Small by design. A mastermind that scales isn't one.
    capacity: integer("capacity").notNull().default(12),
    priceCents: integer("price_cents"),
    priceNote: text("price_note"),

    applicationRequired: boolean("application_required").notNull().default(true),

    // draft   — not visible to members
    // open    — accepting applications
    // closed  — roster set, not yet started
    // running — under way
    // complete
    status: text("status").notNull().default("draft"),

    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_cohorts_status").on(t.status)]
);

export const cohortKindEnum = z.enum(["mastermind", "cohort", "circle"]);
export const cohortFormatEnum = z.enum(["in_person", "virtual", "hybrid"]);
export const cohortStatusEnum = z.enum(["draft", "open", "closed", "running", "complete"]);

export type CohortKind = z.infer<typeof cohortKindEnum>;
export type CohortFormat = z.infer<typeof cohortFormatEnum>;
export type CohortStatus = z.infer<typeof cohortStatusEnum>;

export const insertCohortSchema = createInsertSchema(cohorts, {
  kind: cohortKindEnum,
  format: cohortFormatEnum,
  status: cohortStatusEnum,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type Cohort = typeof cohorts.$inferSelect;
export type InsertCohort = z.infer<typeof insertCohortSchema>;

// ─── 2. MEMBERS ────────────────────────────────────────────────────────────

/**
 * One row per person per cohort, from the moment they express interest.
 * `status` carries the whole join, so a withdrawal is a state change rather
 * than a delete — a coach needs to know someone left, and when.
 */
export const cohortMembers = pgTable(
  "cohort_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    status: text("status").notNull().default("applied"),
    // What they wrote when applying. Kept on the roster row rather than a
    // separate applications table — a mastermind application is one paragraph,
    // not a 34-question intake.
    note: text("note"),
    reviewNote: text("review_note"), // the coach's, never shown to the member
    appliedAt: timestamp("applied_at").defaultNow(),
    decidedAt: timestamp("decided_at"),
  },
  (t) => [
    index("idx_cohort_members_cohort").on(t.cohortId),
    index("idx_cohort_members_user").on(t.userId),
    uniqueIndex("uq_cohort_members").on(t.cohortId, t.userId),
  ]
);

export const cohortMemberStatusEnum = z.enum([
  "applied",
  "invited",
  "confirmed",
  "declined",
  "withdrawn",
]);
export type CohortMemberStatus = z.infer<typeof cohortMemberStatusEnum>;

export type CohortMember = typeof cohortMembers.$inferSelect;

// ─── 3. SESSIONS ───────────────────────────────────────────────────────────

export const cohortSessions = pgTable(
  "cohort_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    agenda: text("agenda"),
    startsAt: timestamp("starts_at"),
    durationMinutes: integer("duration_minutes"),
    location: text("location"), // room, or a meeting link
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_cohort_sessions_cohort").on(t.cohortId)]
);

export const insertCohortSessionSchema = createInsertSchema(cohortSessions).omit({
  id: true,
  createdAt: true,
});

export type CohortSession = typeof cohortSessions.$inferSelect;
export type InsertCohortSession = z.infer<typeof insertCohortSessionSchema>;

// ─── 4. ATTENDANCE ─────────────────────────────────────────────────────────

export const cohortAttendance = pgTable(
  "cohort_attendance",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => cohortSessions.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    present: boolean("present").notNull().default(true),
    note: text("note"),
    recordedAt: timestamp("recorded_at").defaultNow(),
  },
  (t) => [
    index("idx_cohort_attendance_session").on(t.sessionId),
    uniqueIndex("uq_cohort_attendance").on(t.sessionId, t.userId),
  ]
);

export type CohortAttendance = typeof cohortAttendance.$inferSelect;
