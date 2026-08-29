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
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { db } from "../db.js";
import { and, asc, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import {
  channels,
  communityMessages,
  messageReactions,
  membershipTiers,
  offeringRegistrations,
  channelMembers,
  users,
  insertChannelSchema,
  postMessageSchema,
  editMessageSchema,
  MAX_THREAD_DEPTH,
} from "../../shared/schema.js";
import { readSharedWorkout } from "../../shared/models/community.js";
import { headlineOptions, segmentHeadline } from "../../shared/utils/highlight.js";
import { blockedBy } from "../moderation/index.js";
import { uploadFile } from "../supabaseStorage.js";
import { ownsSession, publishedWorkout } from "./sharedWorkout.js";
import { mediaAssets } from "../../shared/schema.js";

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
      message: zodMessage(err),
      field: err.errors[0].path.join("."),
    });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

/**
 * What a message looks like on the wire.
 *
 * One place decides, which is why the workout card is assembled here rather
 * than at each call site: the stored snapshot is the card, and the rule about
 * what a tombstone shows has to apply to it as surely as to the words.
 *
 * The raw column does not go out. Sending both it and the parsed card would
 * put every published workout on the wire twice.
 */
function present(m: typeof communityMessages.$inferSelect) {
  const { sharedWorkout, ...rest } = m;
  // The row survives so replies underneath it keep their shape. The words
  // don't — deleting must actually delete what was said. That includes what
  // was shown: a tombstone that kept rendering the photograph would mean
  // deleting a post removed the caption and left the picture, and one that
  // kept rendering the workout would leave the lift.
  if (m.deletedAt) {
    return {
      ...rest,
      body: "",
      userId: "",
      imageAssetId: null,
      sharedSessionId: null,
      workout: null,
      deleted: true,
    };
  }
  return { ...rest, workout: readSharedWorkout(sharedWorkout) };
}

/**
 * A deleted message is kept only when something hangs off it.
 *
 * The tombstone exists so replies underneath a deleted parent keep their
 * parent and the conversation keeps its shape. Nothing hangs off a leaf, so
 * there is nothing for its tombstone to hold up — and leaving one there is
 * what a member reads as "I deleted it and it is still on my screen". They
 * are right: deleting the only thing you posted should remove the post, not
 * replace it with a line about the post.
 *
 * `reply_count` is every descendant, not just direct children (see the
 * recursive UPDATE in the post handler), so zero means leaf, and removing a
 * leaf can never orphan anything below it.
 */
const stillShown = or(isNull(communityMessages.deletedAt), gt(communityMessages.replyCount, 0));

/**
 * Take a reply back off every ancestor's count.
 *
 * The mirror of the walk in the post handler, and the reason a tombstone can
 * disappear later: delete the last reply under an already-deleted parent and
 * the parent's count reaches zero, so the next read drops both. Without this
 * the parent is a permanent tombstone advertising "1 reply" to a thread that
 * has none.
 *
 * `greatest(…, 0)` because a count that has drifted must not go negative and
 * make a live message invisible.
 */
async function forgetReply(messageId: string) {
  await db.execute(sql`
    WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM community_messages
       WHERE id = (SELECT parent_id FROM community_messages WHERE id = ${messageId})
      UNION ALL
      SELECT m.id, m.parent_id
        FROM community_messages m
        JOIN ancestors a ON m.id = a.parent_id
    )
    UPDATE community_messages
       SET reply_count = greatest(reply_count - 1, 0)
     WHERE id IN (SELECT id FROM ancestors)
  `);
}

// ─── The gate ──────────────────────────────────────────────────────────────

/**
 * Which channels this member may see, as ids.
 *
 * Three ways in, checked in this order:
 *
 *   1. An admin sees everything. This bypass is the reason the rule must never
 *      be reimplemented casually — a copy that forgets it locks out the only
 *      people who can fix anything, which has already happened once here.
 *   2. An explicit invitation, from `channel_members`. This is how a room for
 *      six named people works: a coaching pod, a founders' circle.
 *   3. Otherwise the open rule — a confirmed registration for an offering's
 *      room, or enough tier rank for a general one.
 *
 * `is_private` cuts off the third path entirely. A private room is the member
 * list and nothing else, whatever tier somebody holds.
 *
 * The same rule is written in SQL as `can_see_channel` — see
 * supabase/private-rooms.sql. If one changes, change the other.
 */
export async function visibleChannelIds(userId: string): Promise<string[]> {
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
    .select({
      id: channels.id,
      minTierRank: channels.minTierRank,
      offeringId: channels.offeringId,
      isPrivate: channels.isPrivate,
    })
    .from(channels)
    .where(eq(channels.isActive, true));

  if (admin) return rows.map((r) => r.id);

  // Explicit invitations, in one query rather than one per private room.
  const invited = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId));
  const invitedTo = new Set(invited.map((r) => r.channelId));

  // One query for every offering this member is confirmed in, rather than one
  // per gated channel.
  const registered = await db
    .select({ offeringId: offeringRegistrations.offeringId })
    .from(offeringRegistrations)
    .where(
      and(
        eq(offeringRegistrations.userId, userId),
        eq(offeringRegistrations.status, "confirmed"),
      ),
    );
  const mine = new Set(registered.map((r) => r.offeringId));

  return rows
    .filter((c) => {
      if (invitedTo.has(c.id)) return true;
      // A private room stops here: no tier and no offering opens it.
      if (c.isPrivate) return false;
      return c.offeringId ? mine.has(c.offeringId) : rank >= c.minTierRank;
    })
    .map((c) => c.id);
}

export async function canSee(userId: string, channelId: string): Promise<boolean> {
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

      // Blocked authors vanish from the room. `notInArray` on an empty list is
      // `not in ()`, which Postgres rejects as a syntax error, so the filter is
      // omitted entirely when nobody is blocked — which is the common case.
      const hidden = await blockedBy(userId);

      const rows = await db
        .select()
        .from(communityMessages)
        .where(
          and(
            eq(communityMessages.channelId, channelId),
            isNull(communityMessages.parentId),
            stillShown,
            ...(hidden.length ? [notInArray(communityMessages.userId, hidden)] : []),
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

      // Blocked replies disappear from the thread too. The root is filtered
      // by the same rule: opening a thread whose author you blocked, from a
      // link, should not be the one place they reappear.
      const hidden = await blockedBy(userId);

      const rows = await db
        .select()
        .from(communityMessages)
        .where(
          and(
            or(eq(communityMessages.rootId, rootId), eq(communityMessages.id, rootId)),
            stillShown,
            ...(hidden.length ? [notInArray(communityMessages.userId, hidden)] : []),
          ),
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

  /**
   * Upload a voice memo and get back a URL to attach to a message.
   *
   * Separate from posting on purpose. Recording, uploading and sending are
   * three things that fail differently — a member who records ninety seconds
   * and then loses signal should not lose the recording because the message
   * insert failed with it.
   *
   * The body arrives as base64 rather than multipart because this app has no
   * multipart parser and adding one for a single endpoint is more moving parts
   * than the 33% size overhead costs. A ten-minute memo at 32kbps is about
   * 2.4MB encoded, comfortably inside the JSON limit.
   */
  app.post("/api/community/audio", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = z
        .object({
          data: z.string().min(1).max(14_000_000),
          mime: z.string().min(1).max(80),
          durationSeconds: z.number().int().min(1).max(600),
        })
        .parse(req.body ?? {});

      // Whitelist rather than trust: this string decides the bucket's
      // content-type and what a browser will later try to decode.
      const allowed = [
        "audio/mp4", "audio/m4a", "audio/aac", "audio/mpeg",
        "audio/webm", "audio/ogg", "audio/wav",
      ];
      const base = input.mime.split(";")[0].trim().toLowerCase();
      if (!allowed.includes(base)) {
        return res.status(400).json({ message: `Can't accept ${base} recordings.` });
      }

      const buffer = Buffer.from(input.data, "base64");
      if (buffer.length === 0) {
        return res.status(400).json({ message: "That recording came through empty." });
      }
      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(413).json({ message: "That recording is too long to upload." });
      }

      const ext = base === "audio/mp4" || base === "audio/m4a" ? "m4a"
        : base === "audio/webm" ? "webm"
        : base === "audio/ogg" ? "ogg"
        : base === "audio/wav" ? "wav"
        : "aac";

      const url = await uploadFile(userId, buffer, `memo.${ext}`, base);
      if (!url) return res.status(500).json({ message: "Couldn't store that recording." });

      res.status(201).json({ url, mime: base, durationSeconds: input.durationSeconds });
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

      /*
        Both attachments are checked against the poster, not merely accepted.

        An image id is a uuid somebody could have seen in their own timeline;
        without this, posting one they do not own would publish another
        member's photograph into a room. The purpose check is the second half:
        an asset uploaded as `progress` is readable by that member's coach and
        nobody else, and attaching one to a message would leave a photo in the
        feed that most of the room renders as a broken tile — and the rest
        renders as a private photograph. Sharing a progress photo to the Room
        is a separate act that uploads a separate `room` asset.
      */
      if (input.imageAssetId) {
        const [asset] = await db
          .select({ ownerUserId: mediaAssets.ownerUserId, purpose: mediaAssets.purpose })
          .from(mediaAssets)
          .where(eq(mediaAssets.id, input.imageAssetId));
        if (!asset || asset.ownerUserId !== userId || asset.purpose !== "room") {
          return res.status(404).json({ message: "No such image" });
        }
      }

      /*
        The workout is copied here, not referenced.

        Ownership first — a session id is a uuid somebody could have seen, and
        without this a member could publish a card built from another member's
        training. Then the copy: what goes into the row is what the Room shows
        forever, and it is taken once, now, while the member is looking at the
        thing they chose to share.
      */
      let workout = null;
      if (input.sharedSessionId) {
        if (!(await ownsSession(userId, input.sharedSessionId))) {
          return res.status(404).json({ message: "No such workout" });
        }
        workout = await publishedWorkout(input.sharedSessionId);
        if (!workout) return res.status(404).json({ message: "No such workout" });
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
          audioUrl: input.audioUrl ?? null,
          audioMime: input.audioMime ?? null,
          audioDurationSeconds: input.audioDurationSeconds ?? null,
          imageAssetId: input.imageAssetId ?? null,
          sharedSessionId: input.sharedSessionId ?? null,
          sharedWorkout: workout,
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

      /*
        A tombstone when something hangs off it, and gone when nothing does —
        see `stillShown`. Either way the words go here; whether the row is
        still rendered is decided on read, by whether it is holding up a
        conversation.

        `isNull(deletedAt)` so deleting twice is a 404 rather than a second
        trip through `forgetReply`, which would take the same reply off its
        ancestors' counts twice and hide a live message.
      */
      const [updated] = await db
        .update(communityMessages)
        .set({ deletedAt: new Date(), body: "" })
        .where(
          and(
            eq(communityMessages.id, param(req, "id")),
            eq(communityMessages.userId, userId),
            isNull(communityMessages.deletedAt),
          ),
        )
        .returning({ id: communityMessages.id });

      if (!updated) return res.status(404).json({ message: "Not found" });
      await forgetReply(updated.id);
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
          -- Blocked authors are absent from search too. A NOT EXISTS rather
          -- than a NOT IN over an array: drizzle flattens a JS array into one
          -- bind parameter per element, which is what turned an ANY(...)
          -- comparison into a syntax error and took every login to a 500
          -- earlier. One scalar parameter cannot go wrong that way.
          --
          -- No backticks in this comment, deliberately: it lives inside a
          -- tagged template literal, and a backtick here closes the string.
          AND NOT EXISTS (
            SELECT 1 FROM user_blocks b
            WHERE b.blocker_id = ${userId} AND b.blocked_id = m.user_id
          )
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

  /**
   * Who is in a private room.
   *
   * Returns everyone invited, plus enough of the member record to show a name
   * — the join is here rather than in the client because the client would
   * otherwise need every member loaded to render six of them.
   */
  app.get("/api/admin/community/channels/:id/members", isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          id: channelMembers.id,
          userId: channelMembers.userId,
          createdAt: channelMembers.createdAt,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(channelMembers)
        .leftJoin(users, eq(channelMembers.userId, users.id))
        .where(eq(channelMembers.channelId, param(req, "id")))
        .orderBy(asc(users.firstName));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/community/channels/:id/members", isAdmin, async (req, res) => {
    try {
      const channelId = param(req, "id");
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body ?? {});

      const [channel] = await db.select({ id: channels.id }).from(channels).where(eq(channels.id, channelId));
      if (!channel) return res.status(404).json({ message: "No such room" });

      const [member] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!member) return res.status(404).json({ message: "No such member" });

      // Adding somebody twice is the same intent, not an error.
      const [row] = await db
        .insert(channelMembers)
        .values({ channelId, userId, addedBy: req.session!.userId! })
        .onConflictDoNothing()
        .returning();

      res.status(201).json(row ?? { channelId, userId, existing: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/community/channels/:id/members/:userId", isAdmin, async (req, res) => {
    try {
      await db
        .delete(channelMembers)
        .where(
          and(
            eq(channelMembers.channelId, param(req, "id")),
            eq(channelMembers.userId, param(req, "userId")),
          ),
        );
      res.json({ removed: true });
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
        .where(
          and(
            eq(communityMessages.id, param(req, "id")),
            isNull(communityMessages.deletedAt),
          ),
        )
        .returning({ id: communityMessages.id });
      if (!updated) return res.status(404).json({ message: "Not found" });
      await forgetReply(updated.id);
      res.json({ id: updated.id, deleted: true });
    } catch (err) {
      fail(res, err);
    }
  });
}
