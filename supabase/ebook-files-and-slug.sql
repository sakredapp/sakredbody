-- What the old eBook admin could set and this schema had no room for.
-- Applied to production 2026-08-09.
--
-- The important one is file_url. `audio_url` already existed, so a guide could
-- carry an audiobook and no book at all — the reader had nothing to open
-- unless every section had been written inline. A guide is a document first.
--
-- promo_video_url is deliberately a separate column rather than another file:
-- it is the only asset in this table that plays for someone who has *not*
-- bought. Storing it alongside the gated files is how it eventually gets
-- gated with them by mistake.

ALTER TABLE public.ebooks
  ADD COLUMN IF NOT EXISTS slug              text,
  ADD COLUMN IF NOT EXISTS file_url          text,
  ADD COLUMN IF NOT EXISTS promo_video_url   text,
  ADD COLUMN IF NOT EXISTS category          text,
  ADD COLUMN IF NOT EXISTS published_at      date,
  ADD COLUMN IF NOT EXISTS unlocks_community boolean NOT NULL DEFAULT false;

-- Unique but nullable: a guide is publishable before anyone decides its URL,
-- and Postgres treats NULLs as distinct, so many rows may sit without one.
CREATE UNIQUE INDEX IF NOT EXISTS ebooks_slug_key ON public.ebooks (slug);

COMMENT ON COLUMN public.ebooks.file_url IS
  'The readable book — PDF, DOCX or EPUB. Entitlement-gated.';
COMMENT ON COLUMN public.ebooks.promo_video_url IS
  'Public. Plays on the landing page for people who have not bought.';
COMMENT ON COLUMN public.ebooks.unlocks_community IS
  'Whether buying this grants the community room as well as the guide.';
