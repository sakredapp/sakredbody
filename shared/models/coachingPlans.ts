/**
 * The Coach's Plan — a container, and what a client may say about it.
 *
 * ── What this deliberately does not hold ──────────────────────────────────
 *
 * A target. A schedule. A completion. Any of those living here would be a
 * second copy of something `tracked_habit_phases` already owns, and the moment
 * there are two copies a screen can read the wrong one. The plan says *which
 * practices, configured how, by whom, for what stretch of time*. What the
 * member is actually contracted to do stays where it already was.
 *
 * Draft items are the exception, and only because a draft is by definition not
 * yet a contract — see the note on `coachingPlanItems`.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  varchar,
  date,
  integer,
  smallint,
  doublePrecision,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";

export const PLAN_STATUSES = ["draft", "active", "ended"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/**
 * Deliberately no `completed`.
 *
 * Whether a plan ran its course is `ended_at >= ends_on` — derivable, and a
 * derivable fourth state is one two code paths eventually disagree about. The
 * same reasoning kept `classification_source` off imported workouts and
 * `paused` off `coach_relationships`.
 */
export function planRanItsCourse(plan: {
  endedAt: Date | string | null;
  endsOn: string | null;
}): boolean {
  if (!plan.endedAt || !plan.endsOn) return false;
  const ended = typeof plan.endedAt === "string" ? plan.endedAt : plan.endedAt.toISOString();
  return ended.slice(0, 10) >= plan.endsOn;
}

export const coachingPlans = pgTable(
  "coaching_plans",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    memberUserId: varchar("member_user_id").notNull(),
    /** Kept after reassignment: who put this member on this is a fact. */
    coachUserId: varchar("coach_user_id").notNull(),
    relationshipId: uuid("relationship_id"),

    title: text("title").notNull(),
    focus: text("focus"),

    /** Written to the member. */
    memberVisibleNote: text("member_visible_note"),
    /** The coach's own. The member is not its audience, ever. */
    internalNote: text("internal_note"),

    status: text("status").notNull().default("draft"),

    startsOn: date("starts_on"),
    endsOn: date("ends_on"),

    /**
     * The human who actually did it, which is not always the coach it belongs
     * to. An admin intervening under `superviseCoaching` is recorded as
     * themselves; attributing their work to the assigned coach would be a lie
     * that outlives them both.
     */
    createdByUserId: varchar("created_by_user_id").notNull(),
    activatedByUserId: varchar("activated_by_user_id"),
    endedByUserId: varchar("ended_by_user_id"),

    activatedAt: timestamp("activated_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_coaching_plan_member").on(t.memberUserId, t.status, t.createdAt),
    index("idx_coaching_plan_coach").on(t.coachUserId, t.status),
  ],
);

export type CoachingPlan = typeof coachingPlans.$inferSelect;

export const PLAN_INTENTS = ["add", "change", "end"] as const;
export type PlanIntent = (typeof PLAN_INTENTS)[number];

/**
 * What a draft intends, before any of it is true.
 *
 * A draft cannot be expressed as phases: a phase is live by construction, and
 * a coach assembling a plan over two sittings must not change what the member
 * is asked to do that evening on every click. So intent lives here, and
 * activation turns it into contracts through the existing writers.
 *
 * These columns mirror the phase contract on purpose — they are the arguments
 * to `addTrackedHabit`/`reconfigure`, not a parallel model of a habit. Nothing
 * reads them to decide what a member owes today; only activation reads them.
 */
export const coachingPlanItems = pgTable(
  "coaching_plan_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    planId: uuid("plan_id").notNull(),
    /** Always a catalogue habit. There is no free-text practice. */
    routineHabitId: uuid("routine_habit_id").notNull(),

    intent: text("intent").notNull().default("add"),

    target: doublePrecision("target"),
    scheduleKind: text("schedule_kind"),
    scheduleDays: smallint("schedule_days").array(),
    scheduleCount: integer("schedule_count"),
    recommendedTime: text("recommended_time"),

    memberReason: text("member_reason"),
    coachNote: text("coach_note"),

    /**
     * The goal this line is in service of, if it is in service of one.
     *
     * Optional, and it stays optional. Health is not only goal pursuit — the
     * sleep window, the breath practice and the walk a coach prescribes
     * because somebody is fraying are all legitimate and serve no goal at all.
     * Requiring every planned action to belong to one would turn a coach's
     * judgement into a filing exercise, and the filing would be fictional.
     */
    goalId: uuid("goal_id"),

    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_coaching_plan_item").on(t.planId, t.routineHabitId),
    index("idx_coaching_plan_item_plan").on(t.planId, t.orderIndex),
  ],
);

export type CoachingPlanItem = typeof coachingPlanItems.$inferSelect;

// ─── What a client may say ─────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/**
 * Creating or editing a draft.
 *
 * Status, dates of activation, attribution and the member are all the server's
 * to decide. A client that could set `status: "active"` could skip the review
 * that is the whole point of having a draft.
 */
export const planDraftSchema = z.object({
  title: z.string().min(1, "Give the plan a name.").max(120),
  focus: z.string().max(300).nullable().optional(),
  memberVisibleNote: z.string().max(4000).nullable().optional(),
  internalNote: z.string().max(4000).nullable().optional(),
  startsOn: isoDate.nullable().optional(),
  endsOn: isoDate.nullable().optional(),
});

/**
 * One practice in a draft.
 *
 * `intent` is accepted from the client because it is the coach's decision —
 * "end this" and "change this" are different things a human means — but it is
 * validated against the member's real state at review, so an `add` for
 * something they already track resolves to `change` rather than being trusted.
 */
export const planItemSchema = z.object({
  routineHabitId: z.string().uuid("Pick a practice from the catalogue."),
  intent: z.enum(PLAN_INTENTS).default("add"),
  target: z.number().finite().nonnegative().nullable().optional(),
  schedule: z
    .object({
      kind: z.enum(["daily", "days_of_week", "times_per_week"]),
      days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      count: z.number().int().min(1).max(21).optional(),
    })
    .nullable()
    .optional(),
  recommendedTime: z.string().max(40).nullable().optional(),
  memberReason: z.string().max(2000).nullable().optional(),
  coachNote: z.string().max(2000).nullable().optional(),
});

export type PlanDraftInput = z.infer<typeof planDraftSchema>;
export type PlanItemInput = z.infer<typeof planItemSchema>;
