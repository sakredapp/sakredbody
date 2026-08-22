/**
 * One image, three sizes, two privacy classes — and one place that owns them.
 *
 * ── Why a media table rather than a URL column per feature ────────────────
 *
 * Because there are now three features that need a photograph and they do not
 * agree about who may see one. A Room photo is shown to a channel; a progress
 * photo is shown to its owner and, if they have one, their coach. Written as
 * `image_url` columns, that difference lives in whichever route happens to
 * render the column — which is to say it lives nowhere, and the first route
 * that forgets it publishes somebody's body to the community.
 *
 * So the privacy class is a property of the image, stored with it, and every
 * read goes through one authorizer that reads `purpose` and nothing else.
 *
 * ── Why bytes may live in Postgres ────────────────────────────────────────
 *
 * `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not set in production, so
 * `isStorageConfigured()` is false and every object-storage path is dead
 * there. That is a real missing credential and adding it is still the better
 * answer — but a feature that is only correct once somebody sets an
 * environment variable is a feature that ships broken.
 *
 * `profile_photos` already took this route and the note there sets the terms:
 * the bytes never travel with the parent row, they live in their own table,
 * and they are read only by the one route that serves them. The rule that
 * makes it bounded here is the *preparation* — the client sends a 320px
 * thumbnail and a 1280px display image, tens of kilobytes each, never the
 * eight-megapixel original. See `client/src/lib/imagePrep.ts`.
 *
 * A variant therefore carries either a `storage_path` or `bytes`, never
 * neither, and the store prefers object storage whenever it is configured. If
 * the credentials appear tomorrow, new uploads go there and old ones keep
 * working, with no migration and no broken image.
 *
 * ── What is deliberately not stored ───────────────────────────────────────
 *
 * The original file. Not its bytes, not its name, and not its EXIF. A camera
 * original carries GPS coordinates precise enough to name the room somebody
 * photographed themselves in, and the safest way to not leak that is to never
 * receive it. The canvas re-encode on the client drops every metadata block by
 * construction; what reaches this table is pixels and dimensions.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  uuid,
  timestamp,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { z } from "zod";

/** Drizzle has no first-class bytea. Same three lines as `profilePhotos`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Who may see this image, decided when it is created and never inferred.
 *
 * `room` — shown to whoever can read the channel it was posted in.
 * `progress` — shown to the member and their active assigned coach. Nobody
 * else, including an admin with `superviseCoaching`, which is an operational
 * capability over coaching and not a licence to look at bodies.
 */
export const MEDIA_PURPOSES = ["room", "progress"] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/**
 * The sizes, named for what they are for rather than their pixel count.
 *
 * `thumb` is what a list renders — a coach's client detail may show forty of
 * them, so it has to be small enough that forty is not a page load.
 * `display` is the one somebody actually looks at, sized for a phone at 2×.
 *
 * There is no `full`. Keeping the original was considered and rejected: it is
 * the copy carrying the metadata, it is two orders of magnitude larger than
 * the rest of this table, and no screen in the product renders above 1280.
 * A size nobody displays is a liability nobody audits.
 */
export const MEDIA_VARIANTS = ["thumb", "display"] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

export const VARIANT_MAX_EDGE: Record<MediaVariant, number> = {
  thumb: 320,
  display: 1280,
};

/** What the server will accept for one variant, after preparation. */
export const MAX_VARIANT_BYTES: Record<MediaVariant, number> = {
  thumb: 96 * 1024,
  display: 900 * 1024,
};

/**
 * What may be stored.
 *
 * Listed, not `image/*`: SVG is a document that runs script in the origin that
 * serves it, and this route serves from ours. The client only ever produces
 * the first two.
 */
export const ALLOWED_MEDIA_TYPES: readonly string[] = ["image/webp", "image/jpeg"];

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    /** Who took it. The only identity that survives a change of coach. */
    ownerUserId: varchar("owner_user_id").notNull(),

    /** A `MediaPurpose`. A CHECK in the migration holds it to the list. */
    purpose: text("purpose").notNull(),

    /**
     * What the phone handed the client, before preparation.
     *
     * Kept because it is the only way to know whether the preparation step is
     * doing its job in the field — a device whose source bytes equal its
     * prepared bytes is a device where the canvas path silently failed. It is
     * a dimension and a byte count, not content.
     */
    sourceWidth: integer("source_width"),
    sourceHeight: integer("source_height"),
    sourceBytes: integer("source_bytes"),
    prepareMs: integer("prepare_ms"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_media_assets_owner").on(t.ownerUserId, t.createdAt),
    index("idx_media_assets_purpose").on(t.purpose),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;

export const mediaVariants = pgTable(
  "media_variants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid("asset_id").notNull(),

    /** A `MediaVariant`. */
    variant: text("variant").notNull(),

    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    mime: text("mime").notNull(),

    /** Set when object storage is configured. Mutually exclusive with `bytes`. */
    storagePath: text("storage_path"),
    bytes: bytea("bytes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_media_variants_asset_variant").on(t.assetId, t.variant)],
);

export type MediaVariant_ = typeof mediaVariants.$inferSelect;

/**
 * What the client posts.
 *
 * Both variants in one request, deliberately. An asset with a display image
 * and no thumbnail renders a broken tile in every list, and two requests can
 * half-succeed; one request either produces a complete image or produces
 * nothing.
 */
export const uploadMediaSchema = z.object({
  purpose: z.enum(MEDIA_PURPOSES),
  sourceWidth: z.number().int().positive().max(60_000).optional(),
  sourceHeight: z.number().int().positive().max(60_000).optional(),
  sourceBytes: z.number().int().positive().max(200 * 1024 * 1024).optional(),
  prepareMs: z.number().int().min(0).max(600_000).optional(),
});

/** How a prepared image is described on the wire, next to its bytes. */
export const preparedVariantSchema = z.object({
  variant: z.enum(MEDIA_VARIANTS),
  width: z.number().int().positive().max(8000),
  height: z.number().int().positive().max(8000),
  mime: z.enum(["image/webp", "image/jpeg"]),
});

export type PreparedVariant = z.infer<typeof preparedVariantSchema>;
