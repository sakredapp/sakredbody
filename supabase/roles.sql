-- ═══════════════════════════════════════════════════════════════════════════
-- Staff roles
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- Safe to re-run. Mirrors shared/models/access.ts.
--
-- Why: `users.is_admin` is a varchar holding "true" or "false" — a boolean in
-- a costume, with exactly two states. Every back-office capability sat behind
-- that one bit, so there was no way to have a coach who sees their cohort and
-- nothing else, and no way to add cohort levels without rewriting every check
-- at once.
--
-- `is_admin` is NOT dropped. `public.is_sakred_admin()` reads it and every RLS
-- policy in this schema calls that function. The two coexist: the app writes
-- both, reads whichever is higher, and the policies keep working untouched.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_chk
    CHECK (role IN ('member','coach','moderator','admin','owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Backfill. Anyone who was an admin under the old bit stays one.
UPDATE users SET role = 'admin'
WHERE is_admin = 'true' AND role = 'member';

-- Keep the legacy bit true for anyone at admin or above, so that a row
-- written only through the new column still satisfies is_sakred_admin().
UPDATE users SET is_admin = 'true'
WHERE role IN ('admin','owner') AND (is_admin IS DISTINCT FROM 'true');

-- Verify — these two should agree on every row:
--   SELECT role, is_admin, count(*) FROM users GROUP BY 1, 2 ORDER BY 1;
