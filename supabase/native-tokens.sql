-- ═══════════════════════════════════════════════════════════════════════════
-- Native shell tokens — auth_tokens + push_tokens
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two tables the iOS and Android builds need and the web app does not:
--
--   auth_tokens — bearer credentials. The session cookie cannot reach a
--                 Capacitor WebView (cross-site by construction; discarded
--                 outright by WebKit's tracking prevention on iOS), so native
--                 auth travels in an Authorization header instead.
--
--   push_tokens — FCM registration tokens, one row per device.
--
-- Runs whole-file through the Management API, so one bad statement rolls the
-- entire file back. Verify after applying — see the query at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── auth_tokens ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth_tokens (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      varchar NOT NULL,
  -- SHA-256 hex of the token. The raw value is returned to the device once
  -- and never stored, so a dump of this table cannot be replayed.
  token_hash   varchar NOT NULL UNIQUE,
  platform     varchar,
  created_at   timestamp DEFAULT now(),
  last_used_at timestamp DEFAULT now(),
  expires_at   timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_auth_tokens_user" ON auth_tokens (user_id);

-- Every authenticated native request looks a token up by hash, so this index
-- is on the hot path rather than a nicety. UNIQUE already provides it; named
-- here only so the intent survives a future change to that constraint.
CREATE INDEX IF NOT EXISTS "IDX_auth_tokens_hash" ON auth_tokens (token_hash);

-- ─── push_tokens ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_tokens (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,
  -- Unique on the token, not on (user, token): FCM can reissue the same token
  -- to a different account after a reinstall or a resold handset, and the row
  -- must follow the device.
  token      varchar NOT NULL UNIQUE,
  platform   varchar NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_push_tokens_user" ON push_tokens (user_id);

-- ─── RLS ───────────────────────────────────────────────────────────────────
--
-- Same posture as rls-policies.sql: the Express backend connects as the
-- service role and bypasses RLS, so this is defence in depth against a client
-- SDK ever reaching these tables directly.
--
-- Unlike the member-facing tables, there is deliberately **no** permissive
-- policy here. Nothing that is not the service role has any business reading
-- either table: a bearer hash and an FCM token are credentials, not content.
-- RLS-enabled-with-zero-policies means "deny all" for non-service roles,
-- which is the correct posture and not the misconfiguration it resembles
-- elsewhere in this schema.

ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- ─── Verify ────────────────────────────────────────────────────────────────
--
-- Expect: both tables listed, rowsecurity = true, policy count = 0.
--
--   SELECT t.tablename, t.rowsecurity,
--          (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename)
--   FROM pg_tables t
--   WHERE t.schemaname = 'public'
--     AND t.tablename IN ('auth_tokens', 'push_tokens');
