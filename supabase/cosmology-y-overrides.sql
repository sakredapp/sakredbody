-- ═══════════════════════════════════════════════════════════════════════════
-- The Y in a member's name
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Y is a vowel in Kyle and a consonant in Maya. Soul urge is built from vowels
-- alone and personality from consonants alone, so a misclassified Y does not
-- round a number off — it moves a letter from one number to the other and
-- makes both wrong.
--
-- shared/utils/almanac.ts classifies it by syllable and gets the common cases
-- right (20 real names under test). It cannot be perfect: English names come
-- from everywhere and pronunciation is the actual determinant. So the member
-- can correct it, and their answer is stored here.
--
-- Keyed `Word:index`, value true when the Y is a vowel. Null — the case for
-- every member without a Y, and most with one — means use the classifier.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE user_cosmology ADD COLUMN IF NOT EXISTS y_overrides jsonb;

COMMENT ON COLUMN user_cosmology.y_overrides IS
  'Member''s own answer about a Y in their birth name, keyed Word:index -> true when the Y is a vowel. Null means use the classifier in shared/utils/almanac.ts.';

-- ─── Verify ────────────────────────────────────────────────────────────────
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'user_cosmology' AND column_name = 'y_overrides';
