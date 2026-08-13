/**
 * Who may be in a coaching conversation — the decision, with nothing attached.
 *
 * Pure, for the same reason `habitAccess.ts` is pure: the server-side version
 * reaches the database to resolve a role and a current coach, so importing it
 * opens a connection, and an authorization rule that can only be exercised
 * against live Postgres is one nobody exercises.
 *
 * ── Historical messages are not historical access ─────────────────────────
 *
 * Reassignment keeps the thread. Nick's words stay Nick's words, and rewriting
 * them so Gerard appears to have said them would be a lie the member could act
 * on. It does not keep the access, and the easy mistake is to let the first
 * fact answer the second: old messages exist, therefore the old coach can still
 * open the conversation, therefore — because attachments hang off messages — he
 * can still fetch her lab results, indefinitely, including ones uploaded months
 * after he stopped coaching her.
 *
 * An ended relationship must not become permanent access to future information.
 * So a former coach gets nothing here. If a coach ever needs their own
 * historical thread for an operational or legal reason, that is a narrower
 * thing — scoped to the messages they wrote and the files on them — and it is
 * deliberately not this.
 */

import { can, type Role } from "./access.js";

export type ConversationAccess = "self" | "coach" | "admin";

export function decideConversationAccess(input: {
  actorId: string;
  memberUserId: string;
  actorRole: Role;
  /** The member's *active* coach, or null. An ended relationship is not one. */
  currentCoachUserId: string | null;
}): ConversationAccess | null {
  const { actorId, memberUserId, actorRole, currentCoachUserId } = input;

  // The member always reaches their own conversation, whatever else is true.
  if (actorId === memberUserId) return "self";

  /**
   * The administrative bypass, named for what it grants.
   *
   * `superviseCoaching`, not `manageMembers`: one is accounts, tiers and
   * bookings; the other is reading what is inside them. The same people hold
   * both today, which is exactly why the names have to stay honest — a call
   * site that says `manageMembers` and means "may read her lab results" cannot
   * be audited by reading it.
   */
  if (can(actorRole, "superviseCoaching")) return "admin";

  if (currentCoachUserId && currentCoachUserId === actorId) return "coach";

  return null;
}

/**
 * Which side of the conversation the sender is on.
 *
 * Display metadata — it is what the thread renders alignment from — and no
 * longer the identity. `sender_user_id` is that, so a thread that changed hands
 * still says which of Nick and Gerard wrote which line.
 */
export function senderRoleFor(access: ConversationAccess): "member" | "coach" {
  return access === "self" ? "member" : "coach";
}
