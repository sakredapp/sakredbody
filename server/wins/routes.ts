/**
 * Wins — API
 *
 *   GET  /api/wins            — everything this member has earned
 *   GET  /api/wins/unseen     — what to congratulate them for right now
 *   POST /api/wins/:id/seen   — stop congratulating them for it
 *   POST /api/wins/:id/share  — post it to the community
 *
 * Sharing writes a real community message rather than a special "win post"
 * type. A win in the room should be repliable, reactable and searchable like
 * anything else somebody said — a parallel post type would have needed all of
 * that rebuilt, and would sit outside the moderation that already exists.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import {
  wins,
  channels,
  communityMessages,
  membershipTiers,
  users,
  shareWinSchema,
  winHeadline,
  type WinKind,
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
   * What to celebrate right now.
   *
   * "Unseen" is `onDate` being today's — a win from three weeks ago shouldn't
   * ambush someone with a modal because they never opened the app that day.
   * Bounded to today, so the celebration is timely or it doesn't happen.
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

      const [me] = await db
        .select({ tier: users.membershipTier })
        .from(users)
        .where(eq(users.id, userId));

      const [tier] = me?.tier
        ? await db
            .select({ rank: membershipTiers.rank })
            .from(membershipTiers)
            .where(eq(membershipTiers.id, me.tier))
        : [];
      const rank = tier?.rank ?? 0;

      const open = await db
        .select()
        .from(channels)
        .where(
          and(
            eq(channels.isActive, true),
            eq(channels.isReadOnly, false),
            isNull(channels.offeringId),
            sql`${channels.minTierRank} <= ${rank}`,
          ),
        )
        .orderBy(channels.minTierRank, channels.sortOrder);

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

      const [message] = await db
        .insert(communityMessages)
        .values({ channelId: target.id, userId, body })
        .returning();

      // A top-level message is its own root, same as any other post.
      await db
        .update(communityMessages)
        .set({ rootId: message.id })
        .where(eq(communityMessages.id, message.id));

      await db
        .update(wins)
        .set({ sharedAt: new Date(), sharedMessageId: message.id })
        .where(eq(wins.id, win.id));

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
