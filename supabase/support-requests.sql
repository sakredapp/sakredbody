-- ═══════════════════════════════════════════════════════════════════════════
-- Support requests
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Backs the public /support page. Applied to zcvanbozvtojmnyuzsjh on
-- 2026-08-09; kept here so the schema has one source of truth rather than
-- living only in the migration history.
--
-- The endpoint that writes this table is unauthenticated, which is a
-- deliberate exception: both app stores require a support URL a reviewer can
-- open without an account, and the member most likely to need help is the one
-- who cannot sign in. server/support/routes.ts throttles it per IP through
-- the existing login_attempts counter.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_requests (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null when submitted signed-out.
  user_id    varchar,
  name       text NOT NULL,
  email      text NOT NULL,
  category   text NOT NULL,
  subject    text NOT NULL,
  message    text NOT NULL,
  status     text NOT NULL DEFAULT 'open',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT support_requests_category_check
    CHECK (category IN ('account','billing','technical','protocol','privacy','other')),
  CONSTRAINT support_requests_status_check
    CHECK (status IN ('open','answered','closed'))
);

CREATE INDEX IF NOT EXISTS "IDX_support_requests_status" ON support_requests (status);
CREATE INDEX IF NOT EXISTS "IDX_support_requests_user" ON support_requests (user_id);

-- Written by the Express backend as the service role, which bypasses RLS.
-- No policy, deliberately: a support request carries someone's email address
-- and whatever they chose to tell us. Deny-all for every other role is the
-- correct posture — see the note in README.md.
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

-- ─── Verify ────────────────────────────────────────────────────────────────
--
-- Expect: rowsecurity = true, policies = 0, indexes = 3.
--
--   SELECT t.tablename, t.rowsecurity,
--          (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename)
--   FROM pg_tables t
--   WHERE t.schemaname = 'public' AND t.tablename = 'support_requests';
