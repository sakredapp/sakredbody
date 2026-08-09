-- Cover image for a protocol.
--
-- The one field the old back office had that this schema never did. Applied
-- to production 2026-08-09; kept here because supabase/ is the record of what
-- the database looks like, and a column that exists only in a chat log is a
-- column the next person cannot account for.
--
-- Nullable on purpose: a protocol is publishable without one, and requiring
-- an image would block Nick on an asset rather than on the writing.

ALTER TABLE public.wellness_routines
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN public.wellness_routines.cover_image_url IS
  'Wide banner, roughly 1200x600. Nullable: a protocol is publishable without one.';
