/**
 * Telemetry — API
 *
 * Member:
 *   POST /api/track          — record one event from the client
 *
 * Admin:
 *   GET  /api/admin/events                — the raw stream, newest first
 *   GET  /api/admin/events/summary        — counts by name over a window
 *   GET  /api/admin/events/funnel         — the commerce funnel
 *
 * ── Why the client can post at all ────────────────────────────────────────
 *
 * Most events are recorded server-side, at the point the thing actually
 * happens, which is the only place that can't lie. But some facts only exist
 * in the browser — a buy link opening, a product being looked at, a note being
 * read — and those have no server request to hang off.
 *
 * So this endpoint exists, and it is bounded: the event name must be one of a
 * closed list, the user is taken from the session and never from the body, and
 * `props` is capped. A member can post noise about themselves; they cannot
 * post events as anyone else, and they cannot invent event names that would
 * pollute the vocabulary.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { db } from "../db.js";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { events, trackSchema } from "../../shared/schema.js";
import { track } from "./index.js";

function isAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  storage
    .getUser(userId)
    .then((user) => {
      if (!user || user.isAdmin !== "true")
        return res.status(403).json({ message: "Admin access required" });
      next();
    })
    .catch(() => res.status(500).json({ message: "Internal Server Error" }));
}

export function registerTelemetryRoutes(app: Express) {
  /**
   * Record one event.
   *
   * 202, not 200: this is accepted and written after the response. Saying 200
   * would imply the row exists, which it doesn't yet.
   */
  app.post("/api/track", isAuthenticated, async (req, res) => {
    try {
      const input = trackSchema.parse(req.body);

      // props is capped rather than validated per-event. The discipline that
      // matters is on the name; an oversized payload is the only real risk.
      const props = input.props ?? {};
      if (JSON.stringify(props).length > 4000) {
        return res.status(400).json({ message: "That payload is too large" });
      }

      track(input.name, {
        userId: req.session!.userId!,
        surface: input.surface,
        subjectId: input.subjectId,
        props,
      });

      res.status(202).json({ accepted: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err) });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  app.get("/api/admin/events", isAdmin, async (req, res) => {
    try {
      const { name, userId, since } = req.query as Record<string, string | undefined>;
      const limit = Math.min(Number(req.query.limit) || 200, 1000);

      const filters = [];
      if (name) filters.push(eq(events.name, name));
      if (userId) filters.push(eq(events.userId, userId));
      if (since) filters.push(gte(events.createdAt, new Date(since)));

      const rows = await db
        .select()
        .from(events)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(events.createdAt))
        .limit(limit);

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  /** Counts by event name, plus how many distinct members produced each. */
  app.get("/api/admin/events/summary", isAdmin, async (req, res) => {
    try {
      const days = Math.min(Number(req.query.days) || 30, 365);

      const rows = await db.execute<{
        name: string;
        n: number;
        members: number;
        last_at: string;
      }>(sql`
        SELECT name,
               count(*)::int              AS n,
               count(DISTINCT user_id)::int AS members,
               max(created_at)            AS last_at
          FROM events
         WHERE created_at >= now() - (${days} || ' days')::interval
         GROUP BY name
         ORDER BY n DESC
      `);

      res.json(rows.rows ?? []);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  /**
   * The commerce funnel, which is the one that pays for the lights.
   *
   * Buy clicks by surface, because "a click from the shopping list" and "a
   * click from a product page" are different facts about what is working.
   */
  app.get("/api/admin/events/funnel", isAdmin, async (req, res) => {
    try {
      const days = Math.min(Number(req.query.days) || 30, 365);

      const rows = await db.execute<{
        surface: string | null;
        views: number;
        clicks: number;
        members: number;
      }>(sql`
        SELECT surface,
               count(*) FILTER (WHERE name = 'product.view')::int      AS views,
               count(*) FILTER (WHERE name = 'product.buy_click')::int AS clicks,
               count(DISTINCT user_id)::int                            AS members
          FROM events
         WHERE name IN ('product.view', 'product.buy_click')
           AND created_at >= now() - (${days} || ' days')::interval
         GROUP BY surface
         ORDER BY clicks DESC
      `);

      res.json(rows.rows ?? []);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });
}
