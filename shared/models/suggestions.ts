/**
 * "Not today" and "not for me" — two different answers, one table.
 *
 * A recommendation a member cannot refuse is a demand, and the engine's whole
 * argument for offering three options rather than one is that the member holds
 * context we don't. Giving them no way to say "not that" quietly takes it back:
 * the same wrong suggestion returns every morning and the feature becomes
 * something to scroll past.
 *
 * The distinction the column shape encodes:
 *
 *   onDate set   — "not today". Cold plunge is fine in general, not this
 *                  morning. Gone by tomorrow, and nothing is learned from it,
 *                  because a busy Tuesday is not a preference.
 *   onDate null  — "not for me". A bad knee, no pool, no interest. Permanent
 *                  until they take it back, and it feeds `excluded` so the
 *                  category stops being generated at all.
 *
 * Storing only the second and treating every dismissal as permanent is the
 * tempting simplification and it is how a member ends up with four categories
 * left because they were busy four mornings in a row.
 */

import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, date, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { z } from "zod";

export const suggestionDismissals = pgTable(
  "suggestion_dismissals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),

    /** An EXERCISE_CATEGORIES id. Not validated here — see the route. */
    category: text("category").notNull(),

    /** The member's own local date, or null for "not for me, ever". */
    onDate: date("on_date"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    /**
     * Two partial indexes rather than one over a nullable column: in Postgres
     * NULLs are distinct, so a plain unique index would happily store the same
     * permanent dismissal a hundred times.
     */
    uniqueIndex("uq_suggestion_dismissal_day")
      .on(t.userId, t.category, t.onDate)
      .where(sql`on_date IS NOT NULL`),
    uniqueIndex("uq_suggestion_dismissal_forever")
      .on(t.userId, t.category)
      .where(sql`on_date IS NULL`),
    index("idx_suggestion_dismissals_user").on(t.userId),
  ],
);

export type SuggestionDismissal = typeof suggestionDismissals.$inferSelect;

export const dismissSchema = z.object({
  category: z.string().trim().min(1).max(60),
  /** `today` is the default because it is the less destructive of the two. */
  scope: z.enum(["today", "forever"]).default("today"),
});
export type DismissInput = z.infer<typeof dismissSchema>;
