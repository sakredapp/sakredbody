-- What the number in the weight box means — and what it meant at the time.
--
-- A phone showed "Dumbbell Bench Press · 70 · reps" with no unit and nothing
-- to say whether 70 was in each hand or altogether. Those are a factor of two
-- apart in every derived number the product has, and the Room was publishing
-- the result of guessing.
--
-- ── Two columns, because there are two facts ───────────────────────────────
--
-- `exercises.load_entry`         how this movement should be entered from now
--                                on. A setting. Admin-owned, member-editable
--                                per session, and expected to be corrected.
--
-- `session_exercises.load_entry` what the number meant in one actual workout.
--                                A record. Copied from the setting when the
--                                movement entered the session, and never
--                                touched again.
--
-- The first draft of this migration had only the first column, and every
-- reader of history joined to it. That is wrong in a way that is easy to miss:
-- correcting a movement's setting today would have rewritten what a workout
-- six months ago is supposed to have weighed, and the member would not have
-- been told. Equipment makes "70 per hand" likely for a dumbbell; likely is
-- not a record, and this product does not convert probability into history.
--
-- Additive and reapply-safe. Every session_exercises row that exists when this
-- runs keeps a NULL — we were never told what those numbers meant, and NULL is
-- that admission. `loadShape()` in shared/models/training.ts answers NULL with
-- exactly the arithmetic the product used before this feature: one load, one
-- performance. No past total moves because this migration ran.


-- ── 1. The setting ─────────────────────────────────────────────────────────

-- NOTE ON TRANSACTIONS
--
-- This file deliberately does not open one. It used to begin with BEGIN; and
-- end the schema changes with COMMIT;, and that COMMIT closed the transaction
-- the caller had opened around the whole file — so the verification block
-- below ran outside it. Proved against QA rather than reasoned about: a file
-- shaped that way, whose verification raises, reports "rolled back" while its
-- table is still there afterwards.
--
-- The caller wraps the file. script/qa-migrate.ts does, and the Management API
-- runs a file whole. Leave the transaction to whoever is applying this, so
-- that a verification that objects takes the changes down with it.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS load_entry text NOT NULL DEFAULT 'total';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_load_entry_check'
  ) THEN
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_load_entry_check
      CHECK (load_entry IN ('total', 'per_limb'));
  END IF;
END $$;

-- ── 2. The record ──────────────────────────────────────────────────────────
--
-- Nullable with no default and no backfill, both deliberately. A default would
-- assign an interpretation to every workout already logged; a backfill would
-- do it louder. This column only ever holds something a session actually
-- recorded.

ALTER TABLE session_exercises
  ADD COLUMN IF NOT EXISTS load_entry text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_exercises_load_entry_check'
  ) THEN
    ALTER TABLE session_exercises
      ADD CONSTRAINT session_exercises_load_entry_check
      CHECK (load_entry IS NULL OR load_entry IN ('total', 'per_limb'));
  END IF;
END $$;

-- ── 3. The catalogue default catches up ────────────────────────────────────
--
-- Dumbbells and kettlebells are the equipment whose number is conventionally
-- per hand, and `defaultLoadEntry()` in the shared model says so for movements
-- a member adds. This is the same statement applied to the movements that were
-- already there, so a dumbbell bench started tomorrow is entered correctly
-- without anybody being asked.
--
-- It cannot reach history. History reads session_exercises.load_entry, which
-- this statement does not touch and which is NULL for every workout logged
-- before now. That separation is the whole point of step 2.
--
-- Applied only where nobody has said otherwise, so a member's or an admin's
-- explicit answer is never overwritten by a default catching up.
UPDATE exercises
   SET load_entry = 'per_limb'
 WHERE equipment IN ('dumbbell', 'kettlebell')
   AND load_entry = 'total';


-- Verified from the tables rather than from the success of the statements
-- above. RLS-on-with-zero-policies is the failure that looks like success, and
-- a column that exists holding the wrong thing is its quieter cousin.
DO $$
DECLARE
  has_check boolean;
  per_limb_count int;
  bad_values int;
  is_nullable text;
  already_interpreted int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'exercises' AND column_name = 'load_entry'
  ) THEN
    RAISE EXCEPTION 'exercises.load_entry is missing';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_load_entry_check'
  ) INTO has_check;
  IF NOT has_check THEN
    RAISE EXCEPTION 'exercises_load_entry_check is missing';
  END IF;

  SELECT count(*) INTO bad_values
    FROM exercises WHERE load_entry NOT IN ('total', 'per_limb');
  IF bad_values > 0 THEN
    RAISE EXCEPTION 'exercises.load_entry holds % unrecognised values', bad_values;
  END IF;

  -- The record column must be able to say "never told", or the distinction
  -- this migration exists to draw does not exist.
  SELECT c.is_nullable INTO is_nullable
    FROM information_schema.columns c
   WHERE c.table_name = 'session_exercises' AND c.column_name = 'load_entry';
  IF is_nullable IS NULL THEN
    RAISE EXCEPTION 'session_exercises.load_entry is missing';
  END IF;
  IF is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'session_exercises.load_entry must stay nullable — NULL is how a workout says it was never asked';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_exercises_load_entry_check'
  ) INTO has_check;
  IF NOT has_check THEN
    RAISE EXCEPTION 'session_exercises_load_entry_check is missing';
  END IF;

  SELECT count(*) INTO bad_values
    FROM session_exercises
   WHERE load_entry IS NOT NULL AND load_entry NOT IN ('total', 'per_limb');
  IF bad_values > 0 THEN
    RAISE EXCEPTION 'session_exercises.load_entry holds % unrecognised values', bad_values;
  END IF;

  -- On the first run this is zero: no workout that predates the column may
  -- come out of this migration carrying an interpretation nobody gave it. On a
  -- reapply it counts the sessions logged since, which is the point.
  SELECT count(*) INTO already_interpreted
    FROM session_exercises WHERE load_entry IS NOT NULL;

  SELECT count(*) INTO per_limb_count
    FROM exercises WHERE load_entry = 'per_limb';

  RAISE NOTICE 'load_entry present; % movements default to per limb; % session rows carry a recorded reading',
    per_limb_count, already_interpreted;
END $$;
