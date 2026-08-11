/**
 * Where an avatar lives when object storage isn't configured.
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 *
 * Uploading a profile photo answered "Photo storage isn't set up yet." on a
 * real device, because `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not
 * set in production — so `isStorageConfigured()` is false and the route 503s
 * before it does anything. That is a true error message about a real missing
 * credential, and it is also a dead end on the first screen a member sees.
 *
 * Adding the credentials is still the better long-term answer and costs
 * nothing to do later; this is what makes the feature work in the meantime,
 * with no configuration at all.
 *
 * ── Why bytes in Postgres is defensible here and not in general ───────────
 *
 * Because of what the client now sends. `PhotoCrop` outputs a 512px square
 * JPEG — around 60KB — rather than the four to eight megabytes a phone camera
 * produces, so a row is small, bounded by a hard limit in the route, and read
 * exactly as often as an avatar is fetched cold.
 *
 * The rule that keeps it honest: the bytes never travel with the user row.
 * They live in their own table, are selected only by the one route that serves
 * them, and `users.profile_image_url` holds a URL exactly as it does for a
 * Supabase-hosted photo. Every consumer stays identical, and if the storage
 * credentials appear tomorrow, new uploads go there instead with no migration
 * and no broken links.
 *
 * ── Why the URL carries a token ───────────────────────────────────────────
 *
 * Avatars are rendered by `<img>`, which does not go through the native fetch
 * wrapper and cannot carry a bearer token — so the route serving them has to
 * be reachable without a session, exactly as a public storage bucket is. A
 * random token in the path is what a Supabase public URL relies on too:
 * unguessable rather than unauthenticated-but-enumerable, which is what using
 * the user id would have been.
 */

import { sql } from "drizzle-orm";
import { pgTable, varchar, text, customType, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Drizzle has no first-class bytea, and the shape it wants is small enough to
 * declare in place rather than reach for a dependency.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const profilePhotos = pgTable(
  "profile_photos",
  {
    userId: varchar("user_id").primaryKey(),
    /** The unguessable path segment. See the note above. */
    token: text("token").notNull(),
    bytes: bytea("bytes").notNull(),
    mime: text("mime").notNull().default("image/jpeg"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_profile_photos_token").on(t.token)],
);

export type ProfilePhoto = typeof profilePhotos.$inferSelect;

/**
 * The ceiling, enforced in the route.
 *
 * Well above what the cropper produces and far below what a phone would send,
 * so an honest client always fits and a hand-rolled request cannot put a
 * megabyte of anything into a row.
 */
export const MAX_STORED_PHOTO_BYTES = 400 * 1024;
