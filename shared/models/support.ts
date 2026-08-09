import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Support requests, from /support.
 *
 * Both stores require a support URL that a reviewer can open without an
 * account, so the page behind it — and therefore this endpoint — is public.
 * That is a deliberate exception to the rule stated in ErrorBoundary: an
 * unauthenticated write endpoint is a real thing to open, and it is why
 * server/support/routes.ts throttles by IP through the existing
 * `login_attempts` counter rather than trusting the form.
 *
 * `userId` is nullable on purpose. A member who cannot sign in is precisely
 * the person most likely to need support, so the form must work signed out —
 * but when we do know who they are, the request should be attached to them.
 */
export const supportRequests = pgTable(
  "support_requests",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    /** Null when submitted signed-out. */
    userId: varchar("user_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** 'account' | 'billing' | 'technical' | 'protocol' | 'privacy' | 'other' */
    category: text("category").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    /** 'open' | 'answered' | 'closed' */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("IDX_support_requests_status").on(table.status),
    index("IDX_support_requests_user").on(table.userId),
  ]
);

export type SupportRequest = typeof supportRequests.$inferSelect;

/** Kept in one place so the form, the zod schema and the admin filter agree. */
export const SUPPORT_CATEGORIES = [
  "account",
  "billing",
  "technical",
  "protocol",
  "privacy",
  "other",
] as const;
