-- ═══════════════════════════════════════════════════════════════════════════
-- Password reset
-- ═══════════════════════════════════════════════════════════════════════════
--
-- There was no recovery path. No route, no token, no email — a member who
-- forgot their password was locked out for good, and the only remedy was
-- someone editing a scrypt hash in this database by hand. That is not a gap in
-- a feature list; it is a way to permanently lose a paying account, and it was
-- one forgotten password away from happening.
--
-- See shared/models/auth.ts for why only the hash is stored and why redeemed
-- rows are marked rather than deleted.
--
-- Runs whole-file through the Management API, so one bad statement rolls the
-- entire file back. Verify after applying — see the query at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,
  -- SHA-256 hex of the token. The raw value goes into one email and is never
  -- written down, so a dump of this table cannot be replayed into an account.
  token_hash varchar NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  -- Null until redeemed. Set rather than deleted so that a second click on the
  -- same link can be told apart from a forged one.
  used_at    timestamptz
);

CREATE INDEX IF NOT EXISTS "IDX_password_reset_user"
  ON password_reset_tokens (user_id);

-- The sweep below wants expired rows without a sequential scan.
CREATE INDEX IF NOT EXISTS "IDX_password_reset_expires"
  ON password_reset_tokens (expires_at);

-- ─── RLS ───────────────────────────────────────────────────────────────────
--
-- Deny-all, exactly as auth_tokens. A reset token is a credential that will
-- change a password: anything that could read this table could take over every
-- account that had recently asked for a link, which is a worse outcome than
-- leaking the password hashes themselves. The Express backend connects as the
-- service role and bypasses RLS, so enabled-with-no-policy is the correct
-- posture here and not the misconfiguration it resembles on content tables.

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE password_reset_tokens IS
  'Single-use password reset tokens, stored as SHA-256 hex. Server-only; RLS denies all client access. One hour TTL — see RESET_TOKEN_TTL_MS in shared/models/auth.ts.';

-- ─── Housekeeping ──────────────────────────────────────────────────────────
--
-- Expired and redeemed rows have no further use. Not a cron: the reset routes
-- delete a user's outstanding rows whenever one is issued or redeemed, so this
-- only ever mops up tokens belonging to people who asked once and never came
-- back. Safe to run by hand, or to attach to an existing sweep later.
--
--   DELETE FROM password_reset_tokens
--   WHERE expires_at < now() - interval '7 days';

-- ─── Verify ────────────────────────────────────────────────────────────────
--
-- Expect: one row, rowsecurity = true, policy count = 0.
--
--   SELECT t.tablename, t.rowsecurity,
--          (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename)
--   FROM pg_tables t
--   WHERE t.schemaname = 'public'
--     AND t.tablename = 'password_reset_tokens';
