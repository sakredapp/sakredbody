-- An avatar, when object storage isn't configured.
--
-- Uploading a photo answered "Photo storage isn't set up yet" on a real
-- device, because SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set in
-- production. Accurate, and a dead end on the first screen a member sees.
--
-- See shared/models/profilePhotos.ts for why bytes in Postgres is defensible
-- for this one thing: the client now crops and resizes to a 512px JPEG of
-- roughly 60KB before it uploads, the bytes never travel with the user row,
-- and Supabase Storage takes precedence the moment its credentials appear.
--
-- Adding those credentials is still the better long-term answer. This is what
-- makes the feature work in the meantime, with no configuration at all.

CREATE TABLE IF NOT EXISTS profile_photos (
  user_id     varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- The unguessable path segment. Avatars are rendered by <img>, which cannot
  -- carry a bearer token, so the serving route has to be reachable without a
  -- session — exactly as a public storage bucket is. 24 random bytes rather
  -- than the user id, which would be enumerable.
  token       text NOT NULL,
  bytes       bytea NOT NULL,
  mime        text NOT NULL DEFAULT 'image/jpeg',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A replaced photo gets a new token, which is what lets the serving route send
-- `immutable` — the URL is the version.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_photos_token ON profile_photos (token);

ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_photos_service ON profile_photos;
CREATE POLICY profile_photos_service ON profile_photos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
