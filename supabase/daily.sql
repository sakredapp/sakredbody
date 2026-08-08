-- ═══════════════════════════════════════════════════════════════════════════
-- The daily ritual — notes, intentions, frequencies, and chart inputs
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- Safe to re-run. Mirrors shared/models/daily.ts and the additions to
-- shared/models/energy.ts.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Chart inputs ───────────────────────────────────────────────────────
-- Everything optional. The note gets more personal as more is given, and none
-- of it gates access to anything.
--
-- birth_name is deliberately separate from users.first_name/last_name: the
-- convention numerology uses is the name given at birth, and people marry —
-- changing a display name must not silently change someone's numbers.

ALTER TABLE user_cosmology ADD COLUMN IF NOT EXISTS birth_name         text;
ALTER TABLE user_cosmology ADD COLUMN IF NOT EXISTS polarity           text;
ALTER TABLE user_cosmology ADD COLUMN IF NOT EXISTS expression_number  integer;
ALTER TABLE user_cosmology ADD COLUMN IF NOT EXISTS soul_urge_number   integer;
ALTER TABLE user_cosmology ADD COLUMN IF NOT EXISTS personality_number integer;

DO $$ BEGIN
  ALTER TABLE user_cosmology ADD CONSTRAINT user_cosmology_polarity_chk
    CHECK (polarity IS NULL OR polarity IN ('masculine','feminine','balanced'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Daily notes ────────────────────────────────────────────────────────
-- One per member per day. The unique index is what makes generation
-- idempotent: two concurrent requests race to insert and the loser reads the
-- winner's row rather than paying for a second model call.
--
-- `inputs` stores the almanac the note was written from, verbatim. Without it
-- you cannot tell later whether a strange note was a bad generation or a bad
-- input — the difference between a prompt fix and a maths fix.

CREATE TABLE IF NOT EXISTS daily_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar NOT NULL,
  on_date     date NOT NULL,
  headline    text NOT NULL,
  body        text NOT NULL,
  invitation  text,
  inputs      jsonb,
  source      text NOT NULL DEFAULT 'model',
  model       text,
  attempts    integer NOT NULL DEFAULT 1,
  reviewed_at timestamp,
  reviewed_by varchar,
  flagged     boolean NOT NULL DEFAULT false,
  flag_note   text,
  created_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_user    ON daily_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_notes_date    ON daily_notes (on_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_notes_flagged ON daily_notes (flagged) WHERE flagged;
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_notes   ON daily_notes (user_id, on_date);

DO $$ BEGIN
  ALTER TABLE daily_notes ADD CONSTRAINT daily_notes_source_chk
    CHECK (source IN ('model','fallback','authored'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Daily intentions ───────────────────────────────────────────────────
-- What the member says to themselves. Nothing generates this.

CREATE TABLE IF NOT EXISTS daily_intentions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,
  on_date    date NOT NULL,
  intention  text NOT NULL,
  met_at     timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_intentions_user ON daily_intentions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_intentions ON daily_intentions (user_id, on_date);

-- ─── 4. Frequencies ────────────────────────────────────────────────────────
-- Audio tied to a moment rather than filed in a media library. "Play this when
-- you wake up" is the product; a list of tracks is not.

CREATE TABLE IF NOT EXISTS frequencies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  hz               integer,
  description      text,
  audio_url        text NOT NULL,
  duration_seconds integer,
  moment           text NOT NULL DEFAULT 'anytime',
  centre_id        text REFERENCES energy_centres(id) ON DELETE SET NULL ON UPDATE CASCADE,
  sort_order       integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frequencies_moment ON frequencies (moment);
CREATE INDEX IF NOT EXISTS idx_frequencies_active ON frequencies (is_active);

DO $$ BEGIN
  ALTER TABLE frequencies ADD CONSTRAINT frequencies_moment_chk
    CHECK (moment IN ('waking','practice','evening','anytime'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Row level security ────────────────────────────────────────────────────

ALTER TABLE daily_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_intentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequencies      ENABLE ROW LEVEL SECURITY;

-- A member reads their own notes and never writes one — the whole point is
-- that the note is written for them, not by them.
DROP POLICY IF EXISTS daily_notes_own ON daily_notes;
CREATE POLICY daily_notes_own ON daily_notes
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS daily_notes_admin ON daily_notes;
CREATE POLICY daily_notes_admin ON daily_notes
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

-- An intention is theirs entirely. Admins can read it — a coach should see
-- what someone set for themselves — but never write it.
DROP POLICY IF EXISTS daily_intentions_own ON daily_intentions;
CREATE POLICY daily_intentions_own ON daily_intentions
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS daily_intentions_read ON daily_intentions;
CREATE POLICY daily_intentions_read ON daily_intentions
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS frequencies_select ON frequencies;
CREATE POLICY frequencies_select ON frequencies
  FOR SELECT USING (is_active OR public.is_sakred_admin());

DROP POLICY IF EXISTS frequencies_write ON frequencies;
CREATE POLICY frequencies_write ON frequencies
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

-- Verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('daily_notes','daily_intentions','frequencies');
