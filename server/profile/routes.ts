/**
 * The member's own profile — the photo, and the name on it.
 *
 * Small and separate because it is the only place a member writes to their own
 * `users` row. Everything else about them lives in a side table with its own
 * routes; putting a photo upload inside auth would put multipart parsing on
 * the same file as the login path, which is the file that deserves the fewest
 * moving parts in it.
 *
 * Note the deliberate asymmetry with user_cosmology: `users.firstName` is the
 * display name and changes whenever someone wants it to, while
 * `user_cosmology.birthName` is the name given at birth and must not follow it.
 * People marry. Changing what a screen calls you should never quietly change
 * your numbers.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { users } from "../../shared/models/auth.js";
import { isAuthenticated } from "../auth/index.js";
import { uploadFile, isStorageConfigured } from "../supabaseStorage.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { trackError } from "../telemetry/index.js";

/**
 * Images only, and smaller than the coaching uploader allows.
 *
 * An avatar renders at 32 pixels. Ten megabytes of it is a phone camera's raw
 * output being carried across a mobile network so it can be drawn the size of
 * a fingernail — the member pays for that in upload time on the one screen
 * where they are deciding whether this app is any good.
 *
 * The mime allow-list is the real check. `fileFilter` sees only what the
 * client claimed, so this is a courtesy to honest clients rather than a
 * security boundary; the boundary is that the bucket serves whatever it is
 * given as an attachment and nothing here is ever executed.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Photos only — JPEG, PNG, WebP or HEIC."));
  },
});

const nameSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional().nullable(),
});

export function registerProfileRoutes(app: Express): void {
  /**
   * Replace the profile photo.
   *
   * The previous file is deliberately not deleted. The bucket is public-read
   * and the URL is unguessable, so an orphan costs a few kilobytes; deleting
   * it costs a round trip on the request a member is waiting on, and gets it
   * wrong the moment two devices upload at once. Sweeping is a housekeeping
   * job, not part of saving a picture.
   */
  app.post(
    "/api/profile/photo",
    isAuthenticated,
    upload.single("photo"),
    async (req: Request, res: Response) => {
      try {
        if (!isStorageConfigured()) {
          return res.status(503).json({ message: "Photo storage isn't set up yet." });
        }
        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file) return res.status(400).json({ message: "No photo provided" });

        const userId = req.session!.userId!;
        const url = await uploadFile(userId, file.buffer, file.originalname, file.mimetype);
        if (!url) return res.status(502).json({ message: "That didn't upload. Try again." });

        const [saved] = await db
          .update(users)
          .set({ profileImageUrl: url, updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();

        const { password: _, ...safe } = saved;
        res.json(safe);
      } catch (err: unknown) {
        // Multer rejects oversized and wrong-typed files by throwing, and its
        // message is the one worth showing — "File too large" beats a 500.
        if (err instanceof Error && /file too large|photos only/i.test(err.message)) {
          return res.status(400).json({ message: err.message });
        }
        trackError("profile.photo", err);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  /** Remove it, and go back to initials. */
  app.delete("/api/profile/photo", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const [saved] = await db
        .update(users)
        .set({ profileImageUrl: null, updatedAt: new Date() })
        .where(eq(users.id, req.session!.userId!))
        .returning();
      const { password: _, ...safe } = saved;
      res.json(safe);
    } catch (err) {
      trackError("profile.photo", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /** The display name. Not the birth name — see the note at the top. */
  app.patch("/api/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const input = nameSchema.parse(req.body);
      const [saved] = await db
        .update(users)
        .set({
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.session!.userId!))
        .returning();
      const { password: _, ...safe } = saved;
      res.json(safe);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err) });
      }
      trackError("profile.update", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
