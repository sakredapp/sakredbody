/**
 * Who may be in a coaching conversation.
 *
 * ── One boundary, four routes deep ────────────────────────────────────────
 *
 * Reading the thread, sending into it, uploading a file, retrieving that file
 * and marking it read are five questions with one answer. They were five
 * separate answers: the thread read was scoped to the session (fine), the
 * upload was `isAuthenticated` alone (anyone could put a file in the private
 * bucket), and the admin variants were `isAdmin` (fine, but a different rule
 * again). This is the single place it is decided.
 *
 * ── Former coaches ────────────────────────────────────────────────────────
 *
 * Reassignment keeps the messages — Nick's words stay Nick's words, and
 * rewriting the thread so Gerard appears to have said them would be a lie the
 * member could act on. It does *not* keep the access.
 *
 * Those are separate questions and it would be easy to let the first answer the
 * second: old messages exist, therefore the old coach can still open the
 * conversation, therefore — because attachments hang off messages — he can
 * still fetch her lab results, indefinitely, including ones uploaded after he
 * stopped coaching her. An ended relationship must not become permanent access
 * to future information.
 *
 * So: the member always reaches their own conversation. The *current* coach
 * reaches it. A former coach reaches nothing. If a coach ever needs their own
 * historical thread for an operational or legal reason, that is a narrower
 * thing to build — scoped to the messages they wrote and the files attached to
 * them — and it is not this.
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage.js";
import { effectiveRole } from "../../shared/models/access.js";
import {
  decideConversationAccess,
  type ConversationAccess,
} from "../../shared/models/conversationAccess.js";
import { coachOf } from "./relationships.js";

export { senderRoleFor } from "../../shared/models/conversationAccess.js";
export type { ConversationAccess } from "../../shared/models/conversationAccess.js";

declare module "express-serve-static-core" {
  interface Request {
    conversationAccess?: ConversationAccess;
    /** The member whose conversation this is — resolved, never re-read from params. */
    conversationMemberId?: string;
  }
}

/**
 * Gather the inputs and ask.
 *
 * Null is the only refusal. Callers turn it into 404 rather than 403: whether
 * an id belongs to a real Sakred member is not something an unrelated account
 * should learn from the difference between two status codes, and a coaching
 * conversation existing is itself information about that member.
 */
export async function conversationAccess(
  actorId: string,
  memberUserId: string,
): Promise<ConversationAccess | null> {
  // Answered without a lookup, and before one: the common case is a member
  // opening their own thread.
  if (actorId === memberUserId) return "self";

  const actor = await storage.getUser(actorId);
  if (!actor) return null;

  /**
   * `coachOf` returns only an *active* row, so an ended relationship arrives
   * here as null and the decision refuses it. That is where "a former coach
   * keeps the history but loses the access" actually happens.
   */
  const relationship = await coachOf(memberUserId);

  return decideConversationAccess({
    actorId,
    memberUserId,
    actorRole: effectiveRole(actor),
    currentCoachUserId: relationship?.coachUserId ?? null,
  });
}

/**
 * Gate a route on the conversation named by `param`, or on the caller's own.
 *
 * Passing no param means "my conversation" — the member's own routes carry no
 * id at all, so there is nothing in the request to tamper with.
 */
export function requireConversation(param?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.session?.userId;
      if (!actorId) return res.status(401).json({ message: "Not authenticated" });

      const memberUserId = param
        ? String((req.params as Record<string, unknown>)[param] ?? "")
        : actorId;

      if (!memberUserId) return res.status(404).json({ message: "No such conversation" });

      const access = await conversationAccess(actorId, memberUserId);
      if (!access) return res.status(404).json({ message: "No such conversation" });

      req.conversationAccess = access;
      req.conversationMemberId = memberUserId;
      next();
    } catch (err) {
      console.error("[coaching] conversation gate failed", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
}
