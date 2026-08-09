/**
 * Wins — API
 *
 *   GET  /api/wins             — everything this member has earned
 *   GET  /api/wins/unseen      — earned but not yet shared
 *   POST /api/wins/:id/share   — post it to the community
 *   POST /api/wins/:id/exported — they saved the image
 *
 * Sharing writes a real community message rather than a special "win post"
 * type. A win in the room should be repliable, reactable and searchable like
 * anything else somebody said — a parallel post type would have needed all of
 * that rebuilt, and would sit outside the moderation that already exists.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db.js";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import {
  wins,
  users,
  channels,
  communityMessages,
  shareWinSchema,
  winHeadline,
  type WinKind,
} from "../../shared/schema.js";
import { track, trackError } from "../telemetry/index.js";
import { visibleChannelIds } from "../community/index.js";

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
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

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: err.errors[0].message });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

export function registerWinRoutes(app: Express) {
  app.get("/api/wins", isAuthenticated, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(wins)
        .where(eq(wins.userId, req.session!.userId!))
        .orderBy(desc(wins.earnedAt));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Earned but never shared.
   *
   * Not used for the celebration — that fires off the toggle's own response,
   * so it can only ever interrupt for something that just happened. This is
   * for a quieter "you never showed anyone this" prompt.
   */
  app.get("/api/wins/unseen", isAuthenticated, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(wins)
        .where(and(eq(wins.userId, req.session!.userId!), isNull(wins.sharedAt)))
        .orderBy(desc(wins.earnedAt))
        .limit(5);
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Post a win to the community.
   *
   * Goes to the lowest-ranked room this member can actually write in, unless
   * they name one — a win posted into a room they can't see would vanish, and
   * a win posted into the most exclusive room they hold would be bragging at
   * the wrong audience.
   */
  app.post("/api/wins/:id/share", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const winId = param(req, "id");
      const input = shareWinSchema.parse(req.body ?? {});

      const [win] = await db
        .select()
        .from(wins)
        .where(and(eq(wins.id, winId), eq(wins.userId, userId)));

      if (!win) return res.status(404).json({ message: "Not found" });
      if (win.sharedMessageId) {
        return res.status(409).json({ message: "You've already shared this one." });
      }

      // Reuse the community's own gate rather than reimplementing the rank
      // comparison here. The first version of this did reimplement it and
      // dropped the admin bypass, so an admin without a paid tier — which is
      // every admin today — could not share anything. The visibility rule is
      // already written twice, once in TypeScript and once in SQL; a third
      // copy was one too many.
      const visible = await visibleChannelIds(userId);

      const open = visible.length
        ? await db
            .select()
            .from(channels)
            .where(
              and(
                inArray(channels.id, visible),
                eq(channels.isActive, true),
                eq(channels.isReadOnly, false),
                // Not an offering's private room — a win belongs in the
                // general population, not in the mastermind someone happens
                // to be in.
                isNull(channels.offeringId),
              ),
            )
            .orderBy(channels.minTierRank, channels.sortOrder)
        : [];

      const target = input.channelId
        ? open.find((c) => c.id === input.channelId)
        : open[0];

      if (!target) {
        return res.status(403).json({
          message: "There's no room open to you to share this in yet.",
        });
      }

      // The member's own words first, then the fact. Their sentence is the
      // post; the win is the evidence under it.
      const headline = winHeadline(win.kind as WinKind, win.props ?? {});
      const body = [input.message?.trim(), `— ${headline}. ${win.subtitle ?? ""}`.trim()]
        .filter(Boolean)
        .join("\n\n");

      // All three writes or none.
      //
      // These were three separate statements. A failure between them — a
      // dropped connection, a statement timeout — left the worst possible
      // shape: a message in the room with a null `root_id`, which the channel
      // list filters on and so would never render, plus a win still marked
      // unshared. The member sees "that didn't go through", tries again, and
      // gets a second invisible post. Nothing cleans either up.
      const message = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(communityMessages)
          .values({ channelId: target.id, userId, body })
          .returning();

        // A top-level message is its own root, same as any other post.
        await tx
          .update(communityMessages)
          .set({ rootId: row.id })
          .where(eq(communityMessages.id, row.id));

        await tx
          .update(wins)
          .set({ sharedAt: new Date(), sharedMessageId: row.id })
          .where(eq(wins.id, win.id));

        return row;
      });

      track("win.share", {
        userId,
        surface: "wins",
        subjectId: win.id,
        props: { kind: win.kind, channel: target.slug },
      });

      res.status(201).json({ messageId: message.id, channelId: target.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      trackError("win.share", err, { userId: req.session?.userId });
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  /**
   * What members are actually finishing.
   *
   * Read-only, and that is the whole design: you do not administer somebody's
   * achievements. A win is a record of something they did, so there is no edit
   * and no delete — the only honest operations on it are looking and counting.
   *
   * Useful to a coach for one specific reason: a member earning nothing for
   * three weeks is the earliest visible sign that a protocol is not landing,
   * and it shows up here before it shows up in a cancelled membership.
   */
  app.get("/api/admin/wins", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const kind = String((req.query.kind as string) ?? "").trim();

      const rows = await db
        .select({
          id: wins.id,
          kind: wins.kind,
          title: wins.title,
          subtitle: wins.subtitle,
          earnedAt: wins.earnedAt,
          sharedAt: wins.sharedAt,
          userId: wins.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(wins)
        .leftJoin(users, eq(wins.userId, users.id))
        .where(kind && kind !== "all" ? eq(wins.kind, kind) : undefined)
        .orderBy(desc(wins.earnedAt))
        .limit(200);

      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  /** Recorded so the funnel can tell earning from actually showing anyone. */
  app.post("/api/wins/:id/exported", isAuthenticated, async (req, res) => {
    try {
      track("win.export_image", {
        userId: req.session!.userId!,
        surface: "wins",
        subjectId: param(req, "id"),
      });
      res.status(202).json({ accepted: true });
    } catch (err) {
      fail(res, err);
    }
  });
}
