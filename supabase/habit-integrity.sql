-- ═══════════════════════════════════════════════════════════════════════════
-- Habit engine integrity
--
-- Closes the four defects carried over from the macro app teardown. Every
-- statement is idempotent and the destructive one (de-duplication) keeps the
-- completed row when a duplicate pair exists, so no completion is ever lost.
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. De-duplicate habits, then make duplicates impossible ───────────────
-- The macro app deduped in application code, which two concurrent generators
-- can race past. A constraint cannot be raced.
--
-- Keep-rule: prefer a completed row, then the oldest. Losing a completion
-- would be worse than keeping a redundant row, so completion wins.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, title, scheduled_date
           ORDER BY completed DESC, created_at ASC, id ASC
         ) AS rn
  FROM habits
)
DELETE FROM habits h
USING ranked r
WHERE h.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_habits_user_title_date
  ON habits (user_id, title, scheduled_date);

-- ─── 2. Stop habits orphaning when an enrollment is deleted ────────────────
-- Enrollment rollback already deletes habits explicitly, but nothing stopped a
-- manual or admin delete from leaving thousands of unreachable rows behind.

DELETE FROM habits
WHERE user_routine_id IS NOT NULL
  AND user_routine_id NOT IN (SELECT id FROM user_routines);

DO $$ BEGIN
  ALTER TABLE habits
    ADD CONSTRAINT habits_user_routine_id_fkey
    FOREIGN KEY (user_routine_id) REFERENCES user_routines(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Removal tombstones ─────────────────────────────────────────────────
-- Removing a habit deletes its future rows. Without a tombstone, any
-- re-materialisation (reconcile, re-enroll) brings it straight back.
--
-- Scoped to user_routine_id rather than globally, so a member who removes a
-- habit from one protocol still gets it if they enroll in another. The macro
-- app's tombstones were permanent and global, with no way to undo.

CREATE TABLE IF NOT EXISTS user_removed_habits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          varchar NOT NULL,
  user_routine_id  uuid REFERENCES user_routines(id) ON DELETE CASCADE,
  routine_habit_id uuid REFERENCES routine_habits(id) ON DELETE CASCADE,
  title            text,
  created_at       timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_removed_habits_user ON user_removed_habits (user_id);

-- Two suppression kinds, each idempotent: by template, or by title for a
-- custom habit that has no template row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_removed_habits_template
  ON user_removed_habits (user_id, user_routine_id, routine_habit_id)
  WHERE routine_habit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_removed_habits_title
  ON user_removed_habits (user_id, user_routine_id, title)
  WHERE routine_habit_id IS NULL;

-- ─── 4. Coins can only be awarded once per habit ───────────────────────────
-- The macro app guarded this with an in-memory Set, so toggling a habit off,
-- restarting the app, and toggling it back on paid out again. A partial unique
-- index on the ledger makes the double-award a constraint violation instead.

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS habit_id uuid;

DO $$ BEGIN
  ALTER TABLE rewards
    ADD CONSTRAINT rewards_habit_id_fkey
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Collapse any historical double-awards before enforcing.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, habit_id ORDER BY created_at ASC, id ASC) AS rn
  FROM rewards
  WHERE habit_id IS NOT NULL AND type = 'earn'
)
DELETE FROM rewards r USING ranked k WHERE r.id = k.id AND k.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rewards_habit_earn
  ON rewards (user_id, habit_id)
  WHERE habit_id IS NOT NULL AND type = 'earn';

CREATE INDEX IF NOT EXISTS idx_rewards_habit ON rewards (habit_id);

-- ─── 5. Standalone habits need a real start date ───────────────────────────
-- The macro app inferred it from created_at, and its client sent a start_date
-- that Postgres silently dropped because the column did not exist.

ALTER TABLE user_assigned_habits
  ADD COLUMN IF NOT EXISTS start_date date NOT NULL DEFAULT current_date;

-- Verify:
--   SELECT indexname FROM pg_indexes
--   WHERE tablename IN ('habits','rewards','user_removed_habits');
