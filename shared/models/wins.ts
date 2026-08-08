/**
 * Wins — the thing you finished.
 *
 * Finishing a 28-day cleanse is the single most meaningful event in this
 * product, and until now it produced nothing: no record, no acknowledgement,
 * nothing to show anyone. A streak counter that silently ticks is not the
 * same as being told you did it.
 *
 * ── Earned, not computed ──────────────────────────────────────────────────
 *
 * A win is a **row**, written once, at the moment it is earned. It is not
 * derived on read from the habit table.
 *
 * That matters because the inputs move. Habits get removed, routines get
 * abandoned, a template gets renamed. If "you completed the Liver Reset" were
 * recomputed on every page load, it could stop being true — and a member being
 * un-congratulated is worse than never being congratulated. The row is the
 * memory, and `props` snapshots what it was about so it still reads correctly
 * after the protocol behind it is edited or deleted.
 *
 * ── Sharing ───────────────────────────────────────────────────────────────
 *
 * A win can be posted to the community, which is the only place bragging is
 * welcome here. `sharedMessageId` records where it went, so it can't be posted
 * twice and so the card can link to the conversation it started.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── Kinds ─────────────────────────────────────────────────────────────────

export const winKindEnum = z.enum([
  /** Finished a protocol, start to end. The big one. */
  "routine_complete",
  /** Hit a streak milestone — 7, 14, 30 days and up. */
  "streak",
  /** Every scheduled habit done, seven days running. */
  "perfect_week",
  /** First habit ever ticked. Small, and worth marking. */
  "first_step",
  /** Attended a retreat, mastermind or talk to its end. */
  "offering_complete",
]);

export type WinKind = z.infer<typeof winKindEnum>;

/**
 * The streak lengths worth stopping for.
 *
 * Sparse on purpose and widening as it goes: a milestone every day is
 * wallpaper, and the gap between them should grow as the achievement does.
 */
export const STREAK_MILESTONES = [7, 14, 21, 30, 60, 90, 180, 365] as const;

/**
 * Which image backs each kind of win when it's exported.
 *
 * Real photographs already in the repo rather than generated gradients — this
 * card is going on someone's story, and it has to look like the brand rather
 * than like a screenshot of an app.
 */
export const WIN_IMAGES: Record<WinKind, string> = {
  routine_complete: "/images/cliffs-sea.jpg",
  streak: "/images/retreat-mountain.jpg",
  perfect_week: "/images/hero-ocean.jpg",
  first_step: "/images/retreat-jungle.jpg",
  offering_complete: "/images/gathering-string-lights.jpg",
};

// ─── The table ─────────────────────────────────────────────────────────────

export const wins = pgTable(
  "wins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),

    kind: text("kind").notNull(),

    /**
     * What the member reads. Written at award time and never recomputed, so a
     * protocol that is later renamed or deleted doesn't rewrite somebody's
     * history.
     */
    title: text("title").notNull(),
    subtitle: text("subtitle"),

    /**
     * What it was about — a `user_routines` id, an offering id, or the streak
     * length as text. Not a foreign key, for the same reason events aren't:
     * the win survives the thing it was about.
     */
    subjectId: text("subject_id"),

    /** Snapshot: days, routine name, streak length. Enough to redraw the card. */
    props: jsonb("props").$type<Record<string, unknown>>().default({}),

    earnedAt: timestamp("earned_at", { withTimezone: true }).defaultNow(),
    /** The member's own calendar date, so "8 August" is their 8 August. */
    onDate: text("on_date"),

    /** Set when posted to the community. */
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    sharedMessageId: uuid("shared_message_id"),
  },
  (t) => [
    index("idx_wins_user").on(t.userId, t.earnedAt),
    /**
     * A win is earned once. The award path runs on every habit toggle, so
     * without this a member ticking a box on day 30 would collect the same
     * milestone repeatedly. `ON CONFLICT DO NOTHING` against this index is
     * what makes that path safe to call as often as it likes.
     *
     * ⚠ The live index is `NULLS NOT DISTINCT` — see supabase/wins.sql. Drizzle
     * cannot express that yet, so this declaration is a slight lie and the
     * migration is the truth. It matters: `first_step` has a null subject, and
     * under Postgres's default NULLs-are-distinct rule this index would never
     * catch it, so every habit toggle would award another "The first one"
     * forever. If this table is ever recreated from the Drizzle definition
     * rather than the SQL file, re-apply the index by hand.
     */
    uniqueIndex("uq_wins").on(t.userId, t.kind, t.subjectId),
  ]
);

export type Win = typeof wins.$inferSelect;

export const shareWinSchema = z.object({
  /** Optional — the member's own words above the card. */
  message: z.string().max(2000).optional(),
  channelId: z.string().uuid().optional(),
});

// ─── Copy ──────────────────────────────────────────────────────────────────

/**
 * How a win reads.
 *
 * Kept here rather than in the component so the server, the share text and the
 * exported image all say the same thing — three places drifting apart is how
 * a card ends up congratulating someone for something the app called something
 * else.
 */
export function winHeadline(kind: WinKind, props: Record<string, unknown>): string {
  switch (kind) {
    case "routine_complete":
      return String(props.routineName ?? "The protocol");
    case "streak":
      return `${props.days ?? 0} days unbroken`;
    case "perfect_week":
      return "A perfect week";
    case "first_step":
      return "The first one";
    case "offering_complete":
      return String(props.offeringName ?? "Gathered");
  }
}

export function winCaption(kind: WinKind, props: Record<string, unknown>): string {
  switch (kind) {
    case "routine_complete": {
      const days = Number(props.days ?? 0);
      return days ? `${days} days, complete` : "Complete";
    }
    case "streak":
      return "Every day, without missing one";
    case "perfect_week":
      return "Seven days, everything done";
    case "first_step":
      return "The first habit is the hardest";
    case "offering_complete":
      return "Attended";
  }
}
