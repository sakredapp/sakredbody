-- ═══════════════════════════════════════════════════════════════════════════
-- Sakred Executive applications
--
-- Run this once in the Supabase SQL editor for the sakredbody project.
-- Safe to re-run: everything is IF NOT EXISTS / idempotent.
--
-- Mirrors shared/models/executive.ts. If you change the Drizzle table, change
-- this too (or run `npm run db:push` with SAKREDBODY_DATABASE_URL set locally).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS executive_applications (
  id           serial PRIMARY KEY,
  first_name   text NOT NULL,
  last_name    text NOT NULL,
  email        text NOT NULL,
  phone        text NOT NULL,
  location     text,
  occupation   text,
  role         text,
  answers      jsonb NOT NULL,
  fit_score    integer NOT NULL DEFAULT 0,
  route        text NOT NULL DEFAULT 'nurture',
  status       text NOT NULL DEFAULT 'new',
  notes        text,
  created_at   timestamp DEFAULT now()
);

-- The admin list sorts by newest and filters by route/status.
CREATE INDEX IF NOT EXISTS idx_exec_apps_created ON executive_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_apps_route   ON executive_applications (route);
CREATE INDEX IF NOT EXISTS idx_exec_apps_status  ON executive_applications (status);

-- ─── Row level security ────────────────────────────────────────────────────
-- Same shape as the existing `applications` table: anyone may apply,
-- only admins may read or update. Applicants never read their own row back,
-- so there is deliberately no self-select policy.

ALTER TABLE executive_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sakred_exec_applications_insert ON executive_applications;
CREATE POLICY sakred_exec_applications_insert ON executive_applications
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS sakred_exec_applications_select ON executive_applications;
CREATE POLICY sakred_exec_applications_select ON executive_applications
  FOR SELECT USING (public.is_sakred_admin());

DROP POLICY IF EXISTS sakred_exec_applications_update ON executive_applications;
CREATE POLICY sakred_exec_applications_update ON executive_applications
  FOR UPDATE USING (public.is_sakred_admin());

-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'executive_applications' ORDER BY ordinal_position;
