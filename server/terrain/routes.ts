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
import { record, withHandle } from "../intelligence/index.js";
import type { ReasonCode } from "../../shared/models/brain.js";

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

      const reading = await terrainFor(userId, onDate);

      /**
       * The one recommendation on this screen, recorded where it is read.
       *
       * `unknown` is not recorded. It is the engine saying it cannot read this
       * body yet, and a row for it would put "we don't know" into the same
       * table as the advice — where every aggregate would then have to
       * remember to exclude it, and eventually one wouldn't.
       *
       * A date in the query string is a member scrolling back through their
       * own history. Recording that would date-stamp today's re-read as a
       * recommendation made last Tuesday, so only the live read is written.
       */
      const live = !req.query.date;
      const recorded =
        live && reading.lean !== "unknown"
          ? await record(userId, onDate, [
              {
                type: "terrain_direction",
                key: reading.lean,
                surface: "terrain",
                reasonCodes: reading.reasons.map((r) => r.code as ReasonCode),
                provenance: {
                  hasBody: reading.hasBody,
                  hasReport: reading.hasReport,
                  /* Which kinds of evidence were in play, never what any said. */
                  sources: Array.from(new Set(reading.reasons.map((r) => r.source))),
                  sessions: reading.week.sessions,
                },
              },
            ])
          : new Map();

      res.json(withHandle(recorded, "terrain_direction", reading.lean, reading));
    } catch (err) {
      console.error("[terrain] today failed", err);
      res.status(500).json({ message: "Could not read your terrain." });
    }
  });
}
