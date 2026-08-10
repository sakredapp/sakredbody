-- ═══════════════════════════════════════════════════════════════════════════
-- The movement vocabulary — 18 patterns, 21 kinds of equipment
-- ═══════════════════════════════════════════════════════════════════════════
--
-- GENERATED from MOVEMENT_PATTERNS and EQUIPMENT in shared/models/training.ts
-- by script/seed-exercises.ts. Those arrays are also what the zod enums and the
-- catalogue test read, so this file is the fourth reader of one list rather
-- than a fourth copy of it.
--
-- Run this BEFORE the catalogue: a row using a word the constraint has not
-- heard of is rejected outright, and the whole transactional file rolls back.

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_pattern_chk;
ALTER TABLE exercises ADD CONSTRAINT exercises_pattern_chk
  CHECK (pattern IN ('squat', 'hinge', 'push', 'pull', 'carry', 'core', 'rotation', 'isometric', 'balance', 'locomotion', 'elastic', 'conditioning', 'mobility', 'tissue', 'breath', 'recovery', 'flow', 'sport'));

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_equipment_chk;
ALTER TABLE exercises ADD CONSTRAINT exercises_equipment_chk
  CHECK (equipment IN ('barbell', 'dumbbell', 'kettlebell', 'machine', 'smith_machine', 'cable', 'bodyweight', 'band', 'medicine_ball', 'rings', 'sled', 'mat', 'reformer', 'cadillac', 'chair', 'barrel', 'spine_corrector', 'megaformer', 'barre', 'pilates_ring', 'other'));
