-- ═══════════════════════════════════════════════════════════════════════════
-- The Library — written guides paired to protocols
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- Safe to re-run. Mirrors shared/models/library.ts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ebooks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  subtitle        text,
  author          text,
  description     text,
  cover_url       text,
  routine_id      text REFERENCES wellness_routines(id) ON DELETE SET NULL ON UPDATE CASCADE,
  price_cents     integer,
  access_mode     text NOT NULL DEFAULT 'membership',
  reading_minutes integer,
  audio_url       text,
  search_keywords text[] DEFAULT '{}',
  is_featured     boolean NOT NULL DEFAULT false,
  is_published    boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamp DEFAULT now(),
  updated_at      timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ebooks_published ON ebooks (is_published);
CREATE INDEX IF NOT EXISTS idx_ebooks_routine   ON ebooks (routine_id);

DO $$ BEGIN
  ALTER TABLE ebooks ADD CONSTRAINT ebooks_access_mode_chk
    CHECK (access_mode IN ('membership','purchase','coaching'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Sections ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ebook_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ebook_id    uuid NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text,
  audio_url   text,
  order_index integer NOT NULL DEFAULT 0,
  is_free     boolean NOT NULL DEFAULT false,
  created_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ebook_sections_book ON ebook_sections (ebook_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ebook_sections_order
  ON ebook_sections (ebook_id, order_index);

-- ─── Entitlements ──────────────────────────────────────────────────────────
-- Access is a row, not a tier comparison at read time. A member who drops a
-- plan keeps what a coach gave them, because the reason travels with the grant.

CREATE TABLE IF NOT EXISTS ebook_entitlements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,
  ebook_id   uuid NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
  source     text NOT NULL DEFAULT 'membership',
  granted_by varchar,
  granted_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ebook_entitlements_user ON ebook_entitlements (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ebook_entitlements
  ON ebook_entitlements (user_id, ebook_id);

DO $$ BEGIN
  ALTER TABLE ebook_entitlements ADD CONSTRAINT ebook_entitlements_source_chk
    CHECK (source IN ('membership','purchase','coaching','gift'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Progress ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ebook_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         varchar NOT NULL,
  ebook_id        uuid NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
  section_id      uuid REFERENCES ebook_sections(id) ON DELETE SET NULL,
  scroll_fraction integer NOT NULL DEFAULT 0,   -- 0..1000
  completed_at    timestamp,
  updated_at      timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ebook_progress_user ON ebook_progress (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ebook_progress ON ebook_progress (user_id, ebook_id);

-- ─── Row level security ────────────────────────────────────────────────────
-- Published metadata is public — a member has to be able to see a guide exists
-- before they can be given it. Section *content* is admin-only through
-- PostgREST; the Express reader gates it on an entitlement row.

ALTER TABLE ebooks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebook_sections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebook_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebook_progress     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ebooks_select ON ebooks;
CREATE POLICY ebooks_select ON ebooks
  FOR SELECT USING (is_published OR public.is_sakred_admin());

DROP POLICY IF EXISTS ebooks_write ON ebooks;
CREATE POLICY ebooks_write ON ebooks
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

DROP POLICY IF EXISTS ebook_sections_admin ON ebook_sections;
CREATE POLICY ebook_sections_admin ON ebook_sections
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

-- A member may read which entitlements are theirs, but never grant one.
DROP POLICY IF EXISTS ebook_entitlements_own ON ebook_entitlements;
CREATE POLICY ebook_entitlements_own ON ebook_entitlements
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS ebook_entitlements_admin ON ebook_entitlements;
CREATE POLICY ebook_entitlements_admin ON ebook_entitlements
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

DROP POLICY IF EXISTS ebook_progress_own ON ebook_progress;
CREATE POLICY ebook_progress_own ON ebook_progress
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- Verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name LIKE 'ebook%';
