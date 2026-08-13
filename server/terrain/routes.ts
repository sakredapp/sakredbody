/**
 * Terrain — API
 *
 *   GET /api/terrain/today — what condition the body is in, and what it can
 *                            receive next
 *
 * The reading itself lives in `./read.ts` and the reasoning under it lives in
 * `shared/models/terrain.ts`, which is pure and tested. This file resolves who
 * is asking and for which date, and nothing else.
 *
 * A coach reading a client goes through the same `terrainFor`, from
 * `server/coaching/clientRoutes.ts`, behind the relationship boundary. There is
 * deliberately no second implementation: two readings of one body is how a
 * coach and a member end up in a conversation where the app has told them
 * different things.
 */

import type { Express } from "express";
import { isAuthenticated } from "../auth/index.js";
import { memberToday } from "../coaching/enrollment.js";
import { terrainFor } from "./read.js";

export function registerTerrainRoutes(app: Express): void {
  app.get("/api/terrain/today", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user?.id ?? req.session?.userId) as string;
      /**
       * The member's own date, matching daily_notes and health_days.
       *
       * This fell back to `new Date().toISOString()` — the *server's* UTC date
       * — directly underneath a comment saying it must not. For anybody west
       * of Greenwich the last hours of their evening are already tomorrow in
       * UTC, so from about 20:00 Eastern the screen asked for a day that had
       * not happened, found nothing, and told a member with months of synced
       * data to "connect health data or log a session".
       *
       * A wrong-by-one-day read is the worst kind of bug here: it is invisible
       * for two thirds of the day and looks like a sync failure for the rest.
       */
      const onDate =
        typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : await memberToday(userId);

      res.json(await terrainFor(userId, onDate));
    } catch (err) {
      console.error("[terrain] today failed", err);
      res.status(500).json({ message: "Could not read your terrain." });
    }
  });
}
