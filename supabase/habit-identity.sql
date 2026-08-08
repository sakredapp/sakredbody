-- Habit identity: dedup on the template id, not the title.
--
-- ── Why ────────────────────────────────────────────────────────────────────
--
-- `uq_habits_user_title_date` made (user_id, title, scheduled_date) unique, and
-- the materialiser relies on ON CONFLICT DO NOTHING against it. That makes
-- `routine_habits.title` a primary key in disguise, and renaming one is then a
-- destructive operation:
--
--   1. Admin renames a template from "Morning lemon water" to "Morning citrus
--      flush". Existing habit rows keep the old string — they are snapshots.
--   2. The next materialisation writes rows titled "Morning citrus flush".
--      They do not collide with the old ones, so a SECOND series appears for
--      the same template, on the same days.
--   3. The member now sees the habit twice. One copy may be completed and the
--      other not, so the day can never read as fully done — and the streak
--      breaks, silently, from an edit nobody thought was destructive.
--
-- Every habit row already carries `routine_habit_id`. It was simply not what
-- uniqueness was keyed on. This fixes that.
--
-- ── The two keys ───────────────────────────────────────────────────────────
--
-- Habits arrive from three places and only two shapes matter:
--
--   routine habits      (materialise)                routine_habit_id set
--   standalone assigns  (buildStandaloneHabitRows)   routine_habit_id set
--   custom habits       (buildCustomHabitRows)       routine_habit_id NULL
--
-- So: key on the template id where there is one, and fall back to the title
-- only for custom habits, which are the only rows a member named themselves.
--
-- ── One behaviour change ───────────────────────────────────────────────────
--
-- Two DIFFERENT templates that share a title, scheduled to the same member on
-- the same day, used to collapse into one row — the second was silently
-- dropped by ON CONFLICT. They will now both appear. That is the better
-- failure: a visible duplicate is an admin content mistake somebody can see
-- and fix, where a silently swallowed habit is one nobody ever learns about.
--
-- Safe to run: `habits` is empty at the time of writing, so no row can violate
-- either index and the foreign key cannot fail validation.

BEGIN;

-- 1. Template identity. Partial, because custom habits have no template.
CREATE UNIQUE INDEX IF NOT EXISTS uq_habits_user_template_date
  ON habits (user_id, routine_habit_id, scheduled_date)
  WHERE routine_habit_id IS NOT NULL;

-- 2. Title identity, now only where it is the only identity available.
DROP INDEX IF EXISTS uq_habits_user_title_date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_habits_user_title_date
  ON habits (user_id, title, scheduled_date)
  WHERE routine_habit_id IS NULL;

-- 3. Stop routine_habit_id dangling.
--
-- SET NULL, never CASCADE. Deleting a template must not delete the member's
-- completion history — the habit row keeps its snapshotted title and its
-- record of having been done, and simply stops being attached to a template
-- that no longer exists. CASCADE here would let an admin tidying the habit
-- list erase months of history across every member, and retroactively turn
-- failed days into perfect ones.
ALTER TABLE habits
  DROP CONSTRAINT IF EXISTS habits_routine_habit_id_fkey;

ALTER TABLE habits
  ADD CONSTRAINT habits_routine_habit_id_fkey
  FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id)
  ON DELETE SET NULL;

COMMIT;
