-- A saved workout that keeps its shape.
--
-- `member_workouts` and `member_workout_exercises` have existed for a while,
-- with full CRUD behind them and a "Saved" list in Build. Two things were
-- missing, and both made the feature look absent rather than broken:
--
--   1. Starting one created a session with the right *name* and none of the
--      movements. That is a route fix, not a schema one.
--   2. There was nowhere to record that two of its movements are a superset,
--      so saving a paired workout silently dropped the pairing.
--
-- This is the second. One nullable column, mirroring `session_exercises`
-- exactly — same name, same type, same meaning — so copying a composition in
-- either direction is a copy and not a translation.
--
-- Additive and reapply-safe. Nothing is backfilled: a workout saved before
-- this column existed had no pairing recorded, and inventing one from movement
-- adjacency would be guessing at somebody's programme.


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

ALTER TABLE member_workout_exercises
  ADD COLUMN IF NOT EXISTS superset_group uuid;

CREATE INDEX IF NOT EXISTS idx_member_workout_exercises_group
  ON member_workout_exercises (superset_group);

-- Where a saved workout came from, when it came from a workout somebody did.
--
-- Provenance only. The template is a copy taken at save time, the way a Room
-- card is; editing it does not reach back into the session it was taken from.
-- It is here so a session that has already been saved can stop offering to
-- save it again, and so the list can say what a workout came from.
--
-- No foreign key, deliberately. A member deleting a session should not delete
-- the workout they built out of it, and ON DELETE SET NULL would be a second
-- rule to keep in step with the first.
ALTER TABLE member_workouts
  ADD COLUMN IF NOT EXISTS source_session_id uuid;

CREATE INDEX IF NOT EXISTS idx_member_workouts_source
  ON member_workouts (source_session_id);


-- Verified from the table rather than from the success of the statement above.
DO $$
DECLARE
  is_nullable text;
BEGIN
  SELECT c.is_nullable INTO is_nullable
    FROM information_schema.columns c
   WHERE c.table_name = 'member_workout_exercises'
     AND c.column_name = 'superset_group';

  IF is_nullable IS NULL THEN
    RAISE EXCEPTION 'member_workout_exercises.superset_group is missing';
  END IF;
  IF is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'superset_group must stay nullable — most movements are performed on their own';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'member_workout_exercises'
       AND indexname = 'idx_member_workout_exercises_group'
  ) THEN
    RAISE EXCEPTION 'idx_member_workout_exercises_group is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'member_workouts' AND column_name = 'source_session_id'
  ) THEN
    RAISE EXCEPTION 'member_workouts.source_session_id is missing';
  END IF;

  RAISE NOTICE 'saved workouts can hold a superset and say where they came from';
END $$;
