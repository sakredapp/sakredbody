-- ═══════════════════════════════════════════════════════════════════════════
-- Applications — triage columns
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- Safe to re-run. Mirrors the additions to shared/schema.ts.
--
-- Why this exists: `applications` has been insert-only since it was created.
-- The mastermind form on the marketing site writes a row and nothing has ever
-- read one — no GET route, no storage method, no admin surface. Someone
-- applied and it disappeared. Adding the triage columns is the first half of
-- closing that; server/routes.ts and the Applications admin tab are the rest.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE applications ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'new';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes       text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_at timestamp;

DO $$ BEGIN
  ALTER TABLE applications ADD CONSTRAINT applications_status_chk
    CHECK (status IN ('new','contacted','call booked','accepted','declined','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_applications_status  ON applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_created ON applications (created_at DESC);

-- ─── Row level security ────────────────────────────────────────────────────
-- The form posts through the server with the service role, so the write
-- policy here is for admins reading and triaging in the dashboard. An
-- applicant is not a member and has no auth.uid() — they can never read back
-- what they submitted, which is correct.

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applications_admin ON applications;
CREATE POLICY applications_admin ON applications
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

-- Verify — RLS on with zero policies is the failure that looks like success:
--   SELECT tablename, rowsecurity,
--          (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename)
--   FROM pg_tables t WHERE tablename = 'applications';
