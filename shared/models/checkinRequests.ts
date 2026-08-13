/**
 * A coach asking how somebody is actually doing.
 *
 * ── The whole design, in one sentence ─────────────────────────────────────
 *
 * This is a request. The answer is a `terrain_checkins` row, and always was.
 *
 * The tempting version of this feature stores the answers here — a coach asked
 * these questions, here is what they got back. It is tempting because it makes
 * the coaching feature self-contained, and it is wrong: Sakred would then hold
 * two subjective histories of one body, one feeding terrain and recommendations
 * and one shown to a coach, disagreeing within a week with nothing to say which
 * one is the member. So the request points at the canonical row and copies
 * nothing out of it.
 *
 * ── Requested is not the same as caused ───────────────────────────────────
 *
 * Sarah checks in at 8am. Nick asks at noon. Sarah opens his request at 2pm and
 * updates today's answers. There is one check-in for that day, and it existed
 * before Nick asked.
 *
 * `completed_at` says when she answered him. The linked row says what she said.
 * If she revises at 6pm, the link still points at the same row and its values
 * change — because that is what is true, and freezing a copy at 2pm would leave
 * a coach reading a body state the member has since corrected. What the product
 * must never print is "Sarah answered this at 2:03pm" over values she edited at
 * 6:14pm. Two facts, said separately.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, uuid, varchar, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";

/**
 * What the coach wants looked at.
 *
 * Three shapes, all resolving to the same seven canonical signals — this says
 * which ones the coach cares about today, not which ones exist. A drag-and-drop
 * survey builder would let a coach invent an eighth signal that no part of
 * Sakred can read, and the answer would land nowhere.
 */
export const CHECKIN_KINDS = ["quick", "recovery", "reflection"] as const;
export type CheckinKind = (typeof CHECKIN_KINDS)[number];

export const CHECKIN_KIND_META: Readonly<
  Record<CheckinKind, { label: string; blurb: string; signals: readonly string[] }>
> = {
  quick: {
    label: "Quick terrain check",
    blurb: "The core read — how the body is doing today.",
    signals: ["energy", "recovery", "nervousSystem", "digestion"],
  },
  recovery: {
    label: "Training recovery check",
    blurb: "Before or after something demanding.",
    signals: ["recovery", "energy", "bodyTension"],
  },
  reflection: {
    label: "Open reflection",
    blurb: "One question, in their own words.",
    signals: [],
  },
};

export const CHECKIN_REQUEST_STATUSES = ["open", "completed", "cancelled"] as const;
export type CheckinRequestStatus = (typeof CHECKIN_REQUEST_STATUSES)[number];

export const coachingCheckinRequests = pgTable(
  "coaching_checkin_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    memberUserId: varchar("member_user_id").notNull(),
    coachUserId: varchar("coach_user_id").notNull(),
    /** Who was coaching when this was asked — kept through reassignment. */
    relationshipId: uuid("relationship_id"),

    /**
     * Who clicked, which is not always whose request it is.
     *
     * Same separation plans make: an admin acting on a coach's behalf must
     * never be recorded as the coach.
     */
    requestedByUserId: varchar("requested_by_user_id").notNull(),

    kind: text("kind").notNull().default("quick"),
    status: text("status").notNull().default("open"),

    /** Shown to the member. Not a private note — there is nowhere private here. */
    coachPrompt: text("coach_prompt"),

    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    dueOn: date("due_on"),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: varchar("cancelled_by_user_id"),

    /** The canonical check-in they answered with. A pointer, never a copy. */
    checkinId: uuid("checkin_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_coaching_checkin_open")
      .on(t.memberUserId, t.coachUserId)
      .where(sql`status = 'open'`),
    index("idx_coaching_checkin_member").on(t.memberUserId, t.status),
    index("idx_coaching_checkin_coach").on(t.coachUserId, t.status, t.requestedAt),
  ],
);

export type CheckinRequest = typeof coachingCheckinRequests.$inferSelect;

/**
 * What a coach may say when asking.
 *
 * No member id, no status, no timestamps — the route knows who is being asked
 * from the URL and who is asking from the session, and a client that could name
 * either could ask anybody for anything.
 */
export const checkinRequestSchema = z.object({
  kind: z.enum(CHECKIN_KINDS).default("quick"),
  coachPrompt: z.string().trim().max(500).nullable().optional(),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type CheckinRequestInput = z.infer<typeof checkinRequestSchema>;

/**
 * Is this request still waiting, from the member's point of view?
 *
 * Overdue is deliberately not a state. A due date that has passed is still a
 * question somebody asked, and turning it red converts a coach's "before
 * tomorrow's session" into a compliance failure — which is the opposite of what
 * asking someone how they feel is for.
 */
export function isAwaiting(r: Pick<CheckinRequest, "status">): boolean {
  return r.status === "open";
}
