/**
 * A photograph a member took of their own body, and who is allowed to see it.
 *
 * ── Why this is not "a Room photo with a flag" ────────────────────────────
 *
 * Because the two are different objects that happen to be the same file
 * format. A Room photo is a thing somebody chose to show people. A progress
 * photo is a thing somebody took *instead* of showing people — the whole point
 * is that it is theirs, kept over months, and readable by at most one other
 * person who is professionally responsible for their training.
 *
 * Modelling that as a boolean on a shared table means every query that forgets
 * the `WHERE` publishes a body. Modelling it as its own table with its own
 * routes means forgetting is a compile error, and the default for a new reader
 * is no access rather than all of it.
 *
 * ── Who sees one ──────────────────────────────────────────────────────────
 *
 *   the member                    yes
 *   their active assigned coach   yes
 *   a former coach                no
 *   another coach                 no
 *   another member                no
 *   an admin                      no
 *
 * The last line is the one worth saying out loud. `superviseCoaching` is the
 * capability that lets an operator run the coaching programme — reassign a
 * coach, unstick a conversation — and everywhere else in this codebase it
 * doubles as read access to coaching data. Here it does not. Supervising who
 * coaches whom is not a reason to look at somebody undressed, and an admin who
 * genuinely needs to would be asking the member, not the database.
 *
 * Every refusal is a 404, never a 403. "There is a photo here you may not see"
 * is itself information about somebody's body.
 *
 * ── Sharing one is a separate act ─────────────────────────────────────────
 *
 * A member may post a progress photo to the Room. That does not move this row
 * or change its visibility — it creates a *new* asset with `purpose: "room"`,
 * because a decision to show one photograph to a channel is not a decision to
 * show the channel a timeline.
 */

import { sql } from "drizzle-orm";
import { pgTable, varchar, text, uuid, date, timestamp, index } from "drizzle-orm/pg-core";
import { z } from "zod";

export const progressPhotos = pgTable(
  "progress_photos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),

    /** The image itself, in `media_assets` with `purpose = 'progress'`. */
    assetId: uuid("asset_id").notNull(),

    /**
     * The member's own date, from `memberToday()`.
     *
     * A timeline read in the member's timezone is the only one that makes
     * sense — a photo taken at eleven at night is that day's photo, not
     * tomorrow's because the server is in UTC.
     */
    onDate: date("on_date").notNull(),

    /** Their words about it, if any. Shown to their coach with the photo. */
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_progress_photos_user_date").on(t.userId, t.onDate)],
);

export type ProgressPhoto = typeof progressPhotos.$inferSelect;

export const createProgressPhotoSchema = z.object({
  assetId: z.string().uuid(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(1000).optional(),
});
