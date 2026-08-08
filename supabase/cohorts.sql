-- ═══════════════════════════════════════════════════════════════════════════
-- Masterminds — cohorts
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- Safe to re-run. Mirrors shared/models/cohorts.ts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cohorts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  kind                 text NOT NULL DEFAULT 'mastermind',
  description          text,
  cover_url            text,
  start_date           date,
  end_date             date,
  format               text NOT NULL DEFAULT 'hybrid',
  location             text,
  capacity             integer NOT NULL DEFAULT 12,
  price_cents          integer,
  price_note           text,
  application_required boolean NOT NULL DEFAULT true,
  status               text NOT NULL DEFAULT 'draft',
  sort_order           integer NOT NULL DEFAULT 0,
  created_at           timestamp DEFAULT now(),
  updated_at           timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohorts_status ON cohorts (status);

DO $$ BEGIN
  ALTER TABLE cohorts ADD CONSTRAINT cohorts_kind_chk
    CHECK (kind IN ('mastermind','cohort','circle'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cohorts ADD CONSTRAINT cohorts_format_chk
    CHECK (format IN ('in_person','virtual','hybrid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cohorts ADD CONSTRAINT cohorts_status_chk
    CHECK (status IN ('draft','open','closed','running','complete'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Roster ────────────────────────────────────────────────────────────────
-- A withdrawal is a state change, never a delete. A coach needs to know
-- someone left the room, and when.

CREATE TABLE IF NOT EXISTS cohort_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id   uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id     varchar NOT NULL,
  status      text NOT NULL DEFAULT 'applied',
  note        text,
  review_note text,
  applied_at  timestamp DEFAULT now(),
  decided_at  timestamp
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort ON cohort_members (cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user   ON cohort_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohort_members  ON cohort_members (cohort_id, user_id);

DO $$ BEGIN
  ALTER TABLE cohort_members ADD CONSTRAINT cohort_members_status_chk
    CHECK (status IN ('applied','invited','confirmed','declined','withdrawn'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Schedule ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cohort_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id        uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title            text NOT NULL,
  agenda           text,
  starts_at        timestamp,
  duration_minutes integer,
  location         text,
  order_index      integer NOT NULL DEFAULT 0,
  created_at       timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_sessions_cohort ON cohort_sessions (cohort_id);

CREATE TABLE IF NOT EXISTS cohort_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES cohort_sessions(id) ON DELETE CASCADE,
  user_id     varchar NOT NULL,
  present     boolean NOT NULL DEFAULT true,
  note        text,
  recorded_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_attendance_session ON cohort_attendance (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohort_attendance   ON cohort_attendance (session_id, user_id);

-- ─── Row level security ────────────────────────────────────────────────────

ALTER TABLE cohorts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_attendance ENABLE ROW LEVEL SECURITY;

-- Drafts are invisible; everything else is announceable.
DROP POLICY IF EXISTS cohorts_select ON cohorts;
CREATE POLICY cohorts_select ON cohorts
  FOR SELECT USING (status <> 'draft' OR public.is_sakred_admin());

DROP POLICY IF EXISTS cohorts_write ON cohorts;
CREATE POLICY cohorts_write ON cohorts
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

-- A member sees their own roster row, never anyone else's — and never the
-- coach's review note, which the API strips before it leaves the server.
DROP POLICY IF EXISTS cohort_members_own ON cohort_members;
CREATE POLICY cohort_members_own ON cohort_members
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS cohort_members_apply ON cohort_members;
CREATE POLICY cohort_members_apply ON cohort_members
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS cohort_members_admin ON cohort_members;
CREATE POLICY cohort_members_admin ON cohort_members
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

-- The schedule belongs to the room. Only confirmed members see it.
DROP POLICY IF EXISTS cohort_sessions_select ON cohort_sessions;
CREATE POLICY cohort_sessions_select ON cohort_sessions
  FOR SELECT USING (
    public.is_sakred_admin()
    OR EXISTS (
      SELECT 1 FROM cohort_members m
      WHERE m.cohort_id = cohort_sessions.cohort_id
        AND m.user_id = auth.uid()::text
        AND m.status = 'confirmed'
    )
  );

DROP POLICY IF EXISTS cohort_sessions_admin ON cohort_sessions;
CREATE POLICY cohort_sessions_admin ON cohort_sessions
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

DROP POLICY IF EXISTS cohort_attendance_own ON cohort_attendance;
CREATE POLICY cohort_attendance_own ON cohort_attendance
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS cohort_attendance_admin ON cohort_attendance;
CREATE POLICY cohort_attendance_admin ON cohort_attendance
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

-- Verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name LIKE 'cohort%';
