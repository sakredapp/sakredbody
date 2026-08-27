-- What the number in the weight box means.
--
-- A phone showed "Dumbbell Bench Press · 70 · reps" with no unit and nothing
-- to say whether 70 was in each hand or altogether. Those are a factor of two
-- apart in every derived number the product has, and the Room was publishing
-- the result of guessing.
--
-- Additive and reapply-safe. The default is 'total', which is what every
-- existing row was already being treated as, so no history changes meaning by
-- this migration running — only by a member or the seed saying otherwise.

BEGIN;

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

-- Dumbbells and kettlebells are the equipment whose number is conventionally
-- per hand. Applied only where nobody has said otherwise: the column is the
-- truth once a member has set it, and this is a default catching up with the
-- catalogue rather than an opinion overriding anyone.
--
-- Unilateral movements are deliberately included. For those, 'per_limb' means
-- "this is what one side moved", which is the same statement — see loadShape()
-- in shared/models/training.ts, where performing twice and loading two limbs
-- are kept apart so a one-armed movement is not counted four times.
UPDATE exercises
   SET load_entry = 'per_limb'
 WHERE equipment IN ('dumbbell', 'kettlebell')
   AND load_entry = 'total';

COMMIT;

-- Verified from the catalogue rather than from the success of the statements
-- above. RLS-on-with-zero-policies is the failure that looks like success, and
-- a column that exists with the wrong default is its quieter cousin.
DO $$
DECLARE
  col_exists boolean;
  has_check boolean;
  per_limb_count int;
  bad_values int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'exercises' AND column_name = 'load_entry'
  ) INTO col_exists;
  IF NOT col_exists THEN
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

  SELECT count(*) INTO per_limb_count
    FROM exercises WHERE load_entry = 'per_limb';
  RAISE NOTICE 'load_entry present; % movements read per limb', per_limb_count;
END $$;
