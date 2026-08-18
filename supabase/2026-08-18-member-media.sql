-- Member media: Room photographs, private progress photographs, and the
-- workout a Room post can be about.
--
-- Runs whole-file through the Management API, so it is written to be safe to
-- run twice: every object is created IF NOT EXISTS or dropped first. One bad
-- statement rolls the entire file back, which is why the order below is
-- tables → constraints → indexes → RLS, never interleaved.
--
-- ── On RLS with no policies ───────────────────────────────────────────────
--
-- These three tables are enabled with zero policies, which is the deliberate
-- server-only posture used across this database: the anon and authenticated
-- roles reach nothing, and the API reads them through service_role, which
-- bypasses RLS. The authorization that matters lives in server/media/access.ts
-- and is tested there. RLS-on-with-zero-policies is closed, not open — but it
-- is also the failure that looks like success, so verify with pg_policies
-- after applying rather than trusting the success response.

-- ─── 1. TABLES ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS media_assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  varchar NOT NULL,
  purpose        text NOT NULL,
  source_width   integer,
  source_height  integer,
  source_bytes   integer,
  prepare_ms     integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     uuid NOT NULL,
  variant      text NOT NULL,
  width        integer NOT NULL,
  height       integer NOT NULL,
  byte_size    integer NOT NULL,
  mime         text NOT NULL,
  storage_path text,
  bytes        bytea,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS progress_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,
  asset_id   uuid NOT NULL,
  on_date    date NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. COLUMNS ON EXISTING TABLES ────────────────────────────────────────

ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS image_asset_id uuid;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS shared_session_id uuid;

-- ─── 3. CONSTRAINTS ───────────────────────────────────────────────────────

ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_purpose_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_purpose_check
  CHECK (purpose IN ('room', 'progress'));

ALTER TABLE media_variants DROP CONSTRAINT IF EXISTS media_variants_variant_check;
ALTER TABLE media_variants ADD CONSTRAINT media_variants_variant_check
  CHECK (variant IN ('thumb', 'display'));

ALTER TABLE media_variants DROP CONSTRAINT IF EXISTS media_variants_mime_check;
ALTER TABLE media_variants ADD CONSTRAINT media_variants_mime_check
  CHECK (mime IN ('image/webp', 'image/jpeg'));

-- The rule that keeps a variant readable: it lives in the bucket or in this
-- row, and exactly one of those is true. Without it a row can be written that
-- points nowhere and renders as a broken tile forever.
ALTER TABLE media_variants DROP CONSTRAINT IF EXISTS media_variants_body_check;
ALTER TABLE media_variants ADD CONSTRAINT media_variants_body_check
  CHECK ((storage_path IS NULL) <> (bytes IS NULL));

-- A ceiling in the database as well as the route. The route is the thing that
-- can be changed by an edit; this is the thing that cannot be forgotten.
ALTER TABLE media_variants DROP CONSTRAINT IF EXISTS media_variants_size_check;
ALTER TABLE media_variants ADD CONSTRAINT media_variants_size_check
  CHECK (byte_size > 0 AND byte_size <= 1048576);

ALTER TABLE media_variants DROP CONSTRAINT IF EXISTS media_variants_asset_fk;
ALTER TABLE media_variants ADD CONSTRAINT media_variants_asset_fk
  FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE CASCADE;

ALTER TABLE progress_photos DROP CONSTRAINT IF EXISTS progress_photos_asset_fk;
ALTER TABLE progress_photos ADD CONSTRAINT progress_photos_asset_fk
  FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE CASCADE;

-- One timeline entry per image. Posting the same asset twice would show the
-- member two of the same photograph and give a coach two rows to review.
DROP INDEX IF EXISTS uq_progress_photos_asset;
CREATE UNIQUE INDEX uq_progress_photos_asset ON progress_photos (asset_id);

-- A photograph is not deleted by a conversation. SET NULL rather than CASCADE
-- both ways: deleting the message keeps the asset (the member may still have
-- it in their own timeline), and deleting the workout keeps the message.
ALTER TABLE community_messages DROP CONSTRAINT IF EXISTS community_messages_image_asset_fk;
ALTER TABLE community_messages ADD CONSTRAINT community_messages_image_asset_fk
  FOREIGN KEY (image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE community_messages DROP CONSTRAINT IF EXISTS community_messages_shared_session_fk;
ALTER TABLE community_messages ADD CONSTRAINT community_messages_shared_session_fk
  FOREIGN KEY (shared_session_id) REFERENCES workout_sessions(id) ON DELETE SET NULL;

-- The existing CHECK required words or a recording. A message can now also be
-- a photograph or a shared workout, and the old constraint would refuse both.
--
-- Replaced by name — `community_messages_has_content_chk`, as introspected
-- from production — rather than added alongside, because two CHECKs both
-- apply and the old one would still refuse a photo-only post. The tombstone
-- clause is carried over verbatim: a deleted message has its body emptied and
-- must stay legal.
ALTER TABLE community_messages DROP CONSTRAINT IF EXISTS community_messages_has_content_chk;
ALTER TABLE community_messages ADD CONSTRAINT community_messages_has_content_chk
  CHECK (
    deleted_at IS NOT NULL
    OR COALESCE(length(btrim(body)), 0) > 0
    OR audio_url IS NOT NULL
    OR image_asset_id IS NOT NULL
    OR shared_session_id IS NOT NULL
  );

-- ─── 4. INDEXES ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_media_assets_owner
  ON media_assets (owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_purpose
  ON media_assets (purpose);

DROP INDEX IF EXISTS uq_media_variants_asset_variant;
CREATE UNIQUE INDEX uq_media_variants_asset_variant
  ON media_variants (asset_id, variant);

CREATE INDEX IF NOT EXISTS idx_progress_photos_user_date
  ON progress_photos (user_id, on_date);

-- Both new columns are looked up by value when authorizing a read, and both
-- are null on the overwhelming majority of rows — a partial index is the whole
-- of what is useful and a fraction of the size.
CREATE INDEX IF NOT EXISTS idx_community_messages_image_asset
  ON community_messages (image_asset_id) WHERE image_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_messages_shared_session
  ON community_messages (shared_session_id) WHERE shared_session_id IS NOT NULL;

-- ─── 5. RLS ───────────────────────────────────────────────────────────────

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;
