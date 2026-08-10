/**
 * The handle the model knows a member by.
 *
 * The daily note used to be written from a prompt containing `Name: Nick`
 * alongside that member's protocol, their intention and — now — their sleep and
 * heart data. That is a named person's health information leaving our
 * infrastructure on every generation, to a third-party inference endpoint, for
 * no benefit beyond the model occasionally saying the name out loud.
 *
 * So the prompt carries a ref instead. The model can still personalise: the ref
 * is stable, so a member is the same member across days, and everything that
 * actually informs the writing — their protocol, their phase, their numbers —
 * is still there. Only the identity is gone.
 *
 * WHY AN HMAC AND NOT THE USER ID ITSELF, which is what one would reach for
 * first: the user id is a join key. It appears in every one of our tables next
 * to the member's name and email, so anyone holding both a prompt log and a
 * database dump could re-identify every note trivially. An HMAC under a secret
 * we hold breaks that join — the prompt log becomes useless on its own.
 *
 * What this does NOT do, stated plainly so nobody over-trusts it: it is not
 * anonymisation. We can always reverse it by recomputing the ref for a known
 * user, which is exactly what makes it useful for support. It narrows who can
 * re-identify from "anyone with either artifact" to "us".
 */

import { createHmac, createHash } from "node:crypto";

/**
 * A dedicated secret if one is set, otherwise the session secret.
 *
 * Reusing SESSION_SECRET is deliberate rather than lazy: it already exists in
 * every environment, so the fallback cannot leave production computing refs
 * under a hard-coded default that offers no protection at all. It is read once
 * — the value must never be logged, and a function that re-reads it invites a
 * debug line that prints it.
 */
const SECRET =
  process.env.MEMBER_REF_SECRET ||
  process.env.SESSION_SECRET ||
  // Development only. A stable, obviously-not-secret value so local runs are
  // reproducible; anything reaching a real model uses one of the two above.
  "sakred-dev-member-ref";

/**
 * Ten hex characters, prefixed.
 *
 * Short enough that the model treats it as a label rather than trying to read
 * meaning into it, long enough that refs do not collide across a membership
 * many orders of magnitude larger than this one.
 */
export function memberRef(userId: string): string {
  const digest = createHmac("sha256", SECRET).update(userId).digest("hex");
  return `m-${digest.slice(0, 10)}`;
}

/**
 * Whether the ref secret is a real one.
 *
 * Used by the startup check so "we shipped with the development fallback" is
 * something the logs say once, rather than something nobody discovers.
 */
export function memberRefSecretIsWeak(): boolean {
  return !process.env.MEMBER_REF_SECRET && !process.env.SESSION_SECRET;
}

/**
 * A fingerprint of the secret, safe to log.
 *
 * Six characters of a hash of the secret — enough to tell two environments
 * apart when refs unexpectedly differ, and not enough to be the secret.
 */
export function memberRefFingerprint(): string {
  return createHash("sha256").update(SECRET).digest("hex").slice(0, 6);
}
