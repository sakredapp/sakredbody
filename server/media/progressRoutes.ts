/**
 * A member's own photographs of their body, and the one other person who may
 * see them.
 *
 * ── The authorization rule, said once ─────────────────────────────────────
 *
 *   the member                    yes
 *   their active assigned coach   yes
 *   everybody else                404
 *
 * "Everybody else" includes admins. Every other coaching route in this
 * codebase treats `superviseCoaching` as read access — reasonably, because
 * running the coaching programme means being able to see a conversation that
 * has gone wrong. It is not a reason to look at somebody undressed, so this
 * file uses `activeRelationship` directly and never `requireCoachOf`.
 *
 * ── Why every refusal is a 404 ────────────────────────────────────────────
 *
 * A 403 says "there is something here". For a body that is itself the
 * disclosure: it tells a coach with no relationship that this member keeps
 * progress photographs, and tells a stranger which member ids are real. A
 * member who does not exist, a member with a different coach, and a member
 * whose relationship ended all read identically from outside.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { mediaAssets, progressPhotos } from "../../shared/schema.js";
import { createProgressPhotoSchema } from "../../shared/models/progressPhotos.js";
import { memberToday } from "../coaching/enrollment.js";
import { isActiveCoachOf } from "./access.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";

function userIdOf(req: Request): string | null {
  return (req.session as { userId?: string } | undefined)?.userId ?? null;
}

const NOT_FOUND = { message: "No such member" };

export type ProgressPhotoView = {
  id: string;
  assetId: string;
  onDate: string;
  note: string | null;
  createdAt: string | null;
};

/** The timeline, newest first. Ids and words — never bytes. */
async function timelineFor(userId: string): Promise<ProgressPhotoView[]> {
  const rows = await db
    .select()
    .from(progressPhotos)
    .where(eq(progressPhotos.userId, userId))
    .orderBy(desc(progressPhotos.onDate), desc(progressPhotos.createdAt));
  return rows.map((r) => ({
    id: r.id,
    assetId: r.assetId,
    onDate: r.onDate,
    note: r.note,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

export function registerProgressPhotoRoutes(app: Express) {
  /** My own timeline. */
  app.get("/api/progress-photos", isAuthenticated, async (req: Request, res: Response) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    res.json(await timelineFor(userId));
  });

  /**
   * Keep an already-uploaded image as a progress photo.
   *
   * Two things are checked rather than trusted: that the asset is the caller's
   * own, and that it was uploaded *as* a progress photo. The second is what
   * stops a Room photograph being re-filed into a private timeline — the
   * purpose decides who may read the bytes, and moving a row would leave the
   * asset readable by the channel it was posted in.
   */
  app.post("/api/progress-photos", isAuthenticated, async (req: Request, res: Response) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const parsed = createProgressPhotoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

    const [asset] = await db
      .select({ ownerUserId: mediaAssets.ownerUserId, purpose: mediaAssets.purpose })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, parsed.data.assetId))
      .limit(1);

    if (!asset || asset.ownerUserId !== userId || asset.purpose !== "progress") {
      return res.status(404).json({ message: "No such image" });
    }

    const onDate = parsed.data.onDate ?? (await memberToday(userId));

    const [row] = await db
      .insert(progressPhotos)
      .values({ userId, assetId: parsed.data.assetId, onDate, note: parsed.data.note ?? null })
      .returning();

    res.status(201).json({
      id: row.id,
      assetId: row.assetId,
      onDate: row.onDate,
      note: row.note,
      createdAt: row.createdAt?.toISOString() ?? null,
    });
  });

  /**
   * Delete one.
   *
   * Scoped by `userId` in the WHERE rather than fetched and then checked, so
   * there is no window and no branch to forget. The asset row goes with it —
   * a progress photograph removed from the timeline should not stay readable
   * by the coach through a bare asset id.
   */
  app.delete("/api/progress-photos/:id", isAuthenticated, async (req: Request, res: Response) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const [row] = await db
      .delete(progressPhotos)
      .where(and(eq(progressPhotos.id, String(req.params.id)), eq(progressPhotos.userId, userId)))
      .returning({ assetId: progressPhotos.assetId });

    if (!row) return res.status(404).json({ message: "No such photo" });

    await db.delete(mediaAssets).where(eq(mediaAssets.id, row.assetId));
    res.status(204).end();
  });

  /**
   * A coach reading their client's timeline.
   *
   * `isActiveCoachOf` and nothing else — see the note at the top of this file
   * for why `requireCoachOf` is deliberately not used here.
   */
  app.get(
    "/api/coach/clients/:memberId/progress-photos",
    isAuthenticated,
    async (req: Request, res: Response) => {
      const userId = userIdOf(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const memberId = String(req.params.memberId ?? "");
      if (!memberId || !(await isActiveCoachOf(userId, memberId))) {
        return res.status(404).json(NOT_FOUND);
      }

      res.json(await timelineFor(memberId));
    },
  );
}
