/**
 * Login throttling.
 *
 * `/api/login` had nothing in front of it. Any address on the internet could
 * guess passwords against a known email as fast as the network allowed, and
 * the only cost to the attacker was one scrypt call per try — which we pay,
 * not them. For a product whose members are high-net-worth individuals whose
 * email addresses are publicly guessable, that is the single cheapest attack
 * available against it.
 *
 * ── Why a table and not memory ────────────────────────────────────────────
 *
 * The usual answer is `express-rate-limit`, which counts in process memory.
 * This app runs on Vercel Functions: instances come and go, and several serve
 * traffic at once. A memory counter would reset on every cold start and would
 * be one counter per instance, so the real limit is "N attempts × however many
 * instances happen to exist" — which is not a limit. Postgres is the only
 * thing all instances agree on, so the counter lives there.
 *
 * Login is a low-volume endpoint; one upsert per failed attempt is affordable.
 * Successful logins clear the row rather than writing to it.
 *
 * ── Two keys, not one ─────────────────────────────────────────────────────
 *
 * Counted per `email:<address>` and per `ip:<address>` independently.
 *
 *   - Email alone lets a botnet hammer one account from many addresses.
 *   - IP alone lets one address spray many accounts, and punishes everybody
 *     behind a corporate NAT when one person forgets their password.
 *
 * Either counter tripping is enough to refuse, so both attacks cost the same.
 * The IP allowance is deliberately looser, because an IP is shared and an
 * email is not.
 */

import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const loginAttempts = pgTable(
  "login_attempts",
  {
    /** `email:someone@example.com` or `ip:203.0.113.4`. */
    identifier: text("identifier").primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    /** Start of the current counting window; failures outside it don't count. */
    windowStart: timestamp("window_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set once the limit trips. Null means not currently locked. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => ({
    // Lets the sweeper find expired rows without a sequential scan.
    lockedIdx: index("idx_login_attempts_locked").on(t.lockedUntil),
  }),
);

export type LoginAttempt = typeof loginAttempts.$inferSelect;

/**
 * How much guessing is allowed before the door closes.
 *
 * Five is low enough to stop guessing and high enough that a person typing
 * the wrong password from memory doesn't get locked out of their own retreat
 * booking. The lockout is minutes, not hours, for the same reason — the point
 * is to make the attack too slow to be worth running, not to punish.
 */
export const THROTTLE = {
  /** Failures allowed per email before lockout. */
  emailMax: 5,
  /** Failures allowed per IP — looser, because addresses are shared. */
  ipMax: 20,
  /** Failures older than this stop counting. */
  windowMs: 15 * 60 * 1000,
  /** How long the door stays shut once the limit trips. */
  lockMs: 15 * 60 * 1000,
} as const;
