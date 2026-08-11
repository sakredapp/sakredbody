/**
 * The habits a member is actually on — and the contracts behind them.
 *
 * ── Four nouns, and why each one exists ───────────────────────────────────
 *
 *   routine_habits         what a thing IS. Canonical, shared, editable by
 *                          admin. "Magnesium glycinate before bed."
 *   tracked_habits         that this member is on it. A standing relationship,
 *                          not a configuration. Survives every reconfiguration.
 *   tracked_habit_phases   what they were asked to do, and when. FROZEN.
 *   habit_entries          what they actually did, on a day.
 *
 * ── The phase is the whole point ──────────────────────────────────────────
 *
 * Nick's protein target is 140g. Two weeks in, his coach raises it to 165g.
 *
 * If the target lives on a mutable row, that UPDATE silently rewrites two
 * weeks of history: fourteen days he hit are now fourteen days he missed, and
 * there is no record anywhere that he was ever asked for 140. The app has
 * decided he failed at something he wasn't doing.
 *
 * So a phase is a contract, and contracts are not edited. Raising the target
 * closes the 140g phase and opens a 165g one, in one transaction. Week one
 * grades against week one's contract forever, with no snapshot logic, no
 * effective-dated join, no "which version was live on the 3rd" query — the
 * entry points at the phase it was written under.
 *
 * "Frozen" means the configuration cannot be rewritten. Lifecycle can still
 * move: a phase gets closed, superseded, completed. What must never change is
 * what the person was expected to do on a day that has already happened. A
 * database trigger enforces exactly that boundary, because a convention that
 * lives only in a comment is a convention somebody will break at 2am.
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
  smallint,
  boolean,
  doublePrecision,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { EMPHASES } from "./terrain.js";
import { SCHEDULE_KINDS, scheduleSchema } from "./habitSchedule.js";
import { ENTRY_OPS } from "./habitMeasurement.js";

// ─── 1. THE STANDING RELATIONSHIP ──────────────────────────────────────────

export const TRACKED_STATUSES = ["active", "paused", "completed", "archived"] as const;
export type TrackedStatus = (typeof TRACKED_STATUSES)[number];

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

    /**
     * 'active' | 'paused' | 'completed' | 'archived'.
     *
     * Paused is not archived and neither is a delete. A member who drops a
     * habit and picks it up again next month is the common case, and this
     * keeps that from looking like two unrelated decisions — the unique index
     * is partial for the same reason.
     */
    status: text("status").notNull().default("active"),

    /** Who first put it there — 'member' | 'coach'. Never overwritten. */
    firstAddedBy: text("first_added_by").notNull().default("member"),
    firstAddedByUserId: text("first_added_by_user_id"),

    orderIndex: integer("order_index").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_tracked_habits_live")
      .on(t.userId, t.routineHabitId)
      .where(sql`status <> 'archived'`),
    index("idx_tracked_habits_user").on(t.userId, t.emphasis),
  ],
);

export type TrackedHabit = typeof trackedHabits.$inferSelect;

// ─── 2. THE CONTRACT ───────────────────────────────────────────────────────

export const PHASE_STATUSES = [
  "active",
  "completed",
  "superseded",
  "cancelled",
  "paused",
] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const PHASE_TYPES = ["ongoing", "fixed"] as const;
export type PhaseType = (typeof PHASE_TYPES)[number];

/** Which context configured this contract. See `trackedHabitLinks` for membership. */
export const PHASE_SOURCES = ["member", "coach", "plan", "retreat", "cohort"] as const;
export type PhaseSource = (typeof PHASE_SOURCES)[number];

export const trackedHabitPhases = pgTable(
  "tracked_habit_phases",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    trackedHabitId: uuid("tracked_habit_id").notNull(),

    /**
     * Both denormalised from tracked_habits, and both earn it.
     *
     * `user_id` is what every authorization check and every history query
     * filters on, and reaching it through a join on the hot path costs more
     * than the column. `routine_habit_id` is what the resolver needs to know
     * the tracking type without a second join. Neither can drift: a phase
     * belongs to exactly one tracked habit, which belongs to exactly one
     * member and one catalogue row, for its whole life.
     */
    userId: text("user_id").notNull(),
    routineHabitId: uuid("routine_habit_id").notNull(),

    status: text("status").notNull().default("active"),

    // ─ frozen configuration ─────────────────────────────────────────────
    // Everything from here to `coachNote` is the contract. The
    // tracked_habit_phases_freeze trigger rejects any UPDATE that touches it.

    /** The number to hit. Null for a boolean habit — there is nothing to hit. */
    target: doublePrecision("target"),

    phaseType: text("phase_type").notNull().default("ongoing"),
    startsOn: date("starts_on").notNull(),
    /** Fixed phases only. `endsOn` is generated from this in the database. */
    durationDays: integer("duration_days"),

    scheduleKind: text("schedule_kind").notNull().default("daily"),
    /** 0 = Sunday. Only for schedule_kind = 'days_of_week'. */
    scheduleDays: smallint("schedule_days").array(),
    /** Only for schedule_kind = 'times_per_week'. */
    scheduleCount: integer("schedule_count"),

    recommendedTime: text("recommended_time"),

    source: text("source").notNull().default("member"),
    assignedByUserId: text("assigned_by_user_id"),

    /** Shown to the member — "why am I doing this?". */
    memberReason: text("member_reason"),
    /** Never shown to the member. The coach's own note. */
    coachNote: text("coach_note"),

    // ─ end of frozen configuration ──────────────────────────────────────

    /**
     * The last day a fixed phase covers, computed by the database.
     *
     * Derived rather than stored twice, and derived *in Postgres* rather than
     * in the resolver, because every query that asks "which contract was live
     * on the 3rd" needs it in the WHERE clause. A number the application
     * computes cannot be filtered on without fetching every phase first.
     */
    endsOn: date("ends_on").generatedAlwaysAs(
      sql`CASE WHEN duration_days IS NULL THEN NULL ELSE starts_on + (duration_days - 1) END`,
    ),

    /**
     * The last day this contract applied. Lifecycle, not configuration.
     *
     * Set when a phase is superseded or cancelled, so yesterday still grades
     * against yesterday's contract and tomorrow grades against the new one.
     * Null while active.
     */
    closedOn: date("closed_on"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    /**
     * One live contract at a time. This is what makes "close the old, open the
     * new" safe: the failure mode of a two-statement reconfiguration is two
     * active phases with different targets, and from there nothing downstream
     * can say what the member was asked to do.
     */
    uniqueIndex("uq_phase_one_active")
      .on(t.trackedHabitId)
      .where(sql`status = 'active'`),
    index("idx_phase_user_active").on(t.userId, t.status),
    index("idx_phase_tracked").on(t.trackedHabitId, t.startsOn),
  ],
);

export type TrackedHabitPhase = typeof trackedHabitPhases.$inferSelect;

// ─── 3. WHAT ACTUALLY HAPPENED ─────────────────────────────────────────────

export const ENTRY_KINDS = ["manual", "override"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const habitEntries = pgTable(
  "habit_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    trackedHabitId: uuid("tracked_habit_id").notNull(),

    /**
     * The contract this was recorded under.
     *
     * This single column is the answer to the whole historical-configuration
     * problem. An entry from week one points at the 140g phase; nothing has to
     * reconstruct what the target was on the 3rd, because the row already
     * knows.
     */
    phaseId: uuid("phase_id").notNull(),

    /** The member's own calendar date, never the server's. */
    onDate: date("on_date").notNull(),

    /**
     * For a boolean habit, 1 or 0. For everything else, the number in the
     * habit's own unit — grams, ounces, minutes; minutes-since-midnight for
     * time-of-day.
     */
    value: doublePrecision("value").notNull(),

    /** 'add' | 'set' — see habitMeasurement.ts. Four taps of +20oz is four adds. */
    op: text("op").notNull().default("set"),

    /**
     * 'manual' | 'override'. An override says "the phone is wrong, or the
     * phone was off" and outranks health data for that day. A plain manual
     * entry never competes with health data — it is only read when there is
     * none. Nothing anywhere sums the two.
     */
    kind: text("kind").notNull().default("manual"),

    note: text("note"),

    /** A coach may log on a member's behalf; the row says who did. */
    createdByUserId: text("created_by_user_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_habit_entries_user_date").on(t.userId, t.onDate),
    index("idx_habit_entries_tracked_date").on(t.trackedHabitId, t.onDate),
    index("idx_habit_entries_phase").on(t.phaseId),
  ],
);

export type HabitEntry = typeof habitEntries.$inferSelect;

// ─── 4. PROPOSALS ──────────────────────────────────────────────────────────

/**
 * A suggestion is not a contract.
 *
 * The alternative was a phase with status 'proposed', and it fails on two
 * counts. A phase that a member has not agreed to would still be the newest
 * row on a tracked habit that may not exist yet, and every "what is this
 * person on" query would have to remember to exclude it — the sort of
 * exclusion that gets forgotten in exactly one place. And a *declined*
 * suggestion is not a phase at all: nothing was ever in force, so there is
 * nothing to close, and yet it is the row we most need to keep, because the
 * thing that must not happen is proposing it again next Tuesday.
 *
 * Acceptance creates the tracked habit if needed and opens its first phase, in
 * one transaction. Until then nothing exists that anything downstream can
 * mistake for something the member is doing.
 */
export const PROPOSAL_STATUSES = ["proposed", "accepted", "declined", "withdrawn"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const habitProposals = pgTable(
  "habit_proposals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    routineHabitId: uuid("routine_habit_id").notNull(),

    emphasis: text("emphasis").notNull(),
    status: text("status").notNull().default("proposed"),

    // The configuration being proposed — becomes the phase on acceptance.
    target: doublePrecision("target"),
    phaseType: text("phase_type").notNull().default("ongoing"),
    durationDays: integer("duration_days"),
    scheduleKind: text("schedule_kind").notNull().default("daily"),
    scheduleDays: smallint("schedule_days").array(),
    scheduleCount: integer("schedule_count"),
    recommendedTime: text("recommended_time"),

    /** Shown to the member. "Your sleep is down; this is the cheapest fix." */
    reason: text("reason"),

    proposedBy: text("proposed_by").notNull().default("coach"),
    proposedByUserId: text("proposed_by_user_id"),

    respondedAt: timestamp("responded_at", { withTimezone: true }),
    /** Set on acceptance, so the proposal and the contract can be walked back. */
    resultingPhaseId: uuid("resulting_phase_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    /** One open proposal per habit per member — not one ever. */
    uniqueIndex("uq_proposal_open")
      .on(t.userId, t.routineHabitId)
      .where(sql`status = 'proposed'`),
    index("idx_proposals_user").on(t.userId, t.status),
  ],
);

export type HabitProposal = typeof habitProposals.$inferSelect;

// ─── 5. CONTEXT MEMBERSHIP ─────────────────────────────────────────────────

/**
 * A habit can belong to more than one thing at once.
 *
 * Nick already tracks Morning Light because he chose to. In March his coach
 * puts Morning Light in the Coach's Plan. If membership were a single `source`
 * column on the tracked habit, we would either overwrite the fact that he
 * chose it himself, or create a second tracked habit and show him the same
 * item twice with two separate streaks.
 *
 * So membership is a set. The phase still records who configured the contract
 * currently in force, which is a different question and stays where it is.
 */
export const CONTEXT_TYPES = ["plan", "cohort", "retreat"] as const;
export type ContextType = (typeof CONTEXT_TYPES)[number];

export const trackedHabitLinks = pgTable(
  "tracked_habit_links",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    trackedHabitId: uuid("tracked_habit_id").notNull(),
    contextType: text("context_type").notNull(),
    contextId: text("context_id").notNull(),
    addedByUserId: text("added_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_tracked_link").on(t.trackedHabitId, t.contextType, t.contextId),
    index("idx_tracked_link_context").on(t.contextType, t.contextId),
  ],
);

export type TrackedHabitLink = typeof trackedHabitLinks.$inferSelect;

// ─── 6. HOW CATALOGUE ITEMS RELATE ─────────────────────────────────────────

/**
 * Prerequisites, conflicts, pairings.
 *
 * The engine that reads these is not being built today. The table is, because
 * the alternative is discovering in six months that a 200-row catalogue has no
 * way to say "don't add a third stressor to a week that already has two", and
 * then revisiting 200 rows by hand. Schema capacity is cheap; retrofitting
 * meaning onto rows that were never asked for it is not.
 */
export const habitRelations = pgTable(
  "habit_relations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    habitId: uuid("habit_id").notNull(),
    relatedHabitId: uuid("related_habit_id").notNull(),
    /** 'requires' | 'conflicts' | 'pairs' | 'replaces' | 'increases'. */
    relation: text("relation").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_habit_relation").on(t.habitId, t.relatedHabitId, t.relation),
    index("idx_habit_relation_related").on(t.relatedHabitId),
  ],
);

export type HabitRelation = typeof habitRelations.$inferSelect;

// ─── 7. WHAT THE API ACCEPTS ───────────────────────────────────────────────

/**
 * One shape for every way a contract gets written — member adds it, coach
 * assigns it, member reconfigures it, a proposal is accepted. Four call sites
 * validating four slightly different objects is how a coach-assigned habit
 * ends up allowed to skip a check the member's own path enforces.
 */
export const habitConfigSchema = z
  .object({
    target: z.number().finite().positive().nullable().optional(),
    schedule: scheduleSchema.optional(),
    phaseType: z.enum(PHASE_TYPES).optional(),
    durationDays: z.number().int().min(1).max(365).nullable().optional(),
    /** Defaults to the member's today, server-side. Never trusted from the body. */
    startsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    recommendedTime: z.string().max(40).nullable().optional(),
    memberReason: z.string().max(500).nullable().optional(),
    coachNote: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.phaseType !== "fixed" || (v.durationDays ?? 0) > 0, {
    message: "A fixed phase needs a number of days.",
    path: ["durationDays"],
  })
  .refine((v) => v.phaseType === "fixed" || !v.durationDays, {
    message: "An ongoing phase has no end date.",
    path: ["durationDays"],
  });

export type HabitConfig = z.infer<typeof habitConfigSchema>;

export const addTrackedHabitSchema = z.object({
  routineHabitId: z.string().uuid(),
  config: habitConfigSchema.optional(),
});

export const reorderTrackedSchema = z.object({
  emphasis: z.enum(EMPHASES),
  /** Every id on that side, in the order they should appear. */
  ids: z.array(z.string().uuid()).max(200),
});

export const logEntrySchema = z.object({
  /** Defaults to the member's today. A client may back-date within reason. */
  onDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  value: z.number().finite(),
  op: z.enum(ENTRY_OPS).optional(),
  kind: z.enum(ENTRY_KINDS).optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const proposeHabitSchema = z.object({
  routineHabitId: z.string().uuid(),
  reason: z.string().max(500).nullable().optional(),
  config: habitConfigSchema.optional(),
});

/** Schedule kinds, re-exported so a form and a constraint cannot drift. */
export { SCHEDULE_KINDS };

/**
 * What the UI says about how many to take on.
 *
 * Advice, not a limit — see the note at the top of this file. Shown once the
 * list is longer than the number that tends to hold, and never as a blocker.
 */
export const HABITS_THAT_TEND_TO_HOLD = 5;
