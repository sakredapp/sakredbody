-- ═══════════════════════════════════════════════════════════════════════════
-- The Body Map — energy centres, readings, cosmology
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- Safe to re-run. Mirrors shared/models/energy.ts.
--
-- Everything here is interpretive. It explains what a member is doing and why
-- it is sequenced that way. It is not diagnosis. See docs/VISION.md §4.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS energy_centres (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  aspect        text,
  body_region   text,
  element       text,
  color_hex     text,
  description   text,
  when_blocked  text,
  when_flowing  text,
  axis_position integer NOT NULL DEFAULT 50,
  sort_order    integer NOT NULL DEFAULT 0,
  is_published  boolean NOT NULL DEFAULT true,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_energy_centres_published ON energy_centres (is_published);

DO $$ BEGIN
  ALTER TABLE energy_centres ADD CONSTRAINT energy_centres_element_chk
    CHECK (element IS NULL OR element IN ('earth','water','fire','air','ether'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Centre ↔ habit ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS centre_habits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id  text NOT NULL REFERENCES energy_centres(id) ON DELETE CASCADE ON UPDATE CASCADE,
  habit_id   uuid NOT NULL REFERENCES routine_habits(id) ON DELETE CASCADE,
  action     text NOT NULL DEFAULT 'moves',
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_centre_habits_centre ON centre_habits (centre_id);
CREATE INDEX IF NOT EXISTS idx_centre_habits_habit  ON centre_habits (habit_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_centre_habits  ON centre_habits (centre_id, habit_id);

DO $$ BEGIN
  ALTER TABLE centre_habits ADD CONSTRAINT centre_habits_action_chk
    CHECK (action IN ('moves','opens','grounds','clears'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Centre ↔ protocol ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS centre_routines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id  text NOT NULL REFERENCES energy_centres(id) ON DELETE CASCADE ON UPDATE CASCADE,
  routine_id text NOT NULL REFERENCES wellness_routines(id) ON DELETE CASCADE ON UPDATE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_centre_routines_centre  ON centre_routines (centre_id);
CREATE INDEX IF NOT EXISTS idx_centre_routines_routine ON centre_routines (routine_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_centre_routines   ON centre_routines (centre_id, routine_id);

-- ─── Readings ──────────────────────────────────────────────────────────────
-- Append-only. What a coach wants to see is movement, not a snapshot, so there
-- is deliberately no unique constraint and nothing ever updates a row.

CREATE TABLE IF NOT EXISTS user_centre_readings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar NOT NULL,
  centre_id   text NOT NULL REFERENCES energy_centres(id) ON DELETE CASCADE ON UPDATE CASCADE,
  state       text NOT NULL,
  note        text,
  recorded_by text NOT NULL DEFAULT 'member',
  recorded_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_centre_readings_user
  ON user_centre_readings (user_id);
CREATE INDEX IF NOT EXISTS idx_centre_readings_user_centre
  ON user_centre_readings (user_id, centre_id, recorded_at DESC);

DO $$ BEGIN
  ALTER TABLE user_centre_readings ADD CONSTRAINT centre_readings_state_chk
    CHECK (state IN ('blocked','stirring','open'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE user_centre_readings ADD CONSTRAINT centre_readings_by_chk
    CHECK (recorded_by IN ('member','coach'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Cosmology ─────────────────────────────────────────────────────────────
-- Timing and disposition, never prediction. One row per member, all optional.

CREATE TABLE IF NOT EXISTS user_cosmology (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          varchar NOT NULL,
  birth_date       date,
  birth_time       text,
  birth_place      text,
  sun_sign         text,
  moon_sign        text,
  rising_sign      text,
  life_path_number integer,
  disposition      text,
  created_at       timestamp DEFAULT now(),
  updated_at       timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_cosmology ON user_cosmology (user_id);

-- ─── Row level security ────────────────────────────────────────────────────

ALTER TABLE energy_centres       ENABLE ROW LEVEL SECURITY;
ALTER TABLE centre_habits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE centre_routines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_centre_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cosmology       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['energy_centres','centre_habits','centre_routines']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin())',
      t || '_write', t);
  END LOOP;
END $$;

-- Readings and birth data are among the most personal things in the product.
-- Members see their own; admins see all, because a coach has to.
DROP POLICY IF EXISTS centre_readings_own ON user_centre_readings;
CREATE POLICY centre_readings_own ON user_centre_readings
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS centre_readings_insert ON user_centre_readings;
CREATE POLICY centre_readings_insert ON user_centre_readings
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS cosmology_own ON user_cosmology;
CREATE POLICY cosmology_own ON user_cosmology
  FOR ALL USING (user_id = auth.uid()::text OR public.is_sakred_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_sakred_admin());

-- ─── Seed: the nine centres ────────────────────────────────────────────────
-- Written to the guardrail — what a member notices, never a named condition.
-- Edit freely in the admin; this is a starting point, not doctrine.

INSERT INTO energy_centres
  (id, name, aspect, body_region, element, color_hex, axis_position, sort_order,
   description, when_blocked, when_flowing)
VALUES
  ('crown',      'Crown',      'Clarity',   'top of the head',   'ether',  4,  1,
   'Where attention rests when nothing is pulling at it.',
   'Thinking feels loud. Decisions take longer than they should.',
   'Quiet behind the eyes. Choices arrive already made.'),

  ('brow',       'Brow',       'Sight',     'between the brows', 'ether', 12,  2,
   'How clearly you see what is actually in front of you.',
   'Screens feel heavier. Sleep comes late.',
   'Focus holds without effort. Evenings settle on their own.'),

  ('throat',     'Throat',     'Voice',     'throat and jaw',    'air',   20,  3,
   'What gets said, and what gets held.',
   'Jaw stays tight. Sentences get swallowed.',
   'Speech is unhurried. The jaw lets go at night.'),

  ('heart',      'Heart',      'Openness',  'chest and lungs',   'air',   30,  4,
   'Breath and circulation, and what you let close.',
   'Breath sits high in the chest. Company is tiring.',
   'Breath drops low. People are easy again.'),

  ('diaphragm',  'Diaphragm',  'Breath',    'lower ribs',        'air',   38,  5,
   'The floor of the breath and the ceiling of digestion.',
   'A band under the ribs. Full breaths stop short.',
   'Ribs widen sideways. Breath reaches the belly.'),

  ('solar',      'Solar',      'Fire',      'upper abdomen',     'fire',  46,  6,
   'Digestive fire — what you can actually break down.',
   'Meals sit. Energy dips an hour after eating.',
   'Hunger is clean and on time. Food moves through.'),

  ('gut',        'Gut',        'Terrain',   'lower abdomen',     'earth', 56,  7,
   'The terrain itself — where most of this work is done.',
   'Bloating, irregularity, appetite that swings.',
   'Regular, unremarkable, forgettable. Which is the point.'),

  ('sacral',     'Sacral',     'Flow',      'pelvis and hips',   'water', 68,  8,
   'Fluid, drainage, and the movement of everything downward.',
   'Stiff hips in the morning. Puffiness that lingers.',
   'Hips loosen early. Swelling comes down overnight.'),

  ('root',       'Root',       'Ground',    'pelvic floor and feet', 'earth', 84, 9,
   'Contact with the ground, and the sense that you are on it.',
   'Restlessness at rest. Cold hands and feet.',
   'Weight settles into the feet. Stillness stops being work.')
ON CONFLICT (id) DO NOTHING;

-- Verify:
--   SELECT id, name, axis_position FROM energy_centres ORDER BY sort_order;
