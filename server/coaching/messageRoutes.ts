/**
 * The coaching conversation — messages and the files in them.
 *
 *   GET    /api/coaching/messages                    my thread
 *   POST   /api/coaching/messages                    send into my thread
 *   POST   /api/coaching/messages/read               mark my coach's messages read
 *
 *   GET    /api/coach/clients/:memberId/messages     a client's thread   (clientRoutes)
 *   POST   /api/coach/clients/:memberId/messages     reply to a client
 *   POST   /api/coach/clients/:memberId/messages/read
 *
 *   POST   /api/coaching/attachments                 stage a file
 *   DELETE /api/coaching/attachments/:id             discard before sending
 *   GET    /api/coaching/attachments/:id             fetch, via a short-lived URL
 *
 * Every one of them passes through `requireConversation`. The upload used to be
 * `isAuthenticated` and nothing else, which meant any account could put a file
 * into storage and hand back a permanent public URL for it.
 *
 * ── What a message can carry now ──────────────────────────────────────────
 *
 * `POST /api/coaching/messages` accepted `imageUrl: z.string()` — any URL in
 * the world, stored and then rendered into the thread as an image or a link.
 * That was two problems wearing one field: attachments were public objects, and
 * the field was a way to put arbitrary remote content on somebody else's
 * screen. It is gone. A client sends attachment *ids* it has already uploaded
 * and been authorized for.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { users } from "../../shared/models/auth.js";
import {
  coachingAttachments,
  coachingMessages,
  sendMessageSchema,
} from "../../shared/models/coaching.js";
import { conversationAccess, requireConversation, senderRoleFor } from "./conversation.js";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  COACHING_BUCKET,
  attachmentPath,
  isStorageConfigured,
  putAttachment,
  removeAttachment,
  signedUrlFor,
} from "./attachmentStore.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error("That file type isn't accepted. Images, PDF, Word and text."));
  },
});

function fail(res: Response, where: string, err: unknown) {
  console.error(`[coaching] ${where} failed`, err);
  res.status(500).json({ message: "Internal Server Error" });
}

/**
 * What the client is told about an attachment.
 *
 * No bucket, no storage path, no URL. The id is the handle, and it is only
 * useful through the endpoint that checks who is asking. Returning the path
 * would hand out something that looks like a way in and invites somebody to
 * try it.
 */
function publicAttachment(a: {
  id: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedByUserId: string;
}) {
  return {
    id: a.id,
    mimeType: a.mimeType,
    filename: a.originalFilename,
    sizeBytes: a.sizeBytes,
    uploadedByUserId: a.uploadedByUserId,
  };
}

/** The thread, with each message's files attached. */
export async function threadFor(memberUserId: string) {
  const messages = await db
    .select()
    .from(coachingMessages)
    .where(eq(coachingMessages.userId, memberUserId))
    .orderBy(coachingMessages.createdAt);

  if (!messages.length) return [];

  const files = await db
    .select()
    .from(coachingAttachments)
    .where(
      and(
        eq(coachingAttachments.userId, memberUserId),
        inArray(coachingAttachments.messageId, messages.map((m) => m.id)),
      ),
    );

  const byMessage = new Map<string, ReturnType<typeof publicAttachment>[]>();
  for (const f of files) {
    if (!f.messageId) continue;
    const list = byMessage.get(f.messageId) ?? [];
    list.push(publicAttachment(f));
    byMessage.set(f.messageId, list);
  }

  /**
   * Sender names, so the thread can say "Nick Cavaleri" rather than "Coach".
   *
   * The one message that predates `sender_user_id` has none and is left
   * honestly unattributed — inventing an author for it would be worse than
   * admitting we cannot recover one.
   */
  const senderIds = Array.from(
    new Set(messages.map((m) => m.senderUserId).filter((v): v is string => Boolean(v))),
  );
  const people = senderIds.length
    ? await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(inArray(users.id, senderIds))
    : [];
  const nameById = new Map(
    people.map((p) => [p.id, [p.firstName, p.lastName].filter(Boolean).join(" ").trim()]),
  );

  return messages.map((m) => ({
    ...m,
    senderName: m.senderUserId ? (nameById.get(m.senderUserId) || null) : null,
    attachments: byMessage.get(m.id) ?? [],
  }));
}

/**
 * Send into a conversation the caller has already been authorized for.
 *
 * Attachments are claimed inside the insert's transaction and only if they
 * belong to this conversation and are still unclaimed — so an id copied from
 * somewhere else attaches nothing, and an id used twice attaches once.
 */
async function sendInto(req: Request, res: Response) {
  const parsed = sendMessageSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

  const memberUserId = req.conversationMemberId!;
  const access = req.conversationAccess!;
  const actorId = req.session!.userId!;
  const { content, messageType, attachmentIds, metadata } = parsed.data;

  try {
    const message = await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(coachingMessages)
        .values({
          userId: memberUserId,
          senderRole: senderRoleFor(access),
          /**
           * Which human, not just which side. `senderRole` was enough while
           * there was no such thing as a specific coach; once a member can be
           * reassigned, "a coach wrote this" is not something anyone can act
           * on, and after Nick hands over to Gerard the thread has to keep
           * saying which of them said what.
           */
          senderUserId: actorId,
          messageType,
          content,
          metadata: metadata || null,
        })
        .returning();

      if (attachmentIds.length) {
        await tx
          .update(coachingAttachments)
          .set({ messageId: msg.id })
          .where(
            and(
              inArray(coachingAttachments.id, attachmentIds),
              // Scoped, not trusted: an id from another conversation matches
              // nothing here rather than being attached and then checked.
              eq(coachingAttachments.userId, memberUserId),
              isNull(coachingAttachments.messageId),
            ),
          );
      }

      return msg;
    });

    const attached = attachmentIds.length
      ? await db
          .select()
          .from(coachingAttachments)
          .where(eq(coachingAttachments.messageId, message.id))
      : [];

    res.status(201).json({
      ...message,
      attachments: attached.map(publicAttachment),
    });
  } catch (err) {
    fail(res, "send message", err);
  }
}

/** Mark the other side's messages read. */
async function markRead(req: Request, res: Response) {
  const memberUserId = req.conversationMemberId!;
  const access = req.conversationAccess!;
  // A member reads what their coach wrote; a coach reads what the member wrote.
  const theirs = access === "self" ? "coach" : "member";
  try {
    await db
      .update(coachingMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(coachingMessages.userId, memberUserId),
          eq(coachingMessages.senderRole, theirs),
          sql`${coachingMessages.readAt} is null`,
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    fail(res, "mark read", err);
  }
}

/**
 * Delete staged files nobody claimed.
 *
 * Somebody picks a photo, the app is killed, the message is never sent — and a
 * private object sits there forever with a row pointing at it. Not a
 * transaction: object storage and Postgres cannot share one, and pretending
 * otherwise with a two-phase dance would be more machinery than the problem
 * deserves. A sweep is enough, because an unclaimed row is unambiguous.
 *
 * Runs opportunistically off the upload path rather than on a schedule. There
 * is no cron in this deployment, and adding one for a few kilobytes of debris
 * would be a new piece of infrastructure to own.
 */
const STAGED_TTL_HOURS = 24;
let lastSweep = 0;

async function sweepStagedAttachments(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < 60 * 60 * 1000) return;
  lastSweep = now;

  try {
    const cutoff = new Date(now - STAGED_TTL_HOURS * 60 * 60 * 1000);
    const orphans = await db
      .select()
      .from(coachingAttachments)
      .where(and(isNull(coachingAttachments.messageId), lt(coachingAttachments.createdAt, cutoff)))
      .limit(200);

    for (const o of orphans) {
      await removeAttachment(o.storagePath);
      await db.delete(coachingAttachments).where(eq(coachingAttachments.id, o.id));
    }
    if (orphans.length) console.log(`[coaching] swept ${orphans.length} staged attachments`);
  } catch (err) {
    // Never fails the upload it is riding along with.
    console.error("[coaching] sweep failed", err);
  }
}

export function registerCoachingMessageRoutes(app: Express): void {
  // ── The member's own thread ──────────────────────────────────────────────

  app.get(
    "/api/coaching/messages",
    isAuthenticated,
    requireConversation(),
    async (req: Request, res: Response) => {
      try {
        res.json(await threadFor(req.conversationMemberId!));
      } catch (err) {
        fail(res, "thread", err);
      }
    },
  );

  app.post("/api/coaching/messages", isAuthenticated, requireConversation(), sendInto);
  app.post("/api/coaching/messages/read", isAuthenticated, requireConversation(), markRead);

  // ── A coach writing to a client ──────────────────────────────────────────
  //
  // The read side lives in clientRoutes with the rest of the client workspace;
  // both go through the same gate, from opposite directions.

  app.post(
    "/api/coach/clients/:memberId/messages",
    isAuthenticated,
    requireConversation("memberId"),
    sendInto,
  );

  app.post(
    "/api/coach/clients/:memberId/messages/read",
    isAuthenticated,
    requireConversation("memberId"),
    markRead,
  );

  // ── Files ────────────────────────────────────────────────────────────────

  /**
   * Stage a file against a conversation.
   *
   * `memberId` says which conversation. A member sending into their own may
   * omit it; a coach must name the client, and naming somebody who is not
   * theirs is a 404 before a single byte is written.
   *
   * The response deliberately contains no URL. The file exists, the sender can
   * see its name and size in the composer, and fetching it still costs an
   * authorized request.
   */
  app.post(
    "/api/coaching/attachments",
    isAuthenticated,
    (req, res, next) => {
      // Resolved before multer, so an unauthorized upload is refused before the
      // body is read rather than after it has been buffered into memory.
      const named = typeof req.query.memberId === "string" ? "q" : undefined;
      if (named) (req.params as Record<string, string>).memberId = String(req.query.memberId);
      return requireConversation(named ? "memberId" : undefined)(req, res, next);
    },
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!isStorageConfigured()) {
          return res.status(503).json({ message: "File storage isn't set up yet." });
        }

        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file) return res.status(400).json({ message: "No file provided." });

        const memberUserId = req.conversationMemberId!;
        const actorId = req.session!.userId!;

        /**
         * The row first, so the object key comes from an id we minted.
         *
         * The old path was `${userId}/${Date.now()}_${sanitizedOriginalName}` —
         * so two files sent in the same millisecond collided, and the member's
         * own filename ("Sarah-bloodwork-August.pdf") became part of a key that
         * was then published as a public URL. The name is data now, not a path.
         */
        const [row] = await db
          .insert(coachingAttachments)
          .values({
            userId: memberUserId,
            uploadedByUserId: actorId,
            storageBucket: COACHING_BUCKET,
            storagePath: "pending",
            mimeType: file.mimetype,
            originalFilename: file.originalname.slice(0, 200),
            sizeBytes: file.size,
          })
          .returning();

        const path = attachmentPath(memberUserId, row.id, file.mimetype);
        const stored = await putAttachment(path, file.buffer, file.mimetype);

        if (!stored) {
          await db.delete(coachingAttachments).where(eq(coachingAttachments.id, row.id));
          return res.status(502).json({ message: "That didn't upload. Try again." });
        }

        const [saved] = await db
          .update(coachingAttachments)
          .set({ storagePath: path })
          .where(eq(coachingAttachments.id, row.id))
          .returning();

        void sweepStagedAttachments();

        res.status(201).json(publicAttachment(saved));
      } catch (err) {
        if (err instanceof Error && /file type|File too large/i.test(err.message)) {
          return res.status(400).json({ message: err.message });
        }
        fail(res, "upload", err);
      }
    },
  );

  /** Discard a staged file before it is sent. */
  app.delete(
    "/api/coaching/attachments/:id",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const actorId = req.session!.userId!;
        const [row] = await db
          .select()
          .from(coachingAttachments)
          .where(eq(coachingAttachments.id, String(req.params.id ?? "")))
          .limit(1);

        // Only the person who uploaded it, and only before it was sent. A sent
        // message is a record, and letting either side delete out of the other
        // side's history is a different feature with different consequences.
        if (!row || row.uploadedByUserId !== actorId || row.messageId) {
          return res.status(404).json({ message: "Not found" });
        }

        await removeAttachment(row.storagePath);
        await db.delete(coachingAttachments).where(eq(coachingAttachments.id, row.id));
        res.json({ ok: true });
      } catch (err) {
        fail(res, "discard attachment", err);
      }
    },
  );

  /**
   * Fetch a file.
   *
   * The authorization is on the *conversation the attachment belongs to*, read
   * from the row rather than from anything the caller said. Then, and only
   * then, a URL valid for a few minutes is minted and the caller is redirected
   * to it.
   *
   * Nothing here can be bypassed by knowing a storage path: the bucket is
   * private, so a path is not a way in, and this endpoint never accepts one.
   */
  app.get(
    "/api/coaching/attachments/:id",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id ?? "");
        // Shape-checked first: a non-uuid would make Postgres throw, and a 500
        // where a 404 belongs is itself a signal about what exists.
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return res.status(404).json({ message: "Not found" });
        }

        const [row] = await db
          .select()
          .from(coachingAttachments)
          .where(eq(coachingAttachments.id, id))
          .limit(1);

        if (!row) return res.status(404).json({ message: "Not found" });

        const access = await conversationAccess(req.session!.userId!, row.userId);
        if (!access) return res.status(404).json({ message: "Not found" });

        const url = await signedUrlFor(row.storagePath);
        if (!url) return res.status(404).json({ message: "Not found" });

        /**
         * A redirect rather than a proxy.
         *
         * Streaming it through this process would put every lab result and
         * progress photo through a serverless function with a 30-second budget,
         * for no security gain — the URL is already short-lived and was already
         * authorized. `no-store` so the redirect itself is never cached: the
         * location it points at expires, and a cached 302 would send somebody
         * to a dead link and look like the file had gone.
         */
        res.setHeader("Cache-Control", "no-store, private");
        res.redirect(302, url);
      } catch (err) {
        fail(res, "fetch attachment", err);
      }
    },
  );
}
