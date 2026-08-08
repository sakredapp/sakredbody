/**
 * Community — API
 *
 * One room, and threads hanging off any message. Reddit's shape, not Slack's:
 * a reply is a message with a parent, and a reply can itself have replies, so
 * a conversation nests as far as it actually goes.
 *
 * Member:
 *   GET    /api/community/channels            — rooms this member can see
 *   GET    /api/community/channels/:id        — top-level messages, newest first
 *   GET    /api/community/threads/:rootId     — a whole thread, flat + ordered
 *   POST   /api/community/messages            — post, or reply
 *   PATCH  /api/community/messages/:id        — edit your own
 *   DELETE /api/community/messages/:id        — tombstone your own
 *   POST   /api/community/messages/:id/react  — toggle a reaction
 *   GET    /api/community/search?q=           — full-text, across visible rooms
 *
 * Admin:
 *   POST/PUT/DELETE /api/admin/community/channels
 *   DELETE /api/admin/community/messages/:id
 *
 * ── The gate ──────────────────────────────────────────────────────────────
 *
 * Visibility is decided in exactly one place, `visibleChannelIds`. Every read
 * and every write funnels through it. The RLS policies express the same rule
 * in SQL, so a direct PostgREST call is bounded identically — but the rule is
 * written twice, in two languages, and that is a real risk. If one changes,
 * change the other: supabase/community.sql, `can_see_channel`.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { eq, and, or, isNull, inArray, desc, asc, sql, lt } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import {
  channels,
  communityMessages,
  messageReactions,
  membershipTiers,
  cohortMembers,
  users,
  insertChannelSchema,
  postMessageSchema,
  editMessageSchema,
  MAX_THREAD_DEPTH,
} from "../../shared/schema.js";
import { headlineOptions, segmentHeadline } from "../../shared/utils/highlight.js";

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

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      message: err.errors[0].message,
      field: err.errors[0].path.join("."),
    });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

/** What a message looks like once a deleted one has been tombstoned. */
function present(m: typeof communityMessages.$inferSelect) {
  if (!m.deletedAt) return m;
  // The row survives so replies underneath it keep their shape. The words
  // don't — deleting must actually delete what was said.
  return { ...m, body: "", userId: "", deleted: true };
}

// ─── The gate ──────────────────────────────────────────────────────────────

/**
 * Which channels this member may see, as ids.
 *
 * A tier gate plus a cohort exception: a mastermind's room is open to its
 * confirmed members whatever tier they hold, because they paid for the room
 * rather than for the tier.
 */
async function visibleChannelIds(userId: string): Promise<string[]> {
  const [me] = await db
    .select({ tier: users.membershipTier, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId));

  const [tier] = me?.tier
    ? await db
        .select({ rank: membershipTiers.rank })
        .from(membershipTiers)
        .where(eq(membershipTiers.id, me.tier))
    : [];

  const rank = tier?.rank ?? 0;
  const admin = me?.isAdmin === "true";

  const rows = await db
    .select({ id: channels.id, minTierRank: channels.minTierRank, cohortId: channels.cohortId })
    .from(channels)
    .where(eq(channels.isActive, true));

  if (admin) return rows.map((r) => r.id);

  // One query for every cohort this member is confirmed in, rather than one
  // per gated channel.
  const cohorts = await db
    .select({ cohortId: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.status, "confirmed")));
  const mine = new Set(cohorts.map((c) => c.cohortId));

  return rows
    .filter((c) => (c.cohortId ? mine.has(c.cohortId) : rank >= c.minTierRank))
    .map((c) => c.id);
}

async function canSee(userId: string, channelId: string): Promise<boolean> {
  return (await visibleChannelIds(userId)).includes(channelId);
}

/** Author details for a set of messages, in one query. */
async function authorsFor(rows: { userId: string }[]) {
  const ids = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean)));
  if (ids.length === 0) return new Map<string, { firstName: string | null; lastName: string | null; profileImageUrl: string | null }>();

  const people = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
    })
    .from(users)
    .where(inArray(users.id, ids));

  return new Map(people.map((p) => [p.id, p]));
}

/**
 * Reactions for a set of messages, grouped by emoji, in one query.
 *
 * `mine` rather than a list of user ids: the client only ever needs to know
 * whether to light the button up, and shipping the roster would leak who
 * reacted to what across a paid-tier boundary.
 */
async function reactionsFor(rows: { id: string }[], userId: string) {
  const byMessage = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
  if (rows.length === 0) return byMessage;

  const reactions = await db
    .select()
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, rows.map((r) => r.id)));

  for (const r of reactions) {
    const list = byMessage.get(r.messageId) ?? [];
    const found = list.find((x) => x.emoji === r.emoji);
    if (found) {
      found.count++;
      if (r.userId === userId) found.mine = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, mine: r.userId === userId });
    }
    byMessage.set(r.messageId, list);
  }

  return byMessage;
}

export function registerCommunityRoutes(app: Express) {
  // ─── MEMBER ──────────────────────────────────────────────────────────────

  app.get("/api/community/channels", isAuthenticated, async (req, res) => {
    try {
      const ids = await visibleChannelIds(req.session!.userId!);
      if (ids.length === 0) return res.json([]);

      const rows = await db
        .select()
        .from(channels)
        .where(inArray(channels.id, ids))
        .orderBy(asc(channels.sortOrder), asc(channels.name));

      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/community/channels/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const channelId = param(req, "id");

      if (!(await canSee(userId, channelId))) {
        // 404 rather than 403: a room you can't enter shouldn't announce that
        // it exists.
        return res.status(404).json({ message: "Not found" });
      }

      const before = (req.query.before as string | undefined)?.trim();

      const rows = await db
        .select()
        .from(communityMessages)
        .where(
          and(
            eq(communityMessages.channelId, channelId),
            isNull(communityMessages.parentId),
            ...(before ? [lt(communityMessages.createdAt, new Date(before))] : []),
          ),
        )
        .orderBy(desc(communityMessages.createdAt))
        .limit(40);

      const authors = await authorsFor(rows);
      const reactions = await reactionsFor(rows, userId);

      res.json(
        rows.map((m) => ({
          ...present(m),
          author: m.deletedAt ? null : authors.get(m.userId) ?? null,
          reactions: reactions.get(m.id) ?? [],
        })),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * A whole thread in one query.
   *
   * Returned flat, with parentId and depth, rather than nested — the client
   * builds the tree. A nested payload would need recursion on both sides and
   * makes pagination impossible.
   */
  app.get("/api/community/threads/:rootId", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const rootId = param(req, "rootId");

      const [root] = await db
        .select()
        .from(communityMessages)
        .where(eq(communityMessages.id, rootId));
      if (!root) return res.status(404).json({ message: "Not found" });

      if (!(await canSee(userId, root.channelId))) {
        return res.status(404).json({ message: "Not found" });
      }

      const rows = await db
        .select()
        .from(communityMessages)
        .where(
          or(eq(communityMessages.rootId, rootId), eq(communityMessages.id, rootId)),
        )
        .orderBy(asc(communityMessages.createdAt));

      const authors = await authorsFor(rows);
      const byMessage = await reactionsFor(rows, userId);

      res.json(
        rows.map((m) => ({
          ...present(m),
          author: m.deletedAt ? null : authors.get(m.userId) ?? null,
          reactions: byMessage.get(m.id) ?? [],
        })),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/community/messages", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = postMessageSchema.parse(req.body);

      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, input.channelId));
      if (!channel || !channel.isActive) return res.status(404).json({ message: "Not found" });

      if (!(await canSee(userId, channel.id))) {
        return res.status(404).json({ message: "Not found" });
      }

      const [me] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, userId));

      if (channel.isReadOnly && me?.isAdmin !== "true") {
        return res.status(403).json({ message: "This room is read-only." });
      }

      let parentId: string | null = null;
      let rootId: string | null = null;
      let depth = 0;

      if (input.parentId) {
        const [parent] = await db
          .select()
          .from(communityMessages)
          .where(eq(communityMessages.id, input.parentId));

        if (!parent || parent.channelId !== channel.id) {
          return res.status(400).json({ message: "That message isn't in this room" });
        }

        // Past the depth cap a reply attaches to its parent's level rather than
        // being refused — the member's words matter more than the tree shape,
        // and an error here would just look broken.
        if (parent.depth >= MAX_THREAD_DEPTH) {
          parentId = parent.parentId ?? parent.id;
          depth = parent.depth;
        } else {
          parentId = parent.id;
          depth = parent.depth + 1;
        }
        rootId = parent.rootId ?? parent.id;
      }

      const [created] = await db
        .insert(communityMessages)
        .values({
          channelId: channel.id,
          userId,
          parentId,
          rootId,
          depth,
          body: input.body.trim(),
        })
        .returning();

      // A top-level message is its own root, which keeps the thread query a
      // single indexed lookup instead of a union.
      if (!rootId) {
        await db
          .update(communityMessages)
          .set({ rootId: created.id })
          .where(eq(communityMessages.id, created.id));
        created.rootId = created.id;
      } else {
        // Every ancestor's count goes up, not just the root — the channel list
        // reads the root's, and a collapsed reply reads its own. Walking up the
        // parent chain is bounded by MAX_THREAD_DEPTH, so this is at most eight
        // rows and stays one round trip.
        await db.execute(sql`
          WITH RECURSIVE ancestors(id, parent_id) AS (
            SELECT id, parent_id FROM community_messages WHERE id = ${parentId}
            UNION ALL
            SELECT m.id, m.parent_id
            FROM community_messages m
            JOIN ancestors a ON m.id = a.parent_id
          )
          UPDATE community_messages
             SET reply_count = reply_count + 1
           WHERE id IN (SELECT id FROM ancestors)
        `);
      }

      const authors = await authorsFor([created]);
      res.status(201).json({ ...created, author: authors.get(userId) ?? null });
    } catch (err) {
      fail(res, err);
    }
  });

  app.patch("/api/community/messages/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const { body } = editMessageSchema.parse(req.body);

      const [updated] = await db
        .update(communityMessages)
        .set({ body: body.trim(), editedAt: new Date() })
        .where(
          and(
            eq(communityMessages.id, param(req, "id")),
            eq(communityMessages.userId, userId),
            isNull(communityMessages.deletedAt),
          ),
        )
        .returning();

      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/community/messages/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;

      // A tombstone, not a delete: replies underneath keep their parent and
      // the conversation keeps its shape. The words go.
      const [updated] = await db
        .update(communityMessages)
        .set({ deletedAt: new Date(), body: "" })
        .where(
          and(
            eq(communityMessages.id, param(req, "id")),
            eq(communityMessages.userId, userId),
          ),
        )
        .returning({ id: communityMessages.id });

      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json({ id: updated.id, deleted: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/community/messages/:id/react", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const messageId = param(req, "id");
      const { emoji } = z.object({ emoji: z.string().min(1).max(16) }).parse(req.body);

      const [message] = await db
        .select({ channelId: communityMessages.channelId })
        .from(communityMessages)
        .where(eq(communityMessages.id, messageId));
      if (!message) return res.status(404).json({ message: "Not found" });

      if (!(await canSee(userId, message.channelId))) {
        return res.status(404).json({ message: "Not found" });
      }

      // Presence is the state, so this toggles.
      const [existing] = await db
        .select({ id: messageReactions.id })
        .from(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.userId, userId),
            eq(messageReactions.emoji, emoji),
          ),
        );

      if (existing) {
        await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
        return res.json({ emoji, reacted: false });
      }

      await db
        .insert(messageReactions)
        .values({ messageId, userId, emoji })
        .onConflictDoNothing();

      res.status(201).json({ emoji, reacted: true });
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Search, bounded to the rooms this member can see.
   *
   * Postgres full-text over the generated tsvector column. `websearch_to_tsquery`
   * because it takes what people actually type — quoted phrases, `or`, `-not` —
   * without the query having to be well-formed.
   *
   * The snippet comes back as segments rather than markup — `ts_headline` does
   * not escape the text it highlights, so an HTML headline would make any
   * message a stored XSS. See shared/utils/highlight.ts.
   */
  app.get("/api/community/search", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const q = (req.query.q as string | undefined)?.trim();
      if (!q) return res.json([]);

      const ids = await visibleChannelIds(userId);
      if (ids.length === 0) return res.json([]);

      const channelFilter = sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      );

      const rows = await db.execute<{
        id: string;
        channel_id: string;
        root_id: string | null;
        user_id: string;
        body: string;
        created_at: string;
        rank: number;
        headline: string;
      }>(sql`
        SELECT m.id, m.channel_id, m.root_id, m.user_id, m.body, m.created_at,
               ts_rank(m.search_vector, websearch_to_tsquery('english', ${q})) AS rank,
               ts_headline('english', m.body, websearch_to_tsquery('english', ${q}),
                           ${headlineOptions()}) AS headline
        FROM community_messages m
        WHERE m.channel_id IN (${channelFilter})
          AND m.deleted_at IS NULL
          AND m.search_vector @@ websearch_to_tsquery('english', ${q})
        ORDER BY rank DESC, m.created_at DESC
        LIMIT 40
      `);

      const results = rows.rows ?? [];
      const authors = await authorsFor(results.map((r) => ({ userId: r.user_id })));

      res.json(
        results.map((r) => ({
          id: r.id,
          channelId: r.channel_id,
          rootId: r.root_id,
          body: r.body,
          headline: segmentHeadline(r.headline ?? ""),
          createdAt: r.created_at,
          author: authors.get(r.user_id) ?? null,
        })),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  app.get("/api/admin/community/channels", isAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(channels).orderBy(asc(channels.sortOrder));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/community/channels", isAdmin, async (req, res) => {
    try {
      const input = insertChannelSchema.parse(req.body);
      const [created] = await db.insert(channels).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/community/channels/:id", isAdmin, async (req, res) => {
    try {
      const input = insertChannelSchema.partial().parse(req.body);
      const [updated] = await db
        .update(channels)
        .set(input)
        .where(eq(channels.id, param(req, "id")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/community/channels/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(channels)
        .where(eq(channels.id, param(req, "id")))
        .returning({ id: channels.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/community/messages/:id", isAdmin, async (req, res) => {
    try {
      const [updated] = await db
        .update(communityMessages)
        .set({ deletedAt: new Date(), body: "" })
        .where(eq(communityMessages.id, param(req, "id")))
        .returning({ id: communityMessages.id });
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json({ id: updated.id, deleted: true });
    } catch (err) {
      fail(res, err);
    }
  });
}
