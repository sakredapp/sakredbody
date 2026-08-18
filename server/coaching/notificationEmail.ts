/**
 * Where a coach's client alerts go, and proving they can read it first.
 *
 * ── The rule, in one line ─────────────────────────────────────────────────
 *
 *     verified coach_notification_email  ??  account email
 *
 * Both halves matter. Without the override, a coach's work alerts arrive at
 * whatever personal address they happened to register with. Without the
 * verification, a typo in a preferences form redirects a client's health
 * context to a stranger — a disclosure decided by a keystroke.
 *
 * ── What the coach sees while it is pending ───────────────────────────────
 *
 * Both addresses, and which one is live. "Pending verification: coach@… ·
 * Alerts are still going to personal@…" is the whole of the honesty here: a
 * form that accepted the new address and said nothing else would leave
 * somebody believing their alerts had moved when they had not.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db.js";
import { emailVerificationTokens, users } from "../../shared/schema.js";
import { EMAIL_VERIFICATION_TTL_MS } from "../../shared/models/auth.js";
import { APP_URL, emailConfigured, logFallbackLink, send } from "../email/index.js";

const PURPOSE = "coach_notification";

/**
 * The address this coach's alerts should actually be sent to.
 *
 * The one function anything sending coaching mail should call. It returns the
 * override only when it has been verified, so a caller cannot accidentally use
 * a pending address by reading the column directly.
 */
export async function coachNotificationEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({
      email: users.email,
      override: users.coachNotificationEmail,
      verifiedAt: users.coachNotificationEmailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  if (row.override && row.verifiedAt) return row.override;
  return row.email ?? null;
}

/** What the coach's own settings screen needs to describe the current state. */
export async function notificationDestination(userId: string) {
  const [row] = await db
    .select({
      email: users.email,
      override: users.coachNotificationEmail,
      verifiedAt: users.coachNotificationEmailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;

  const verified = !!(row.override && row.verifiedAt);
  return {
    accountEmail: row.email ?? null,
    override: row.override ?? null,
    verified,
    /** The address alerts go to right now. Never the pending one. */
    deliveringTo: verified ? row.override : row.email ?? null,
  };
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Record a new destination and send it a confirmation link.
 *
 * The old verification is cleared in the same statement that writes the new
 * address, so there is no moment where a freshly-typed address inherits the
 * previous one's verified status. Until the link is opened, alerts keep going
 * to the account email.
 */
export async function requestNotificationEmail(
  userId: string,
  email: string,
  firstName: string | null,
): Promise<{ sent: boolean }> {
  const normalized = email.trim().toLowerCase();

  await db
    .update(users)
    .set({ coachNotificationEmail: normalized, coachNotificationEmailVerifiedAt: null })
    .where(eq(users.id, userId));

  const token = randomBytes(32).toString("base64url");
  await db.insert(emailVerificationTokens).values({
    userId,
    purpose: PURPOSE,
    email: normalized,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });

  const url = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;

  if (!emailConfigured()) {
    /*
      Rather than failing. Email is not configured in every environment, and a
      coach who cannot confirm an address is stuck with no way forward; the
      link in the log is what an operator hands them. It is a URL, not a
      credential to anything but this one confirmation.
    */
    logFallbackLink("coach notification email", url);
    return { sent: false };
  }

  const lines = [
    firstName ? `${firstName},` : "Hello,",
    "",
    "You asked for your Sakred coaching alerts to be sent to this address.",
    "Open this link to confirm it:",
    "",
    url,
    "",
    "Until you do, your alerts keep going to your account email.",
    "",
    "If this wasn't you, ignore this — nothing has changed.",
    "",
    "— Sakred Body",
  ];

  /*
    Deliberately plain. The password-reset mail is a full HTML document because
    it is the one email a stranger might have to trust; this one goes to
    somebody already signed in who just pressed a button, and a paragraph with
    a link in it is both enough and less likely to be mangled by a work mail
    client.
  */
  const result = await send({
    to: normalized,
    subject: "Confirm where your Sakred coaching alerts go",
    text: lines.join("\n"),
    html: lines
      .map((line) => (line === url ? `<p><a href="${url}">${url}</a></p>` : `<p>${line || "&nbsp;"}</p>`))
      .join(""),
  });

  return { sent: result.sent };
}

/**
 * Redeem a confirmation link.
 *
 * The address is taken from the token row rather than from the user row, so a
 * link cannot confirm an address the coach has changed since it was sent — the
 * verification is only applied if the two still agree.
 */
export async function confirmNotificationEmail(
  token: string,
): Promise<"confirmed" | "already" | "invalid"> {
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.tokenHash, hash(token)), eq(emailVerificationTokens.purpose, PURPOSE)))
    .limit(1);

  if (!row) return "invalid";
  if (row.usedAt) return "already";
  if (row.expiresAt.getTime() < Date.now()) return "invalid";

  const [user] = await db
    .select({ override: users.coachNotificationEmail })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  /* They changed their mind after the link was sent. The link is spent, and
     nothing is verified — confirming a stale address would silently route
     alerts somewhere they no longer asked for. */
  if (!user || user.override !== row.email) {
    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, row.id));
    return "invalid";
  }

  await db
    .update(users)
    .set({ coachNotificationEmailVerifiedAt: new Date() })
    .where(eq(users.id, row.userId));

  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, row.id));

  return "confirmed";
}

/** Drop the override and go back to the account email. */
export async function clearNotificationEmail(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ coachNotificationEmail: null, coachNotificationEmailVerifiedAt: null })
    .where(eq(users.id, userId));
}

/** Whether a pending, unexpired confirmation is outstanding. */
export async function hasPendingVerification(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: emailVerificationTokens.id })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        eq(emailVerificationTokens.purpose, PURPOSE),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return !!row;
}
