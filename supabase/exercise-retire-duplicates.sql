-- ═══════════════════════════════════════════════════════════════════════════
-- Retire the nine pre-catalogue rows the catalogue now names better
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The original twenty-five movements were seeded before the catalogue module
-- existed. Sixteen of them share an id with a catalogue row and were simply
-- updated in place by the sync. Nine do not, and are duplicates under worse
-- names:
--
--   bench-press           → barbell-bench-press
--   incline-bench-press   → incline-barbell-bench-press
--   deadlift              → conventional-deadlift
--   trap-bar-deadlift     → trap-bar-deadlift (hyphenated in the catalogue)
--   overhead-press        → barbell-overhead-press
--   hip-thrust            → barbell-hip-thrust
--   dip                   → dip-chest-emphasis / dip-triceps-emphasis
--   farmer-carry          → farmers-carry
--   row-erg               → rowing-ergometer
--
-- Leaving them active means a member searching "bench press" is offered two
-- rows for the same lift and their history splits across whichever they
-- happened to tap.
--
-- Deactivated rather than deleted, and only after confirming each has zero
-- logged sets, zero prescriptions and zero template rows. `is_active` is the
-- reversible half of the decision: nothing is lost, the picker filters on it,
-- and if one of these turns out to be referenced from content somewhere the
-- fix is a single UPDATE rather than a restore.
--
-- The catalogue sync sets `is_active = true` only for rows it writes, so this
-- is not undone the next time it runs.

UPDATE exercises
SET is_active = false
WHERE owner_user_id IS NULL
  AND id IN (
    'bench-press', 'incline-bench-press', 'deadlift', 'trap-bar-deadlift',
    'overhead-press', 'hip-thrust', 'dip', 'farmer-carry', 'row-erg'
  )
  AND NOT EXISTS (SELECT 1 FROM workout_sets s WHERE s.exercise_id = exercises.id)
  AND NOT EXISTS (SELECT 1 FROM habit_exercises h WHERE h.exercise_id = exercises.id)
  AND NOT EXISTS (
    SELECT 1 FROM member_workout_exercises m WHERE m.exercise_id = exercises.id
  );
