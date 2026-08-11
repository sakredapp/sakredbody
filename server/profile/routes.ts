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
import { randomBytes } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { users } from "../../shared/models/auth.js";
import { profilePhotos, MAX_STORED_PHOTO_BYTES } from "../../shared/models/profilePhotos.js";
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
  /**
   * Optional in the payload and nullable in the column, which are two
   * different things and both wanted: a caller that omits `sex` leaves it
   * alone, and a caller that sends null clears it. Making it merely optional
   * would give a member no way to take the answer back.
   */
  sex: z.enum(["male", "female"]).optional().nullable(),
  /** `private` means asked and declined — distinct from null, which is unasked. */
  relationshipStatus: z.enum(["single", "dating", "married", "private"]).optional().nullable(),
});

/**
 * Keep the photo in our own database, and hand back a URL that serves it.
 *
 * The fallback for a deployment with no object-storage credentials — which is
 * every deployment today. See shared/models/profilePhotos.ts for why bytes in
 * Postgres is defensible for this one thing and not in general.
 *
 * Absolute rather than relative, because `<img src>` in the native shell
 * resolves against `capacitor://localhost` and never reaches the server. Built
 * from the request, so it is right in development, on a preview and in
 * production without another environment variable to get wrong.
 */
async function storeLocally(
  req: Request,
  userId: string,
  file: Express.Multer.File,
): Promise<string | null> {
  if (file.buffer.length > MAX_STORED_PHOTO_BYTES) return null;

  // New token each time, so a replaced photo cannot be served from a cache
  // keyed on the old URL — which is the whole reason an avatar update can look
  // like it silently failed.
  const token = randomBytes(24).toString("base64url");

  await db
    .insert(profilePhotos)
    .values({ userId, token, bytes: file.buffer, mime: file.mimetype, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: profilePhotos.userId,
      set: { token, bytes: file.buffer, mime: file.mimetype, updatedAt: new Date() },
    });

  return `${req.protocol}://${req.get("host")}/api/photo/${token}`;
}

export function registerProfileRoutes(app: Express): void {
  /**
   * Serve a stored photo.
   *
   * Deliberately unauthenticated. Avatars are rendered by `<img>`, which does
   * not pass through the native fetch wrapper and so cannot carry a bearer
   * token — the same reason a Supabase public bucket is public. The token is
   * what protects it, and it is 24 random bytes rather than a user id.
   */
  app.get("/api/photo/:token", async (req: Request, res: Response) => {
    try {
      const [row] = await db
        .select({ bytes: profilePhotos.bytes, mime: profilePhotos.mime })
        .from(profilePhotos)
        .where(eq(profilePhotos.token, String(req.params.token)))
        .limit(1);
      if (!row) return res.status(404).end();

      // Immutable is safe because a new photo gets a new token — the URL
      // itself is the version.
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Type", row.mime);

      // Normalised rather than trusted. Postgres drivers disagree about
      // whether bytea comes back as a Buffer or a Uint8Array, and `res.send`
      // JSON-encodes the second one — which serves a photo as a few hundred
      // kilobytes of `{"0":255,"1":216,…}` with an image content type on it.
      const bytes = row.bytes as unknown;
      res.send(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as Uint8Array));
    } catch (err) {
      trackError("profile.photoServe", err);
      res.status(500).end();
    }
  });

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
        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file) return res.status(400).json({ message: "No photo provided" });

        const userId = req.session!.userId!;

        /**
         * Object storage where it is configured, our own database where it
         * isn't.
         *
         * This route used to 503 with "Photo storage isn't set up yet", which
         * was an accurate message about a missing credential and a dead end on
         * the first screen a member sees. Adding the credential is still worth
         * doing; the member should not be the one waiting for it.
         */
        const url = isStorageConfigured()
          ? await uploadFile(userId, file.buffer, file.originalname, file.mimetype)
          : await storeLocally(req, userId, file);

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
      const userId = req.session!.userId!;
      // Unlike the storage bucket, a locally-stored photo *is* deleted. It is
      // one statement against a row we own, and leaving somebody's face in our
      // database after they asked us to remove it is a different kind of
      // orphan from an unreferenced object in a bucket.
      await db.delete(profilePhotos).where(eq(profilePhotos.userId, userId));

      const [saved] = await db
        .update(users)
        .set({ profileImageUrl: null, updatedAt: new Date() })
        .where(eq(users.id, userId))
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
          // Only written when the key is present. `undefined` means the
          // caller said nothing about sex and the stored answer stands;
          // an explicit null clears it. See the note on the schema.
          ...(input.sex !== undefined ? { sex: input.sex } : {}),
          ...(input.relationshipStatus !== undefined
            ? { relationshipStatus: input.relationshipStatus }
            : {}),
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
