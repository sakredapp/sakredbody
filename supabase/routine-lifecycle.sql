-- ═══════════════════════════════════════════════════════════════════════════
-- Routine lifecycle + member timezone
--
-- Closes the engine defects in docs/ENGINE-AUDIT.md that need schema:
--   1  member timezone      — the server has no other way to know when a
--                             member's day starts
--   2  scheduled status     — a future start date must not take effect today
--   4  end_date off-by-one  — backfilled for existing rows
--   5  paused_at            — so resuming can give back the days lost
--   9  one active routine   — as a constraint, not a convention
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Member timezone ────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone varchar DEFAULT 'UTC';
UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL;

-- ─── 2. Pause bookkeeping ──────────────────────────────────────────────────

ALTER TABLE user_routines ADD COLUMN IF NOT EXISTS paused_at date;

-- ─── 3. Status vocabulary ──────────────────────────────────────────────────
-- 'scheduled' is new. The CHECK is added last so the backfill above can't
-- trip it.

DO $$ BEGIN
  ALTER TABLE user_routines DROP CONSTRAINT IF EXISTS user_routines_status_chk;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE user_routines
  ADD CONSTRAINT user_routines_status_chk
  CHECK (status IN ('scheduled','active','paused','completed','abandoned'));

-- ─── 4. end_date off-by-one backfill ───────────────────────────────────────
-- Historic rows were written as start_date + duration_days, which is one day
-- past the last scheduled habit. Only correct rows that actually match the old
-- formula, so a hand-edited end_date is left alone.

UPDATE user_routines ur
SET    end_date = ur.start_date + (wr.duration_days - 1)
FROM   wellness_routines wr
WHERE  wr.id = ur.routine_id
  AND  ur.end_date = ur.start_date + wr.duration_days;

-- ─── 5. One active routine per member ──────────────────────────────────────
-- Previously maintained by a "pause everything first" UPDATE, which a
-- double-submit can race straight past. Several read paths then do
-- SELECT ... WHERE status='active' with no LIMIT and take [0], so a member
-- with two active rows gets an arbitrary one that can change between requests.
--
-- Resolve any existing violation before adding the index: keep the most
-- recently created, pause the rest.

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM user_routines
  WHERE status = 'active'
)
UPDATE user_routines ur
SET    status = 'paused', paused_at = current_date, updated_at = now()
FROM   ranked r
WHERE  ur.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_routines_one_active
  ON user_routines (user_id) WHERE status = 'active';

-- A member may likewise only have one thing queued up.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY start_date ASC, id ASC) AS rn
  FROM user_routines
  WHERE status = 'scheduled'
)
UPDATE user_routines ur
SET    status = 'abandoned', updated_at = now()
FROM   ranked r
WHERE  ur.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_routines_one_scheduled
  ON user_routines (user_id) WHERE status = 'scheduled';

-- ─── 6. Serving habits needs the enrollment, not just the date ─────────────
-- /api/habits/today filters on (user_id, scheduled_date) alone, so a paused
-- routine kept serving habits. The handler now joins the enrollment; this
-- index keeps that join cheap.

CREATE INDEX IF NOT EXISTS idx_habits_user_routine_date
  ON habits (user_id, user_routine_id, scheduled_date);

-- Verify:
--   SELECT status, count(*) FROM user_routines GROUP BY status;
--   SELECT indexname FROM pg_indexes WHERE tablename='user_routines';
