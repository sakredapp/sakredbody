-- Where coaching alerts go, separately from how somebody signs in.
--
-- ── Why these are two different things ────────────────────────────────────
--
-- A coach's account email is an identity: it is what they type to log in and
-- what a password reset is sent to. Their coaching notification address is a
-- destination: it is where "your client answered a check-in" should land, and
-- for most coaches that is a work address rather than the personal one they
-- happened to register with.
--
-- Conflating them means changing where alerts arrive also changes how they log
-- in, and it means a typo in a preferences form can lock somebody out of their
-- own account. So the override is its own column, the login identity is
-- untouched, and no second auth account is created.
--
-- ── Why verification gates it ─────────────────────────────────────────────
--
-- An unverified address is an address somebody typed, not one anybody has
-- proven they can read. Sending client health context to it on that basis
-- would be a disclosure decided by a keystroke. So alerts keep going to the
-- account email until the new one has been confirmed, and the coach can see
-- that is what is happening.

ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_notification_email varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_notification_email_verified_at timestamptz;

-- The pending address is cleared on verification, so a row can never hold a
-- verified address and a stale unverified one at the same time.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,
  -- What is being proven, so this table can serve a second purpose later
  -- without a migration that has to guess at existing rows.
  purpose    text NOT NULL,
  email      varchar NOT NULL,
  token_hash varchar NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

ALTER TABLE email_verification_tokens DROP CONSTRAINT IF EXISTS email_verification_purpose_check;
ALTER TABLE email_verification_tokens ADD CONSTRAINT email_verification_purpose_check
  CHECK (purpose IN ('coach_notification'));

CREATE INDEX IF NOT EXISTS idx_email_verification_user
  ON email_verification_tokens (user_id, purpose);

ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
