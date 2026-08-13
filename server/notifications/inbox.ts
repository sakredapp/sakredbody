/**
 * Reading your own notifications.
 *
 *   GET   /api/notifications              the list, newest first
 *   GET   /api/notifications/unread-count  the badge
 *   PATCH /api/notifications/:id/read      seen
 *
 * ── Only ever your own ────────────────────────────────────────────────────
 *
 * Every query here is scoped by the session's user id, and none of these routes
 * takes a user in the path. There is deliberately no admin view: a list of who
 * has been messaged and who has not read it is a surveillance surface, and
 * nothing in the product needs one.
 *
 * ── A notification is not a permission ────────────────────────────────────
 *
 * These rows carry ids, not content. Tapping one leads somewhere that fetches
 * under current authorization — so a coach who kept a notification about a
 * member reassigned away from them learns nothing new by opening it, and an old
 * `checkin_requested` cannot conjure a check-in that has since been answered.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db.js";
import { notifications } from "../../shared/models/notifications.js";
import { isAuthenticated } from "../auth/sessionAuth.js";
import { trackError } from "../telemetry/index.js";

export function registerNotificationInboxRoutes(app: Express): void {
  app.get("/api/notifications", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
      res.json(rows);
    } catch (error) {
      trackError("notifications.list", error);
      res.status(500).json({ message: "Couldn't load those." });
    }
  });

  /**
   * The badge.
   *
   * Its own route rather than counting the list client-side, because the badge
   * is polled and the list is not — and a partial index makes this a cheap
   * question no matter how much history somebody has accumulated.
   */
  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
      res.json({ count: row?.count ?? 0 });
    } catch (error) {
      trackError("notifications.unreadCount", error);
      // A badge that fails is a zero, not an error dialog. Nothing a member can
      // do about it, and the count is not the truth — the destinations are.
      res.json({ count: 0 });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const [row] = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, String(req.params.id ?? "")),
            // Scoped, not checked afterwards: somebody else's id matches
            // nothing rather than being found and then refused.
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
          ),
        )
        .returning();
      // Already read is not a failure — a second tap is a normal thing to do.
      res.json(row ?? { ok: true });
    } catch (error) {
      trackError("notifications.markRead", error);
      res.status(500).json({ message: "Couldn't mark that read." });
    }
  });
}
