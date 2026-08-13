/**
 * Where coaching files live, and how they are handed out.
 *
 * ── Why this is not `server/supabaseStorage.ts` ───────────────────────────
 *
 * That module owns one bucket, `coaching-uploads`, created with `public: true`
 * — and three features write to it: coaching attachments, community voice
 * memos, and profile photos. A profile photo is meant to be fetched by other
 * members' browsers; a member's blood panel is not.
 *
 * So flipping that bucket to private would have broken avatars to fix
 * coaching, and leaving it public leaves lab results retrievable by anyone
 * holding a link. The bucket was doing two jobs with one setting. This is the
 * second bucket, private, and the public one keeps the assets that are
 * genuinely public.
 *
 * (The community memo case is worth a look on its own — voice notes in
 * tier-gated channels are also sitting on public URLs. It belongs to another
 * subsystem and is recorded rather than swept into this change.)
 *
 * ── Signed URLs are minted, never stored ──────────────────────────────────
 *
 * A signed URL is a short-lived capability. Persisting one puts a value in the
 * database that becomes wrong on a timer, and persisting an *unsigned* one is
 * exactly the problem being left behind. The row identifies the object; the
 * URL is created per request, after the caller has been authorized, and dies
 * on its own.
 *
 * The URL is therefore never the proof of anything. Possession of a link that
 * has not yet expired lets somebody fetch one file for a few minutes; it
 * establishes no session, reaches no second file, and survives nothing.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

/** Named here and stored on every row, so moving buckets is never a guess. */
export const COACHING_BUCKET = "coaching-private";

/** Long enough to load a PDF on a bad connection; short enough to be useless later. */
const SIGNED_URL_SECONDS = 300;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * What may be sent.
 *
 * Listed rather than pattern-matched: `image/*` would accept SVG, which is a
 * document that can execute script in the origin that serves it.
 */
export const ALLOWED_ATTACHMENT_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export function isStorageConfigured(): boolean {
  return supabase !== null;
}

/**
 * Create the private bucket if it is missing. Idempotent, safe on every boot.
 *
 * `public: false` is the entire point of this file and is asserted below on
 * every start rather than trusted from creation time — a bucket that already
 * exists is not re-created, so a bucket that was once public would stay public
 * and nothing would say so.
 */
export async function ensureCoachingBucket(): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase.storage.createBucket(COACHING_BUCKET, {
    public: false,
    fileSizeLimit: MAX_ATTACHMENT_BYTES,
    allowedMimeTypes: [...ALLOWED_ATTACHMENT_TYPES],
  });

  if (error && !/already exists/i.test(error.message)) {
    console.error("[coaching] could not create private bucket:", error.message);
    return;
  }

  const { data } = await supabase.storage.getBucket(COACHING_BUCKET);
  if (data?.public) {
    // Loud, because every attachment in it is readable by anyone with a link
    // and nothing else in the system will notice.
    console.error(
      `[coaching] SECURITY: bucket ${COACHING_BUCKET} is PUBLIC. Coaching attachments are exposed.`,
    );
  }
}

/**
 * The object key for a file.
 *
 * Built entirely from values the server controls. The member's own id is the
 * prefix, a uuid is the name, and the original filename does not appear — a
 * user-supplied name in a path is how `../` and unicode lookalikes get to
 * decide where a file lands. The real name is kept in the database column,
 * where it is data rather than a path.
 */
export function attachmentPath(memberUserId: string, id: string, mimeType: string): string {
  const ext = EXTENSIONS[mimeType] ?? "bin";
  return `${segment(memberUserId)}/${segment(id)}.${ext}`;
}

/**
 * One path segment, containing only things that cannot mean anything else.
 *
 * Both inputs are already ours — a database key and a uuid we just minted — so
 * on today's code this changes nothing. It is here because "already ours" is a
 * property of the callers, and callers get added. A path builder that is safe
 * only while every caller remembers to be careful is a path builder that will
 * eventually be handed something careless; this one cannot emit `..`, a slash,
 * or a leading dot whatever it is given.
 */
function segment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
  return cleaned.replace(/^\.+/, "_").slice(0, 128) || "_";
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export async function putAttachment(
  path: string,
  body: Buffer,
  mimeType: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.storage
    .from(COACHING_BUCKET)
    .upload(path, body, { contentType: mimeType, upsert: false });
  if (error) {
    // The path is ours and carries a member id, so it is not logged.
    console.error("[coaching] attachment upload failed:", error.message);
    return false;
  }
  return true;
}

/**
 * A short-lived URL for one object, minted after the caller was authorized.
 *
 * Deliberately returns null rather than throwing on failure: the caller turns
 * that into the same 404 an unauthorized request gets, so a missing object and
 * a forbidden one are indistinguishable from outside.
 */
export async function signedUrlFor(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(COACHING_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[coaching] could not sign attachment URL:", error?.message ?? "no url");
    return null;
  }
  return data.signedUrl;
}

export async function removeAttachment(path: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.from(COACHING_BUCKET).remove([path]);
  if (error) console.error("[coaching] could not remove attachment:", error.message);
}
