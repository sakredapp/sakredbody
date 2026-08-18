/**
 * The rules about who sees a photograph, asserted where they can regress.
 *
 * ── Why this is a source check and not a request ──────────────────────────
 *
 * The authorization here is three lines of code and one import. What makes it
 * correct is which import: `activeRelationship`, not `requireCoachOf`. Those
 * two differ by exactly one branch — `can(role, "superviseCoaching")` — and
 * every other coaching route in this codebase uses the wider one, correctly.
 *
 * So the realistic failure is not a broken query. It is somebody tidying an
 * inconsistency: noticing that the progress-photo routes are the odd ones out,
 * switching them to the shared middleware, and shipping a change where every
 * test passes and administrators can see members' bodies. A request-level test
 * would not catch that either, unless it happened to be run with an admin
 * account against a member who had photographs.
 *
 * This asserts the shape that makes the difference, in the two files that hold
 * it, and it fails loudly the moment either becomes ordinary.
 *
 * ── What it deliberately does not claim ───────────────────────────────────
 *
 * That the rules hold at runtime. That is `script/qa-auth-matrix.ts`'s job and
 * needs a database. These are the invariants that can be checked with no
 * database at all, run on every commit, which is the point.
 */

import { readFileSync } from "node:fs";
import { MEDIA_VARIANTS, VARIANT_MAX_EDGE, MAX_VARIANT_BYTES, ALLOWED_MEDIA_TYPES } from "../shared/models/media.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const read = (p: string) => readFileSync(p, "utf8");

/**
 * The file with its prose removed.
 *
 * Every one of these files *explains* why it does not use `requireCoachOf`, so
 * a naive grep for the name finds the sentence saying it is not used and
 * reports the opposite of the truth. The comments are the most valuable part
 * of these modules and must not be the thing that breaks their guard.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const progressRoutes = code("server/media/progressRoutes.ts");
const access = code("server/media/access.ts");
const mediaRoutes = code("server/media/routes.ts");
const store = code("server/media/store.ts");
const migration = read("supabase/2026-08-18-member-media.sql");

// ─── 1. The narrow gate, and nothing wider ────────────────────────────────

check(
  "progress-photo routes never reach for the coaching middleware",
  !/requireCoachOf/.test(progressRoutes),
  "requireCoachOf grants superviseCoaching; a progress photo is not coaching administration",
);

check(
  "progress-photo routes never test superviseCoaching directly either",
  !/superviseCoaching/.test(progressRoutes),
);

check(
  "the coach branch is an active relationship",
  /isActiveCoachOf/.test(progressRoutes),
);

check(
  "the asset authorizer uses activeRelationship for progress photos",
  /purpose === "progress"[\s\S]{0,400}activeRelationship/.test(access),
);

check(
  "and never grants on a capability",
  !/superviseCoaching|atLeast\(/.test(access),
);

check(
  "nobody is their own coach",
  /coachUserId === memberUserId\) return false/.test(access),
);

// ─── 2. Every refusal looks the same from outside ─────────────────────────

check(
  "progress-photo routes never answer 403",
  !/status\(403\)/.test(progressRoutes),
  "a 403 tells a stranger the photo exists",
);

check(
  "the media read route never answers 403 either",
  !/status\(403\)/.test(mediaRoutes),
);

check(
  "an unauthorized read and a missing image are the same message",
  (mediaRoutes.match(/No such image/g) ?? []).length >= 3,
);

// ─── 3. Room photos are gated by the room, not by holding the id ──────────

check(
  "a Room photo is checked against the channel it was posted in",
  /purpose === "room"[\s\S]{0,600}canSee\(viewerId/.test(access),
);

check(
  "an asset attached to nothing is visible only to its owner",
  /return false;\s*\n\s*}\s*\n\s*return false;/.test(access) || /for \(const post of posts\)[\s\S]{0,200}return false;/.test(access),
);

// ─── 4. Bytes never leave as a URL ────────────────────────────────────────

check(
  "the store never mints a public URL",
  !/getPublicUrl/.test(store),
  "a public object URL would become the authorization model",
);

check(
  "and never hands a signed URL to a caller",
  !/createSignedUrl/.test(store),
);

check(
  "the media bucket is created private",
  /public: false/.test(store),
);

check(
  "and a bucket that is public anyway says so loudly",
  /SECURITY: bucket/.test(store),
);

// ─── 5. The upload refuses a camera original ──────────────────────────────

check(
  "multer caps a single part below the display ceiling doubled",
  /fileSize: 1024 \* 1024/.test(mediaRoutes),
);

check(
  "each variant is checked against its own ceiling",
  /file\.size > MAX_VARIANT_BYTES\[variant\]/.test(mediaRoutes),
);

check(
  "the display ceiling is far below a phone photograph",
  MAX_VARIANT_BYTES.display < 1024 * 1024,
  `${MAX_VARIANT_BYTES.display} bytes`,
);

check(
  "a thumbnail is small enough that forty of them is not a page load",
  MAX_VARIANT_BYTES.thumb <= 96 * 1024,
);

check(
  "no variant is larger than anything the product renders",
  MEDIA_VARIANTS.every((v) => VARIANT_MAX_EDGE[v] <= 1280),
);

check(
  "SVG is not an accepted image",
  !ALLOWED_MEDIA_TYPES.includes("image/svg+xml"),
  "SVG is a document that runs script in the origin serving it",
);

// ─── 6. The database holds the rules the routes hold ──────────────────────

check(
  "a variant lives in the bucket or in the row, never neither and never both",
  /\(storage_path IS NULL\) <> \(bytes IS NULL\)/.test(migration),
);

check(
  "purpose is constrained to the two classes",
  /purpose IN \('room', 'progress'\)/.test(migration),
);

check(
  "byte size is capped in the database as well as the route",
  /byte_size > 0 AND byte_size <= \d+/.test(migration),
);

check(
  "deleting a message keeps the photograph, and deleting a workout keeps the message",
  (migration.match(/ON DELETE SET NULL/g) ?? []).length >= 2,
);

check(
  "one timeline entry per image",
  /CREATE UNIQUE INDEX uq_progress_photos_asset/.test(migration),
);

check(
  "the new tables are closed to clients",
  ["media_assets", "media_variants", "progress_photos"].every((t) =>
    new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).test(migration),
  ),
);

// ─── 7. Preparation happens before the network ────────────────────────────

const prep = code("client/src/lib/imagePrep.ts");

check(
  "orientation is applied rather than carried",
  /imageOrientation: "from-image"/.test(prep),
);

check(
  "the preview is the prepared image, not the original",
  /URL\.createObjectURL\(display\)/.test(prep),
);

check(
  "metadata is dropped by re-encoding rather than by a filter",
  /drawImage/.test(prep) && /toBlob/.test(prep),
);

check(
  "a WebP that silently became a PNG is not accepted",
  /webp\.type === "image\/webp"/.test(prep),
);

check(
  "nothing is enlarged",
  /Math\.min\(1, maxEdge/.test(prep),
);

// ─── 8. Telemetry carries measurements, never content ─────────────────────

check(
  "only dimensions and byte counts are sent alongside an upload",
  /sourceWidth[\s\S]{0,200}sourceBytes[\s\S]{0,200}prepareMs/.test(prep) &&
    !/exif|gps|location|latitude/i.test(prep),
);

if (failures.length) {
  console.error("\n✗ media privacy\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} media privacy assertions passed`);
