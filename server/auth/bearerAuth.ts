/**
 * Bearer-token authentication, for the iOS and Android shells only.
 *
 * The web app keeps its session cookie and is untouched by any of this. The
 * native builds cannot use it: Capacitor serves the bundled client from
 * `https://localhost` / `capacitor://localhost`, so every /api call is
 * cross-site. `sameSite: "lax"` withholds the cookie by definition, and
 * relaxing it to `none` only moves the problem — WebKit's tracking prevention
 * discards it on iOS regardless. A header is the only thing that survives
 * both platforms.
 *
 * ── How this reaches the existing routes ──────────────────────────────────
 *
 * Twenty-seven handlers read `req.session.userId`. Rather than rewrite them
 * all — and collide with whatever is in flight in coaching/routes.ts — this
 * middleware defines that same property on the session object when a valid
 * token is presented.
 *
 * The property is deliberately **non-enumerable**. express-session decides
 * whether to persist by hashing `JSON.stringify(session)`, and stringify
 * skips non-enumerable properties, so the session looks untouched: no row is
 * written to the sessions table, and no Set-Cookie goes back. Without that
 * detail every authenticated native request would create a junk session row
 * and hand the app a cookie it can neither store nor send.
 */

import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { authTokens } from "../../shared/models/auth.js";

/**
 * Ninety days, and revocable at any point before that.
 *
 * Longer than the week-long web session on purpose: a phone that signs itself
 * out every seven days trains members to distrust the app, and unlike a
 * cookie this token is revocable server-side the moment a device is lost.
 */
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Only refresh lastUsedAt once a day — it is for pruning, not analytics. */
const LAST_USED_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * SHA-256, not scrypt, and that is not an oversight.
 *
 * A password needs a slow KDF because it is low-entropy and guessable. This
 * token is 256 bits from a CSPRNG — there is nothing to guess, so the only
 * property required of the hash is that it be one-way, and the fast one is
 * correct given this runs on every authenticated request.
 */
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Mint a device token. The raw value is returned once and never stored. */
export async function issueToken(userId: string, platform: string | null): Promise<string> {
  const raw = crypto.randomBytes(32).toString("base64url");
  await db.insert(authTokens).values({
    userId,
    tokenHash: hashToken(raw),
    platform,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  return raw;
}

/** Sign one device out. Unknown tokens are a no-op, by design. */
export async function revokeToken(raw: string): Promise<void> {
  await db.delete(authTokens).where(eq(authTokens.tokenHash, hashToken(raw)));
}

/** Read a Bearer credential off the request, if there is one. */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const value = rest.join(" ").trim();
  return value.length > 0 ? value : null;
}

export const bearerAuth: RequestHandler = async (req, _res, next) => {
  // A cookie session, where one exists, always wins. This middleware only
  // fills a gap; it must never override or downgrade an existing login.
  if (!req.session || req.session.userId) return next();

  const raw = bearerFrom(req.headers.authorization);
  if (!raw) return next();

  try {
    const [row] = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.tokenHash, hashToken(raw)))
      .limit(1);

    // Falling through to next() rather than 401ing is intentional: rejecting
    // here would mean an expired token produced a different failure than a
    // missing one. Both should arrive at the same `isAuthenticated` 401.
    if (!row) return next();

    if (!row.expiresAt || row.expiresAt.getTime() <= Date.now()) {
      await db.delete(authTokens).where(eq(authTokens.id, row.id));
      return next();
    }

    // Non-enumerable — see the note at the top of this file. Removing that
    // flag silently reintroduces a per-request session write.
    Object.defineProperty(req.session, "userId", {
      value: row.userId,
      enumerable: false,
      configurable: true,
      writable: true,
    });

    const lastUsed = row.lastUsedAt?.getTime() ?? 0;
    if (Date.now() - lastUsed > LAST_USED_REFRESH_MS) {
      // Not awaited: this is housekeeping, and making every authenticated
      // request wait on a write to record that it happened is a poor trade.
      void db
        .update(authTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(authTokens.id, row.id))
        .catch(() => {});
    }
  } catch {
    // A database blip must not turn into a 500 on every route. Unauthenticated
    // is the safe outcome, and isAuthenticated will produce the 401.
  }

  next();
};
