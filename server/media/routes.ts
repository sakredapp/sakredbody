/**
 * Receiving a prepared image, and handing one back to somebody entitled to it.
 *
 * ── What this route does not accept ───────────────────────────────────────
 *
 * A camera original. The client prepares two derivatives before it uploads
 * anything — see `client/src/lib/imagePrep.ts` — and the size ceilings here
 * are set just above what that produces, so a request carrying an
 * eight-megapixel JPEG is refused rather than quietly stored. That is not
 * belt-and-braces: an upload path that accepts originals is one somebody will
 * eventually point a slow connection at, and it is also the path that carries
 * the GPS coordinates the preparation step exists to remove.
 *
 * ── Why both variants arrive together ─────────────────────────────────────
 *
 * An asset with a display image and no thumbnail renders as a broken tile in
 * every list that shows it, and two requests can half-succeed. One request
 * either produces a complete image or produces nothing at all.
 *
 * ── Why reads are bytes and not redirects ─────────────────────────────────
 *
 * A signed URL handed to an `<img>` would be faster and would also be the
 * authorization model, which it must not be. The bytes come back through the
 * authenticated door, and the client turns the response into a blob URL that
 * dies with the page. See `server/media/store.ts` for the longer version.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { mediaAssets, mediaVariants } from "../../shared/schema.js";
import {
  ALLOWED_MEDIA_TYPES,
  MAX_VARIANT_BYTES,
  MEDIA_PURPOSES,
  MEDIA_VARIANTS,
  type MediaVariant,
} from "../../shared/models/media.js";
import { putVariant, readVariant } from "./store.js";
import { assetById, mayRead } from "./access.js";

/**
 * Memory storage, with a hard ceiling well under the display limit doubled.
 *
 * Multer's own limit is the first line of defence and runs before anything is
 * buffered; the per-variant checks below are the second, because one field
 * being small enough does not make the other one legal.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 2 },
});

/** A photograph is not a secret from a cache, but it is a secret from a proxy. */
const PRIVATE_CACHE = "private, max-age=86400, immutable";

function userIdOf(req: Request): string | null {
  return (req.session as { userId?: string } | undefined)?.userId ?? null;
}

export function registerMediaRoutes(app: Express) {
  /**
   * Store one prepared image.
   *
   * Everything about the asset is decided here from the session and the bytes
   * — the client contributes a purpose and its own measurements of the
   * original, and nothing it says is used to build a path or an identity.
   */
  app.post(
    "/api/media",
    isAuthenticated,
    upload.fields([{ name: "thumb", maxCount: 1 }, { name: "display", maxCount: 1 }]),
    async (req: Request, res: Response) => {
      const userId = userIdOf(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const purpose = String(req.body?.purpose ?? "");
      if (!(MEDIA_PURPOSES as readonly string[]).includes(purpose)) {
        return res.status(400).json({ message: "Unknown image purpose" });
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const parts: { variant: MediaVariant; file: Express.Multer.File }[] = [];
      for (const variant of MEDIA_VARIANTS) {
        const file = files?.[variant]?.[0];
        if (!file) return res.status(400).json({ message: `Missing the ${variant} image` });
        if (!ALLOWED_MEDIA_TYPES.includes(file.mimetype)) {
          return res.status(415).json({ message: "That image format isn't supported" });
        }
        if (file.size > MAX_VARIANT_BYTES[variant]) {
          /*
            Reached only by a client that skipped preparation — an honest one
            sends tens of kilobytes. Worth its own message, because the
            alternative is a silent truncation nobody notices until a coach
            opens a photograph that is half grey.
          */
          return res.status(413).json({ message: "That image is larger than expected" });
        }
        parts.push({ variant, file });
      }

      const dims = readDimensions(req.body);

      const [asset] = await db
        .insert(mediaAssets)
        .values({ ownerUserId: userId, purpose, ...dims })
        .returning({ id: mediaAssets.id });

      try {
        for (const { variant, file } of parts) {
          const size = imageSize(file.buffer, file.mimetype);
          const placed = await putVariant(userId, asset.id, variant, file.buffer, file.mimetype);
          await db.insert(mediaVariants).values({
            assetId: asset.id,
            variant,
            width: size?.width ?? 0,
            height: size?.height ?? 0,
            byteSize: file.size,
            mime: file.mimetype,
            storagePath: placed.storagePath,
            bytes: placed.bytes,
          });
        }
      } catch (err) {
        /*
          An asset whose variants failed halfway is unreadable and invisible —
          nothing references it yet — so it is removed rather than left for a
          cleanup job that does not exist. The cascade takes any variant rows
          that did land.
        */
        await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
        console.error("[media] upload failed:", (err as Error).message);
        return res.status(500).json({ message: "That image couldn't be saved" });
      }

      res.status(201).json({ assetId: asset.id });
    },
  );

  /**
   * Hand back one variant, if the caller may have it.
   *
   * Every refusal is the same 404. A 403 on a progress photo would tell a
   * stranger that a particular member has one.
   */
  app.get("/api/media/:assetId/:variant", isAuthenticated, async (req: Request, res: Response) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const variant = req.params.variant as MediaVariant;
    if (!(MEDIA_VARIANTS as readonly string[]).includes(variant)) {
      return res.status(404).json({ message: "No such image" });
    }

    const asset = await assetById(String(req.params.assetId));
    if (!asset) return res.status(404).json({ message: "No such image" });
    if (!(await mayRead(userId, asset))) return res.status(404).json({ message: "No such image" });

    const found = await readVariant(asset.id, variant);
    if (!found) return res.status(404).json({ message: "No such image" });

    res.setHeader("Content-Type", found.mime);
    res.setHeader("Cache-Control", PRIVATE_CACHE);
    res.setHeader("Content-Length", String(found.body.length));
    res.end(found.body);
  });
}

/**
 * What the client measured about the original, if it said.
 *
 * Optional throughout: these exist to tell us whether preparation is working
 * on real devices, and a missing number is worth less than a fabricated one.
 */
function readDimensions(body: Record<string, unknown>) {
  const num = (key: string): number | null => {
    const raw = Number(body?.[key]);
    return Number.isFinite(raw) && raw > 0 && raw < 1e9 ? Math.round(raw) : null;
  };
  return {
    sourceWidth: num("sourceWidth"),
    sourceHeight: num("sourceHeight"),
    sourceBytes: num("sourceBytes"),
    prepareMs: num("prepareMs"),
  };
}

/**
 * The pixel dimensions of a JPEG or WebP, read from its header.
 *
 * Twenty lines rather than an image library, because the only question being
 * asked is how wide the thing is and the answer is in the first few bytes of
 * both formats. It is also a cheap check that the bytes really are the format
 * the request claimed: a file whose header does not parse gets zeroes, which
 * is visible in the row rather than trusted.
 */
function imageSize(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === "image/webp") {
      // RIFF....WEBP, then a chunk that says which of the three encodings.
      if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8X") return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    // JPEG: walk the segments to the start-of-frame, which carries the size.
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  } catch {
    return null;
  }
}
