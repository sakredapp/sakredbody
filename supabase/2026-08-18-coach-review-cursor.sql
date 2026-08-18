-- An explicit "I have looked at this client" mark.
--
-- ── Why a column and not an inference ─────────────────────────────────────
--
-- The roster answers "who needs me today", and until now it answered it from
-- unread message count alone. A client who logged four sessions, answered a
-- check-in and changed nothing about their conversation was indistinguishable
-- from one who had done nothing at all.
--
-- The obvious fix is to treat opening the client's page as reviewing them, and
-- it is wrong: a coach who taps a name to find a phone number has not reviewed
-- anybody, and a cursor that moves on page view means the one client they
-- opened by accident is the one that stops being flagged. So it is stamped by
-- a control the coach presses, and by nothing else.
--
-- Nullable, with no backfill. Null means "never reviewed", which is the honest
-- state for every existing relationship and reads correctly on the roster.

ALTER TABLE coach_relationships ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;
