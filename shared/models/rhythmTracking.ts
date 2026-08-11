/**
 * Where rhythm facts are kept — as history, never as a current-state column.
 *
 * ── Why events and not a `current_phase` field ────────────────────────────
 *
 * The obvious shape is two columns on `users`: last period start, current
 * phase. It is wrong in three separate ways and each of them shows up in the
 * first week of real use.
 *
 * A single mutable field cannot say *who* said so. "She told me she's in the
 * luteal phase" and "we counted 23 days since a date she typed in March" are
 * different claims, and the interface is supposed to speak differently about
 * each of them — `phaseLabel` in rhythm.ts already does, and it can only do
 * that if provenance survives.
 *
 * A single mutable field cannot say *when*. Staleness is the thing that stops
 * this feature being confidently wrong, and staleness is computed from the age
 * of a statement. Overwrite the row and the age is gone.
 *
 * And a single field cannot be corrected without lying about the past. A woman
 * who realises her period actually started on Tuesday should be able to say so
 * without the app pretending it always knew.
 *
 * So: events go in, interpretation comes out, and `estimatePhase()` is the
 * only thing that turns one into the other.
 *
 * ── Why a subject is not a user ───────────────────────────────────────────
 *
 * The first version of this had a `sex = female` check and read the cycle off
 * the member's own row. That makes the partner view impossible to build later
 * without a second, parallel implementation — which is the failure the whole
 * one-model-two-views design in rhythm.ts exists to prevent.
 *
 * A *subject* is whose rhythm this is. The member is one subject; a partner is
 * another. Both hang off the same owner, both accumulate the same events, and
 * both are read by the same estimator. A member may hold two — their own and
 * someone else's — which is exactly the case the product needs: understand
 * your own rhythm, and understand the rhythm of somebody close to you.
 *
 * ── What is deliberately not here yet ─────────────────────────────────────
 *
 * There is no share table. A partner subject is currently something the member
 * writes down themselves, like a note in a calendar, stored under their own
 * account and shown to nobody else. Two members linking their accounts so one
 * reads guidance derived from the other's real entries needs consent,
 * revocation and an audit trail, and none of that should be improvised
 * alongside the first version of the feature. The shape here does not have to
 * change to add it: a share is a row that grants an owner read access to a
 * subject somebody else owns.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  boolean,
  smallint,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { CYCLE_PHASES } from "./rhythm.js";

/** What a subject is to the member who owns the row. */
export const RHYTHM_RELATIONS = ["self", "partner"] as const;
export type RhythmRelation = (typeof RHYTHM_RELATIONS)[number];

export const rhythmSubjects = pgTable(
  "rhythm_subjects",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    /** The member who created this and is the only one who can read it. */
    ownerUserId: varchar("owner_user_id").notNull(),

    /** 'self' | 'partner'. See the note on why a subject is not a user. */
    relation: text("relation").notNull(),

    /**
     * What to call them on screen — "Sarah", or nothing for a self subject.
     *
     * A first name and no more. There is no reason for this table to hold a
     * fuller identity for somebody who never agreed to be in it.
     */
    label: text("label"),

    /**
     * If the subject is themselves a member, their id — reserved for the
     * consent flow described at the top. Null everywhere today, and nothing
     * reads it yet; writing to it without a share record would be exactly the
     * improvisation that note is warning against.
     *
     * It exists now so that linking is an *upgrade* rather than a migration.
     * When somebody's partner does join, this column is set on the row that
     * already holds the history — the alternative, deleting the subject and
     * creating a linked one, throws away every event the member recorded.
     */
    subjectUserId: varchar("subject_user_id"),

    /**
     * The subject's sex, asked outright and never inferred.
     *
     * It decides which body of guidance applies, and there is no honest way to
     * guess it: not from the member's own sex, not from relationship status,
     * not from a nickname. Guessing wrong here means showing a man cycle
     * guidance about his husband, which is both useless and insulting.
     *
     * Null is a real answer — "prefer not to say", or simply not asked yet —
     * and it selects the general guidance rather than a default sex.
     */
    subjectSex: text("subject_sex"),

    /**
     * How this person likes to be supported, when the member knows.
     *
     * A stable preference rather than an event, which is why it sits here:
     * "she'd rather have the dishes done than be asked how she's feeling" is
     * true across months, and asking it once beats inferring it never.
     */
    supportPreference: text("support_preference"),

    /** One of RhythmModel in rhythm.ts. Decides whether phases mean anything. */
    model: text("model").notNull().default("spontaneous_cycle"),

    /** Their usual cycle, when known. Null means "use the default of 28". */
    cycleLength: smallint("cycle_length"),
    periodLength: smallint("period_length"),

    /**
     * Null is not false. "We haven't asked" and "she says it's irregular" lead
     * to different confidence, and defaulting to regular would quietly upgrade
     * every unanswered case to the more confident language.
     */
    regular: boolean("regular"),

    /** Set instead of deleted, so the events stay readable if they come back. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_rhythm_subjects_owner").on(t.ownerUserId),
    /**
     * One self per member. A second would mean two disagreeing estimates on
     * the same screen, which is the specific bug this feature cannot survive.
     * Partial, so partners are unlimited.
     */
    uniqueIndex("uq_rhythm_subject_self")
      .on(t.ownerUserId)
      .where(sql`relation = 'self' AND archived_at IS NULL`),
  ],
);

export type RhythmSubject = typeof rhythmSubjects.$inferSelect;

/**
 * What can be recorded.
 *
 * Small on purpose. Every type here changes what the estimator returns; a type
 * that only decorates a timeline would be a field on something else.
 */
export const RHYTHM_EVENT_TYPES = [
  /** A period began on this date. The anchor everything is counted from. */
  "period_started",
  /** It ended. Sharpens the bleed window without which day 6 guesses. */
  "period_ended",
  /** Somebody stated the phase outright. Outranks any count for a week. */
  "phase_confirmed",
  /** "Today was hard" — no phase claimed, recorded so a pattern can emerge. */
  "note",
  /**
   * Something the member knows about this person's week: a brutal work
   * stretch, a bad night, travel, illness.
   *
   * This is the entire honest basis for saying anything specific about
   * somebody who doesn't have an account. Sakred holds the member's own sleep
   * and training; it holds nothing at all about their partner's, and a card
   * that says "he's coming off several high-output days" without one of these
   * rows is the app inventing a fact about a person it has never measured.
   *
   * So: with a context row, the guidance can be specific and is labelled as
   * coming from what the member entered. Without one, it falls back to asking
   * a better question.
   */
  "context_noted",
] as const;
export type RhythmEventType = (typeof RHYTHM_EVENT_TYPES)[number];

/**
 * The kinds of week somebody can be having.
 *
 * A closed list rather than free text because these select guidance. Free text
 * would mean a model reading it and improvising, which is exactly the
 * freestyling the curated-primitives rule exists to prevent — the note field
 * is still there for the member's own words, and nothing generates from it.
 */
export const RHYTHM_CONTEXT_KINDS = [
  "work_stress",
  "short_sleep",
  "training_hard",
  "travel",
  "illness",
  "big_event",
  "wants_space",
] as const;
export type RhythmContextKind = (typeof RHYTHM_CONTEXT_KINDS)[number];

/**
 * How long an entered context stays true.
 *
 * A hard work week is over by the following week, and a card still citing it
 * a fortnight later is worse than one that says nothing: it is confidently
 * stale, and the member can see it is wrong. Cycle events have their own,
 * longer staleness rules in rhythm.ts because a cycle is periodic and a bad
 * Tuesday is not.
 */
export const CONTEXT_FRESH_DAYS = 6;

export const rhythmEvents = pgTable(
  "rhythm_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    subjectId: uuid("subject_id").notNull(),

    /** One of RHYTHM_EVENT_TYPES. */
    type: text("type").notNull(),

    /** The member's own local date the event happened on — not entered on. */
    onDate: date("on_date").notNull(),

    /** Only for `phase_confirmed`. One of CYCLE_PHASES. */
    phase: text("phase"),

    /** Only for `context_noted`. One of RHYTHM_CONTEXT_KINDS. */
    contextKind: text("context_kind"),

    /**
     * One of RhythmProvenance in rhythm.ts.
     *
     * The load-bearing column. `self_reported` is the only value that earns
     * the word "confirmed" on screen; a man logging what he observed about his
     * partner is `member_entered`, and must never be shown to him as though
     * she said it.
     */
    provenance: text("provenance").notNull().default("member_entered"),

    note: text("note"),

    /** Who typed it. Kept separate from provenance — they differ constantly. */
    recordedByUserId: varchar("recorded_by_user_id").notNull(),

    /**
     * Corrections replace rather than delete, so "I got the date wrong" and
     * "that never happened" stay distinguishable.
     */
    supersededBy: uuid("superseded_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_rhythm_events_subject").on(t.subjectId, t.onDate),
    /**
     * The same event on the same day is the same event. Logging a period start
     * twice — which happens, because people tap twice — must not produce two
     * anchors that then disagree about which one to count from.
     */
    uniqueIndex("uq_rhythm_event_day").on(t.subjectId, t.type, t.onDate),
  ],
);

export type RhythmEvent = typeof rhythmEvents.$inferSelect;

// ─── What a route will accept ──────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export const rhythmSubjectSchema = z.object({
  relation: z.enum(RHYTHM_RELATIONS),
  label: z.string().trim().max(60).optional().nullable(),
  /** Asked, never inferred. Null selects general guidance, not a default sex. */
  subjectSex: z.enum(["male", "female"]).optional().nullable(),
  supportPreference: z
    .enum(["listening", "practical", "space", "company", "food", "unknown"])
    .optional()
    .nullable(),
  model: z
    .enum(["spontaneous_cycle", "hormonal_contraception", "irregular", "none"])
    .optional(),
  /**
   * The bounds match `estimatePhase`, which ignores anything outside them and
   * silently uses 28. Rejecting here means a member who types 90 finds out,
   * rather than wondering why their setting had no effect.
   */
  cycleLength: z.number().int().min(20).max(45).optional().nullable(),
  periodLength: z.number().int().min(1).max(10).optional().nullable(),
  regular: z.boolean().optional().nullable(),
});
export type RhythmSubjectInput = z.infer<typeof rhythmSubjectSchema>;

export const rhythmEventSchema = z
  .object({
    type: z.enum(RHYTHM_EVENT_TYPES),
    onDate: isoDate.optional(),
    phase: z.enum(CYCLE_PHASES).optional().nullable(),
    contextKind: z.enum(RHYTHM_CONTEXT_KINDS).optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((e) => e.type !== "phase_confirmed" || !!e.phase, {
    message: "Confirming a phase needs the phase.",
    path: ["phase"],
  })
  .refine((e) => e.type !== "context_noted" || !!e.contextKind, {
    message: "Say what kind of week it is.",
    path: ["contextKind"],
  });
export type RhythmEventInput = z.infer<typeof rhythmEventSchema>;
