/**
 * Where a prepared image's bytes go, and how they come back.
 *
 * ── Two backends, one caller-visible shape ────────────────────────────────
 *
 * Object storage when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set;
 * a bytea column when they are not. Production is currently the second case —
 * see the note in `shared/models/media.ts` — and the whole point of this file
 * is that no route above it can tell which one it got.
 *
 * The bucket is private and shares `coaching-private`'s posture rather than
 * `coaching-uploads`'s: nothing here is fetched by an `<img>` pointed at a
 * public URL, because a public URL is not an authorization model. Bytes are
 * served by a route that has already decided the caller may have them.
 *
 * ── Why reads never return a URL ──────────────────────────────────────────
 *
 * Even a signed one. The native shells authenticate with a bearer token, not a
 * cookie, so an `<img src>` inside the app carries no identity at all — which
 * is why `profile_photos` needed an unguessable token in its path. An
 * unguessable path is acceptable for an avatar, which is already shown to
 * everyone. It is not acceptable for a progress photo. So this returns bytes
 * to a route, the route was reached through the authenticated fetch wrapper,
 * and the client turns the response into a blob URL that dies with the page.
 */

import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { mediaVariants } from "../../shared/schema.js";
import type { MediaVariant } from "../../shared/models/media.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export const MEDIA_BUCKET = "member-media";

export function isObjectStorageConfigured(): boolean {
  return supabase !== null;
}

/**
 * Create the private bucket if it is missing, and say so loudly if it is not
 * private. Asserted on every boot rather than trusted from creation time: a
 * bucket that already exists is not re-created, so one that was once public
 * would stay public and nothing else in the system would notice.
 */
export async function ensureMediaBucket(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, {
    public: false,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/webp", "image/jpeg"],
  });
  if (error && !/already exists/i.test(error.message)) {
    console.error("[media] could not create bucket:", error.message);
    return;
  }
  const { data } = await supabase.storage.getBucket(MEDIA_BUCKET);
  if (data?.public) {
    console.error(`[media] SECURITY: bucket ${MEDIA_BUCKET} is PUBLIC. Member photos are exposed.`);
  }
}

/**
 * The object key.
 *
 * Built only from values the server minted — the owner's id and the asset's
 * uuid. No filename from the client appears anywhere in it; a user-supplied
 * name in a path is how `../` gets to choose where a file lands.
 */
function objectPath(ownerUserId: string, assetId: string, variant: MediaVariant, mime: string): string {
  const ext = mime === "image/webp" ? "webp" : "jpg";
  return `${segment(ownerUserId)}/${segment(assetId)}-${variant}.${ext}`;
}

function segment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
  return cleaned.replace(/^\.+/, "_").slice(0, 128) || "_";
}

/**
 * Put one variant somewhere durable and return how to find it again.
 *
 * Returns the columns the row needs rather than writing the row itself, so the
 * caller can insert asset and variants in one transaction — a variant whose
 * bytes exist but whose row does not is an orphan nothing will ever collect.
 */
export async function putVariant(
  ownerUserId: string,
  assetId: string,
  variant: MediaVariant,
  body: Buffer,
  mime: string,
): Promise<{ storagePath: string | null; bytes: Buffer | null }> {
  if (!supabase) return { storagePath: null, bytes: body };

  const path = objectPath(ownerUserId, assetId, variant, mime);
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, body, { contentType: mime, upsert: false });

  if (error) {
    /*
      Falling back rather than failing. The member has already waited for a
      camera, a crop and an upload; losing all of that to a storage hiccup —
      when there is a working second backend right here — would be a choice to
      be tidy at their expense. The path column stays null, which is exactly
      how a row written before the credentials existed looks.
    */
    console.error("[media] object upload failed, storing inline:", error.message);
    return { storagePath: null, bytes: body };
  }
  return { storagePath: path, bytes: null };
}

/** The bytes of one variant, whichever backend holds them. */
export async function readVariant(
  assetId: string,
  variant: MediaVariant,
): Promise<{ body: Buffer; mime: string } | null> {
  const [row] = await db
    .select()
    .from(mediaVariants)
    .where(and(eq(mediaVariants.assetId, assetId), eq(mediaVariants.variant, variant)))
    .limit(1);
  if (!row) return null;

  if (row.bytes) return { body: Buffer.from(row.bytes), mime: row.mime };

  if (!row.storagePath || !supabase) return null;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(row.storagePath);
  if (error || !data) {
    console.error("[media] object download failed:", error?.message ?? "no body");
    return null;
  }
  return { body: Buffer.from(await data.arrayBuffer()), mime: row.mime };
}

/** Remove the bytes of every variant of an asset. Rows cascade separately. */
export async function removeAssetObjects(assetId: string): Promise<void> {
  if (!supabase) return;
  const rows = await db
    .select({ storagePath: mediaVariants.storagePath })
    .from(mediaVariants)
    .where(eq(mediaVariants.assetId, assetId));
  const paths = rows.map((r) => r.storagePath).filter((p): p is string => !!p);
  if (!paths.length) return;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  if (error) console.error("[media] could not remove objects:", error.message);
}
