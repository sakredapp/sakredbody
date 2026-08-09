/**
 * Moderation — API
 *
 * Member:
 *   POST   /api/community/messages/:id/report  — object to something
 *   GET    /api/community/blocks               — who I've blocked
 *   POST   /api/community/blocks/:userId       — block
 *   DELETE /api/community/blocks/:userId       — unblock
 *
 * Admin:
 *   GET   /api/admin/reports          — the queue
 *   PATCH /api/admin/reports/:id      — action or dismiss
 *
 * Both stores require the member half of this before an app carrying
 * member-to-member content can be listed, and both reject without it.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import {
  contentReports,
  userBlocks,
  communityMessages,
  users,
  reportSchema,
  reviewReportSchema,
} from "../../shared/schema.js";
import { track, trackError } from "../telemetry/index.js";

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: err.errors[0].message });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

function isAdmin(req: Request, res: Response, next: () => void) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  storage
    .getUser(userId)
    .then((user) => {
      if (!user || user.isAdmin !== "true")
        return res.status(403).json({ message: "Admin access required" });
      next();
    })
    .catch(() => res.status(500).json({ message: "Internal Server Error" }));
}

export function registerModerationRoutes(app: Express) {
  // ─── Reporting ───────────────────────────────────────────────────────────

  /**
   * Object to a message.
   *
   * Copies the author and the text into the report at the moment it is made.
   * That duplication is the entire point: the usual resolution is deleting the
   * message, and a queue that then shows an empty row is a queue nobody can
   * review.
   */
  app.post("/api/community/messages/:id/report", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const messageId = param(req, "id");
      const input = reportSchema.parse(req.body ?? {});

      const [message] = await db
        .select({ id: communityMessages.id, userId: communityMessages.userId, body: communityMessages.body })
        .from(communityMessages)
        .where(eq(communityMessages.id, messageId));

      if (!message) return res.status(404).json({ message: "That message is gone." });
      if (message.userId === userId) {
        return res.status(400).json({ message: "You can delete your own message instead." });
      }

      // Reporting twice is the same complaint. Treated as success so the
      // member gets a confirmation rather than an error for being worried
      // enough to try again.
      const [row] = await db
        .insert(contentReports)
        .values({
          reporterId: userId,
          messageId,
          authorId: message.userId,
          excerpt: (message.body ?? "").slice(0, 500),
          reason: input.reason,
          detail: input.detail ?? null,
        })
        .onConflictDoNothing()
        .returning();

      track("community.report", {
        userId,
        surface: "community",
        subjectId: messageId,
        props: { reason: input.reason },
      });

      res.status(201).json({ reported: true, id: row?.id ?? null });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      trackError("community.report", err, { userId: req.session?.userId });
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ─── Blocking ────────────────────────────────────────────────────────────

  app.get("/api/community/blocks", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const rows = await db
        .select({
          id: userBlocks.id,
          blockedId: userBlocks.blockedId,
          createdAt: userBlocks.createdAt,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(userBlocks)
        .leftJoin(users, eq(userBlocks.blockedId, users.id))
        .where(eq(userBlocks.blockerId, userId))
        .orderBy(desc(userBlocks.createdAt));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Block somebody.
   *
   * Silent by design — no notification, no visible change on their side. In a
   * paid community of a few dozen people who will meet each other on a
   * retreat, telling somebody they've been blocked is how a quiet exit becomes
   * a confrontation.
   */
  app.post("/api/community/blocks/:userId", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const blockedId = param(req, "userId");

      if (blockedId === userId) {
        return res.status(400).json({ message: "You can't block yourself." });
      }

      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, blockedId));
      if (!target) return res.status(404).json({ message: "No such member" });

      await db
        .insert(userBlocks)
        .values({ blockerId: userId, blockedId })
        .onConflictDoNothing();

      track("community.block", { userId, surface: "community", subjectId: blockedId });
      res.status(201).json({ blocked: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/community/blocks/:userId", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      await db
        .delete(userBlocks)
        .where(
          and(
            eq(userBlocks.blockerId, userId),
            eq(userBlocks.blockedId, param(req, "userId")),
          ),
        );
      res.json({ blocked: false });
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── The queue ───────────────────────────────────────────────────────────

  app.get("/api/admin/reports", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = String((req.query.status as string) ?? "open");

      const rows = await db
        .select({
          id: contentReports.id,
          messageId: contentReports.messageId,
          reason: contentReports.reason,
          detail: contentReports.detail,
          excerpt: contentReports.excerpt,
          status: contentReports.status,
          createdAt: contentReports.createdAt,
          reviewNote: contentReports.reviewNote,
          reporterId: contentReports.reporterId,
          authorId: contentReports.authorId,
          // Whether the message still exists, so the queue can say "already
          // deleted" instead of offering a delete button that does nothing.
          stillLive: sql<boolean>`exists (
            select 1 from ${communityMessages} m
            where m.id = ${contentReports.messageId} and m.deleted_at is null
          )`,
        })
        .from(contentReports)
        .where(status === "all" ? undefined : eq(contentReports.status, status))
        .orderBy(desc(contentReports.createdAt))
        .limit(200);

      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Resolve one.
   *
   * Deleting the message is a soft delete, matching what the community's own
   * delete does — the thread keeps its shape and replies underneath don't
   * become orphans with no parent to hang from.
   */
  app.patch("/api/admin/reports/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const adminId = req.session!.userId!;
      const input = reviewReportSchema.parse(req.body ?? {});

      const [report] = await db
        .select({ id: contentReports.id, messageId: contentReports.messageId })
        .from(contentReports)
        .where(eq(contentReports.id, param(req, "id")));
      if (!report) return res.status(404).json({ message: "No such report" });

      // Both writes or neither: a message deleted while the report still reads
      // "open" would come back to the top of the queue forever.
      const updated = await db.transaction(async (tx) => {
        if (input.deleteMessage) {
          await tx
            .update(communityMessages)
            .set({ deletedAt: new Date() })
            .where(eq(communityMessages.id, report.messageId));
        }

        const [row] = await tx
          .update(contentReports)
          .set({
            status: input.status,
            reviewedBy: adminId,
            reviewedAt: new Date(),
            reviewNote: input.reviewNote ?? null,
          })
          .where(eq(contentReports.id, report.id))
          .returning();

        // Every other open report about the same message is resolved the same
        // way. Reviewing the identical complaint five times is how a queue
        // stops being read.
        if (input.status === "actioned") {
          await tx
            .update(contentReports)
            .set({
              status: "actioned",
              reviewedBy: adminId,
              reviewedAt: new Date(),
              reviewNote: "Resolved with another report of the same message.",
            })
            .where(
              and(
                eq(contentReports.messageId, report.messageId),
                eq(contentReports.status, "open"),
              ),
            );
        }

        return row;
      });

      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });
}
