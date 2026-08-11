-- Direction: which way a thing runs, Yin or Yang.
--
-- Three tables, one vocabulary. Habits are the reason this exists now — the
-- member home shows Restore and Build as the two halves of a lifestyle, and
-- until a habit can say which half it belongs to, neither card can count
-- anything. Sleep and magnesium are one side; protein and steps are the other.
--
-- Retreats and cohorts get the same column in the same migration because the
-- website already claims it in copy ("a Yin retreat clears and rebuilds, a Yang
-- retreat loads and challenges") and nothing in the product could express it.
-- One vocabulary across all three, or they drift.
--
-- Nullable and un-backfilled deliberately. Every row that exists today predates
-- the idea, so guessing a direction writes a fact nobody checked. NULL means
-- "nobody has said", which is true, and it renders as no badge rather than a
-- wrong one. There is no 'balanced' value: that is what NULL is, and two ways
-- to say the same thing is how a filter starts missing rows.

ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS emphasis text;
ALTER TABLE retreats       ADD COLUMN IF NOT EXISTS emphasis text;
ALTER TABLE cohorts        ADD COLUMN IF NOT EXISTS emphasis text;

DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_emphasis_chk
    CHECK (emphasis IS NULL OR emphasis IN ('yin','yang'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE retreats ADD CONSTRAINT retreats_emphasis_chk
    CHECK (emphasis IS NULL OR emphasis IN ('yin','yang'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cohorts ADD CONSTRAINT cohorts_emphasis_chk
    CHECK (emphasis IS NULL OR emphasis IN ('yin','yang'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The home screen counts today's habits by direction on every load, for every
-- member. The existing idx_habits_user_date narrows to the day; this is the
-- join side of that count.
CREATE INDEX IF NOT EXISTS idx_routine_habits_emphasis
  ON routine_habits (emphasis) WHERE emphasis IS NOT NULL;

-- ─── Tracking mechanics ────────────────────────────────────────────────────
-- Applied as habit_tracking_mechanics. Four columns, not the seven proposed:
-- unit, autoTrackEligible and contextDependent are all derivable, and a
-- derivable column is one that can eventually disagree with its own source.
-- See shared/models/habitTracking.ts.

ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS tracking_type text NOT NULL DEFAULT 'boolean';
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS default_target double precision;
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS health_metric text;
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS polarity_strength text NOT NULL DEFAULT 'strong';

DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_tracking_type_chk
    CHECK (tracking_type IN ('boolean','minutes','hours','count','steps','ounces','litres','grams','servings','rating','time-of-day'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_polarity_strength_chk
    CHECK (polarity_strength IN ('strong','contextual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A boolean habit has nothing to hit; a measured one is meaningless without a
-- number. Enforced so a half-filled row cannot reach the app.
DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_target_chk
    CHECK ((tracking_type = 'boolean' AND default_target IS NULL)
        OR (tracking_type <> 'boolean' AND default_target IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
