/**
 * Authentication.
 *
 * Three things were wrong here and all three are fixed below. They are
 * documented at the point of the fix rather than listed, but in summary:
 *
 *   1. A malformed stored hash crashed the entire server process.
 *   2. Logging in did not change the session id, so a session could be fixed
 *      on a victim before they authenticated.
 *   3. Nothing limited password guessing.
 *
 * The hashing itself lives in `./password.ts` — separated so it can be tested
 * without opening a database connection, which is the reason it had no tests
 * and therefore the reason (1) shipped.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { storage } from "../storage.js";
import { isAuthenticated } from "./sessionAuth.js";
import { db } from "../db.js";
import { sql, inArray, eq, and, isNull } from "drizzle-orm";
import { loginAttempts, THROTTLE } from "../../shared/models/security.js";
import {
  users,
  authTokens,
  passwordResetTokens,
  RESET_TOKEN_TTL_MS,
  RESET_THROTTLE,
} from "../../shared/models/auth.js";
import { track, trackError } from "../telemetry/index.js";
import { z } from "zod";
import { hashPassword, verifyPassword, burnTime } from "./password.js";
import { issueToken, revokeToken, bearerFrom } from "./bearerAuth.js";
import { isAdult } from "./age.js";
import { send, APP_URL, logFallbackLink } from "../email/index.js";
import { passwordResetMail } from "../email/passwordReset.js";

// ─── What we accept ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  // 8 characters is the floor, not the goal. Length is the only property that
  // matters against an offline attack on a stolen hash, so there is no
  // composition rule and no low maximum — a passphrase should be allowed to
  // be one. The cap exists only so nobody can make us scrypt a megabyte.
  password: z.string().min(8, "Password must be at least 8 characters").max(1024),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  /**
   * Date of birth, checked and then discarded — see users.ageVerifiedAt.
   *
   * Validated on the server rather than trusted from the form. A client-side
   * check is a suggestion; this is the gate, and it is the reason the App
   * Store age-assurance answer is true rather than aspirational.
   */
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth as YYYY-MM-DD")
    .refine((value) => !Number.isNaN(Date.parse(value)), "That isn't a real date")
    .refine(isAdult, "You must be 18 or older to join"),
});

const forgotSchema = z.object({
  email: z.string().email("Valid email is required"),
});

const resetSchema = z.object({
  // The token is opaque and generated here; length is checked only so a blank
  // or truncated one fails before it costs a database round trip.
  token: z.string().min(20, "That reset link isn't valid"),
  // Identical rule to registration. A reset that accepted a weaker password
  // than signup would be the way around the signup rule.
  password: z.string().min(8, "Password must be at least 8 characters").max(1024),
});

/**
 * How a reset token is stored and looked up.
 *
 * SHA-256, not scrypt — see the note on authTokens in shared/models/auth.ts.
 * A 256-bit random value has no structure to guess, so the slow KDF that
 * protects a human-chosen password buys nothing here and would put a
 * deliberate delay on the lookup.
 */
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}


// ─── Throttling ────────────────────────────────────────────────────────────

function clientIp(req: Request): string {
  // `app.set("trust proxy", 1)` is set in sessionAuth, so req.ip already
  // reflects the last hop's X-Forwarded-For entry rather than Vercel's own
  // address. Reading the raw header instead would let a caller forge it.
  return req.ip ?? "unknown";
}

interface ThrottleState {
  locked: boolean;
  retryAfterSec: number;
}

/**
 * Is either counter currently locked? Reads only — never counts a check.
 *
 * `inArray`, not a raw `= ANY(${keys})`. The raw form looks equivalent and is
 * not: drizzle's `sql` template flattens a JavaScript array into one bind
 * parameter per element, so Postgres saw `= ANY($1, $2)` and refused with
 * *op ANY/ALL (array) requires array on right side*. That took every login
 * to a 500 in production. `inArray` expands the placeholders itself and gets
 * it right.
 */
async function throttleState(keys: string[]): Promise<ThrottleState> {
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(inArray(loginAttempts.identifier, keys));

  const now = Date.now();
  let worst = 0;
  for (const r of rows) {
    const until = r.lockedUntil ? new Date(r.lockedUntil).getTime() : 0;
    if (until > now) worst = Math.max(worst, until);
  }
  return { locked: worst > now, retryAfterSec: Math.ceil((worst - now) / 1000) };
}

/**
 * Record one failure against both keys.
 *
 * The whole decision happens inside the SQL statement rather than as
 * read-then-write in TypeScript, because concurrent guesses are the entire
 * point of the attack: two requests landing together would each read 4, each
 * write 5, and the counter would advance by one instead of two. `ON CONFLICT
 * DO UPDATE` makes the increment atomic per row, so parallel guessing gets an
 * attacker nothing.
 *
 * The window resets inside the same statement — a failure more than
 * `windowMs` after the window opened starts a fresh count rather than adding
 * to a stale one.
 */
async function recordFailure(email: string, ip: string): Promise<void> {
  const windowSec = Math.floor(THROTTLE.windowMs / 1000);
  const lockSec = Math.floor(THROTTLE.lockMs / 1000);

  // Every number here is either an argument to a function with a declared
  // signature or explicitly cast, and neither is decoration.
  //
  // node-postgres sends bind parameters without type OIDs and lets Postgres
  // infer them. Where both sides of an expression are parameters, there is
  // nothing to infer from and it settles on text — so
  // `(case … then $5 else $6 end)` came back as text and the comparison
  // against an integer count failed with *operator does not exist: integer >=
  // text*, taking every failed login to a 500 while successful ones worked
  // fine. `make_interval(secs => $n)` is safe for the opposite reason: the
  // function's signature declares the argument is an integer.
  //
  // This is invisible when the statement is tested with literals in place of
  // the parameters, which is how it got through the first time. The test that
  // catches it is PREPARE, which infers types exactly the way the driver
  // makes Postgres infer them.
  await db.execute(sql`
    insert into login_attempts (identifier, attempts, window_start, locked_until)
    values
      (${"email:" + email}, 1, now(), null),
      (${"ip:" + ip},       1, now(), null)
    on conflict (identifier) do update set
      attempts = case
        when login_attempts.window_start < now() - make_interval(secs => ${windowSec})
          then 1
        else login_attempts.attempts + 1
      end,
      window_start = case
        when login_attempts.window_start < now() - make_interval(secs => ${windowSec})
          then now()
        else login_attempts.window_start
      end,
      locked_until = case
        when (case
                when login_attempts.window_start < now() - make_interval(secs => ${windowSec})
                  then 1
                else login_attempts.attempts + 1
              end)
             >= (case when excluded.identifier like 'email:%'
                        then ${THROTTLE.emailMax}::int
                        else ${THROTTLE.ipMax}::int end)
          then now() + make_interval(secs => ${lockSec})
        else login_attempts.locked_until
      end
  `);
}

/** A correct password wipes the slate for that email. */
async function clearFailures(email: string): Promise<void> {
  await db.execute(
    sql`delete from login_attempts where identifier = ${"email:" + email}`,
  );
}

/**
 * Count one reset request, against the same table under its own key space.
 *
 * `reset-email:` and `reset-ip:`, deliberately distinct from the `email:` and
 * `ip:` keys login uses. Sharing them would mean a burst of reset requests
 * locked the member out of signing in with the password they already know —
 * turning a self-service recovery endpoint into a denial-of-service against
 * any address an attacker can name. Postgres `LIKE 'email:%'` does not match
 * `reset-email:…`, so the two limits stay independent by construction.
 *
 * The statement mirrors recordFailure exactly, including the explicit `::int`
 * casts. See the long note there: without them node-postgres infers `text` for
 * a parameter compared only against other parameters, and the whole thing
 * fails at runtime with *operator does not exist: integer >= text*.
 *
 * Unlike login there is no clear-on-success, because there is no success to
 * clear on: asking for a link is the whole interaction, and the limit should
 * count links sent rather than links clicked.
 */
async function recordResetRequest(email: string, ip: string): Promise<void> {
  const windowSec = Math.floor(RESET_THROTTLE.windowMs / 1000);
  const lockSec = Math.floor(RESET_THROTTLE.lockMs / 1000);

  await db.execute(sql`
    insert into login_attempts (identifier, attempts, window_start, locked_until)
    values
      (${"reset-email:" + email}, 1, now(), null),
      (${"reset-ip:" + ip},       1, now(), null)
    on conflict (identifier) do update set
      attempts = case
        when login_attempts.window_start < now() - make_interval(secs => ${windowSec})
          then 1
        else login_attempts.attempts + 1
      end,
      window_start = case
        when login_attempts.window_start < now() - make_interval(secs => ${windowSec})
          then now()
        else login_attempts.window_start
      end,
      locked_until = case
        when (case
                when login_attempts.window_start < now() - make_interval(secs => ${windowSec})
                  then 1
                else login_attempts.attempts + 1
              end)
             >= (case when excluded.identifier like 'reset-email:%'
                        then ${RESET_THROTTLE.emailMax}::int
                        else ${RESET_THROTTLE.ipMax}::int end)
          then now() + make_interval(secs => ${lockSec})
        else login_attempts.locked_until
      end
  `);
}

/**
 * Swap the session id, then store the user on the new one.
 *
 * Without this, `req.session.userId = user.id` promoted whatever session id
 * the browser arrived with — including one an attacker planted, since
 * `saveUninitialized: false` still honours a supplied cookie once the session
 * is written to. Regenerating means the id that ends up authenticated is one
 * only the server has seen.
 *
 * `save()` afterwards is not optional: the response sets the cookie, and
 * without an explicit save there is a window where the client holds a session
 * id the store does not yet know about.
 */
async function establishSession(req: Request, userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
  req.session.userId = userId;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
}

/**
 * Which native shell is calling, if any.
 *
 * The app sends `X-Client-Platform: ios | android`; browsers send nothing.
 * Only these two values are honoured, so the header cannot be used to smuggle
 * anything into the token row.
 *
 * Note that the session is still established for native callers even though
 * they cannot hold the cookie. Branching the session logic on a client-
 * supplied header would put a spoofable value in the middle of the one code
 * path that must not have one — a wasted Set-Cookie is the cheaper mistake.
 */
function nativePlatform(req: Request): string | null {
  const raw = req.headers["x-client-platform"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "ios" || value === "android" ? value : null;
}

// ─── Routes ────────────────────────────────────────────────────────────────

export function registerAuthRoutes(app: Express): void {
  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.parse(req.body);
      // Addresses are case-insensitive in practice, so the counter has to be
      // too — otherwise Foo@x.com and foo@x.com are five free guesses each.
      const email = parsed.email.toLowerCase();
      const ip = clientIp(req);

      const state = await throttleState([`email:${email}`, `ip:${ip}`]);
      if (state.locked) {
        res.setHeader("Retry-After", String(state.retryAfterSec));
        track("auth.throttled", { surface: "login", props: { minutes: Math.ceil(state.retryAfterSec / 60) } });
        return res.status(429).json({
          message: `Too many attempts. Try again in ${Math.max(1, Math.ceil(state.retryAfterSec / 60))} minutes.`,
        });
      }

      const user = await storage.getUserByEmail(email);

      // Same branch, same cost, same message whether the account exists or
      // the password is wrong.
      if (!user || !user.password || !(await verifyPassword(parsed.password, user.password))) {
        if (!user || !user.password) await burnTime(parsed.password);
        await recordFailure(email, ip);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      await clearFailures(email);
      await establishSession(req, user.id);

      track("auth.login", { userId: user.id, surface: "login" });

      const platform = nativePlatform(req);
      const token = platform ? await issueToken(user.id, platform) : null;

      const { password: _, ...safeUser } = user;
      // `token` is present only for native callers, so the web response shape
      // is byte-for-byte what it was.
      res.json(token ? { ...safeUser, token } : safeUser);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(error) });
      }
      trackError("auth.login", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.parse(req.body);
      const email = parsed.email.toLowerCase();

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const hashedPassword = await hashPassword(parsed.password);
      const user = await storage.upsertUser({
        email,
        password: hashedPassword,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        // The date itself is deliberately not stored — parsed.dateOfBirth
        // goes out of scope here and only the fact of the check survives.
        ageVerifiedAt: new Date(),
      });

      // Registration authenticates, so it fixes a session exactly the same
      // way login does and needs the same treatment.
      await establishSession(req, user.id);

      track("auth.register", { userId: user.id, surface: "register" });

      const platform = nativePlatform(req);
      const token = platform ? await issueToken(user.id, platform) : null;

      const { password: _, ...safeUser } = user;
      res.status(201).json(token ? { ...safeUser, token } : safeUser);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(error) });
      }
      trackError("auth.register", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/logout", async (req: Request, res: Response) => {
    // Destroying the session does nothing for a native caller — its
    // credential is the bearer token, and leaving it live would mean "log
    // out" signed the member out of a browser they were never using while the
    // phone stayed authenticated for another ninety days.
    const raw = bearerFrom(req.headers.authorization);
    if (raw) await revokeToken(raw);

    req.session.destroy((err: Error | null) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      // Destroying the session leaves the cookie in the browser pointing at a
      // store entry that no longer exists. Clearing it too means the next
      // request arrives clean instead of with a dead id.
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });

  // ─── Password reset ──────────────────────────────────────────────────────

  /**
   * Ask for a link.
   *
   * Always 200, always the same body, whether or not the address belongs to an
   * account. The alternative — "no account with that email" — turns this into
   * a membership oracle: type an address, learn whether that person is a
   * client. For a private membership whose value is partly discretion, that
   * leak is worse than the inconvenience of a member mistyping their address
   * and waiting for an email that never comes.
   *
   * Timing is not a perfect tell-nothing here: a real address costs one insert
   * and one HTTPS call to the mail provider, an unknown one costs neither, and
   * a determined observer could measure that. The throttle below is what
   * actually makes enumeration impractical — five attempts per address per
   * hour is not a rate you can walk a list at — and network jitter on the mail
   * call is larger than the signal in any case. Worth knowing rather than
   * worth pretending otherwise.
   */
  app.post("/api/forgot-password", async (req: Request, res: Response) => {
    // One body for every outcome, constructed once so no branch can drift.
    const ok = () =>
      res.json({
        message: "If that address belongs to an account, a reset link is on its way.",
      });

    try {
      const parsed = forgotSchema.parse(req.body);
      const email = parsed.email.toLowerCase();
      const ip = clientIp(req);

      const state = await throttleState([`reset-email:${email}`, `reset-ip:${ip}`]);
      if (state.locked) {
        // 429 rather than a silent 200. Unlike existence, "you have asked a
        // lot recently" is something the person in front of the screen already
        // knows, and swallowing it means they keep clicking and keep waiting.
        res.setHeader("Retry-After", String(state.retryAfterSec));
        return res.status(429).json({
          message: `Too many reset requests. Try again in ${Math.max(
            1,
            Math.ceil(state.retryAfterSec / 60),
          )} minutes.`,
        });
      }
      await recordResetRequest(email, ip);

      const user = await storage.getUserByEmail(email);
      // No account, or an account with no password at all (an invited row that
      // has never been claimed): nothing to reset, and nothing to say about it.
      if (!user || !user.password) {
        track("auth.reset.requested", { surface: "forgot", props: { known: false } });
        return ok();
      }

      // Outstanding links for this account stop working the moment a new one
      // is asked for. Someone who requests three because the first seemed slow
      // should not leave three live credentials in their inbox.
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

      const raw = crypto.randomBytes(32).toString("base64url");
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });

      const url = `${APP_URL}/reset-password?token=${encodeURIComponent(raw)}`;
      const result = await send(
        passwordResetMail({
          to: email,
          firstName: user.firstName,
          url,
          expiresMinutes: Math.round(RESET_TOKEN_TTL_MS / 60000),
        }),
      );

      if (!result.sent) {
        // The member still gets the same 200. A mail provider that is down or
        // unconfigured is our problem, and telling them "we could not send it"
        // gives them nothing to do about it — while telling them that only for
        // real accounts would hand back the oracle the generic response exists
        // to close.
        logFallbackLink(`password reset for ${email}`, url);
        trackError("auth.reset.send", new Error(result.reason ?? "unknown"));
      }

      // The provider's id is worth keeping. "Accepted by Resend" and
      // "arrived in a mailbox" are different claims, and without the id the
      // only way to tell them apart afterwards is to guess — which cost an
      // afternoon the first time, when a reset was accepted, sent, and
      // bounced because the recipient's domain had no MX record at all.
      track("auth.reset.requested", {
        userId: user.id,
        surface: "forgot",
        props: { known: true, sent: result.sent, providerId: result.id ?? null },
      });
      return ok();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(error) });
      }
      trackError("auth.reset.request", error);
      // Even the failure path stays generic — a 500 on real addresses and a
      // 200 on unknown ones would be the same leak by another route.
      return ok();
    }
  });

  /**
   * Redeem a link and set the new password.
   *
   * Everything that could still be holding the old credential is torn down
   * here, because the reason people reset passwords is that they think someone
   * else has one. A reset that leaves the attacker's phone signed in has done
   * nothing.
   */
  app.post("/api/reset-password", async (req: Request, res: Response) => {
    try {
      const parsed = resetSchema.parse(req.body);

      const [row] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, hashToken(parsed.token)))
        .limit(1);

      // Unknown, spent and expired are three different states and the member
      // gets told which. There is nothing to protect: possession of the token
      // is the secret, and someone holding a token already knows it existed.
      // "Invalid link" for an hour-old link sends people back to their inbox
      // to click it again, forever.
      if (!row) {
        return res.status(400).json({ message: "That reset link isn't valid. Ask for a new one." });
      }
      if (row.usedAt) {
        return res
          .status(400)
          .json({ message: "That link has already been used. Ask for a new one." });
      }
      if (new Date(row.expiresAt).getTime() <= Date.now()) {
        return res.status(400).json({ message: "That link has expired. Ask for a new one." });
      }

      const user = await storage.getUser(row.userId);
      if (!user) {
        return res.status(400).json({ message: "That reset link isn't valid. Ask for a new one." });
      }

      const hashed = await hashPassword(parsed.password);
      await db
        .update(users)
        .set({ password: hashed, updatedAt: new Date() })
        .where(eq(users.id, row.userId));

      // Spend the token before anything else can fail. Marked rather than
      // deleted so a second submission of the same form — a double tap, a
      // retried request — reads as "already used" rather than "invalid".
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, row.id));

      // Any other outstanding link for this account is now dead weight.
      await db
        .delete(passwordResetTokens)
        .where(and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.usedAt)));

      // Every native device is signed out. The bearer token is a ninety-day
      // credential that a password change would otherwise leave completely
      // untouched — which is the exact failure this endpoint exists to fix.
      await db.delete(authTokens).where(eq(authTokens.userId, row.userId));

      // And every browser session. connect-pg-simple stores the session body
      // as jsonb, so the user id is reachable without loading the store.
      await db.execute(
        sql`delete from sessions where sess->>'userId' = ${row.userId}`,
      );

      // Someone who locked themselves out guessing, then reset, should be able
      // to sign in immediately rather than serve out the remaining lockout on
      // a password that no longer exists.
      if (user.email) await clearFailures(user.email.toLowerCase());

      track("auth.reset.completed", { userId: row.userId, surface: "reset" });
      res.json({ message: "Password updated. Sign in with your new password." });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(error) });
      }
      trackError("auth.reset.complete", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
