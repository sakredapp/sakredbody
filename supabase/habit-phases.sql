-- The phase as an immutable contract.
--
-- Nick's protein target is 140g. Two weeks in, his coach raises it to 165g.
--
-- With the target on one mutable row, that UPDATE rewrites two weeks of
-- history: fourteen days he hit become fourteen days he missed, and nothing
-- anywhere records that he was ever asked for 140. The app has decided he
-- failed at something he wasn't doing.
--
-- So: reconfiguration closes the old phase and opens a new one, in one
-- transaction, and every entry points at the phase it was written under.
-- Week one grades against week one's contract forever — no snapshot table, no
-- effective-dated join, no "which version was live on the 3rd" query.
--
-- Four nouns:
--   routine_habits        what a thing IS (canonical, admin-editable)
--   tracked_habits        that this member is on it (standing relationship)
--   tracked_habit_phases  what they were asked to do, and when (FROZEN)
--   habit_entries         what they actually did, on a day
--
-- Plus habit_proposals (a suggestion is not a contract), tracked_habit_links
-- (a habit can belong to a plan and still have been self-chosen),
-- habit_relations (prerequisites and conflicts), terrain_checkins (the seven
-- things a person knows that no device does).

-- ─── 1. CATALOGUE ──────────────────────────────────────────────────────────

ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS habit_key      text;
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS load_class     text;
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS load_tags      text[];
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS priority_level text;
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS max_per_week   integer;
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS terrain_fit    text;
ALTER TABLE routine_habits ADD COLUMN IF NOT EXISTS published      boolean NOT NULL DEFAULT true;

-- Titles are copy and copy gets rewritten. A loader keyed on title inserts a
-- duplicate the day somebody improves the wording, and every member tracking
-- the old row quietly stops matching.
--
-- A plain UNIQUE constraint rather than a partial index, and the difference
-- matters: ON CONFLICT cannot use a partial index without repeating its
-- predicate at every call site, and a loader that has to remember an index
-- predicate is a loader that will forget it. Postgres treats NULLs as distinct
-- by default, so rows an admin creates without a key still don't collide.
DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT uq_routine_habits_key UNIQUE (habit_key);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_load_class_chk
    CHECK (load_class IS NULL OR load_class IN
      ('restorative','supportive','building','adaptive-stressor','depleting','neutral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tags are the *other* true things about an item — hard strength work is
-- primarily building and also an adaptive stressor. Constrained as an array so
-- "building,adaptive-stressor" in a text column never becomes the fix.
DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_load_tags_chk
    CHECK (load_tags IS NULL OR load_tags <@ ARRAY
      ['restorative','supportive','building','adaptive-stressor','depleting','neutral']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_priority_chk
    CHECK (priority_level IS NULL OR priority_level IN ('foundational','supportive','advanced'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_terrain_fit_chk
    CHECK (terrain_fit IS NULL OR terrain_fit IN ('restore','build','either'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE routine_habits ADD CONSTRAINT routine_habits_max_per_week_chk
    CHECK (max_per_week IS NULL OR (max_per_week >= 1 AND max_per_week <= 21));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The picker searches title, keywords and terrain tags. Trigram over title
-- because members type "mag" and mean magnesium.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_routine_habits_title_trgm
  ON routine_habits USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_routine_habits_keywords
  ON routine_habits USING gin (search_keywords);
CREATE INDEX IF NOT EXISTS idx_routine_habits_published
  ON routine_habits (published, emphasis) WHERE published;

-- ─── 2. THE STANDING RELATIONSHIP ──────────────────────────────────────────

ALTER TABLE tracked_habits ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE tracked_habits ADD COLUMN IF NOT EXISTS first_added_by text NOT NULL DEFAULT 'member';
ALTER TABLE tracked_habits ADD COLUMN IF NOT EXISTS first_added_by_user_id text;
ALTER TABLE tracked_habits ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Carry the pre-phase shape across. `active` became `status`; `target` and
-- `added_by` moved to the phase, where they belong to a contract rather than
-- to a relationship that outlives every contract it has.
UPDATE tracked_habits SET status = CASE WHEN active THEN 'active' ELSE 'archived' END
  WHERE status = 'active' AND active IS NOT NULL;
UPDATE tracked_habits SET first_added_by = added_by WHERE added_by IS NOT NULL;
UPDATE tracked_habits SET first_added_by_user_id = added_by_user_id
  WHERE added_by_user_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE tracked_habits ADD CONSTRAINT tracked_habits_status_chk
    CHECK (status IN ('active','paused','completed','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE tracked_habits ADD CONSTRAINT tracked_habits_first_added_by_chk
    CHECK (first_added_by IN ('member','coach'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS uq_tracked_habits_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_habits_live
  ON tracked_habits (user_id, routine_habit_id) WHERE status <> 'archived';

-- RESTRICT, not CASCADE: a catalogue row somebody is on cannot be deleted out
-- from under their history. Unpublish it instead — that is what `published` is.
DO $$ BEGIN
  ALTER TABLE tracked_habits ADD CONSTRAINT tracked_habits_habit_fk
    FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. THE CONTRACT ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tracked_habit_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_habit_id uuid NOT NULL REFERENCES tracked_habits(id) ON DELETE CASCADE,

  -- Denormalised from tracked_habits and both earn it: user_id is what every
  -- authorization check filters on, routine_habit_id is what the resolver needs
  -- to know the tracking type. Neither can drift — a phase belongs to one
  -- tracked habit, which belongs to one member and one catalogue row, for life.
  user_id text NOT NULL,
  routine_habit_id uuid NOT NULL,

  status text NOT NULL DEFAULT 'active',

  -- ── frozen configuration ────────────────────────────────────────────────
  target double precision,
  phase_type text NOT NULL DEFAULT 'ongoing',
  starts_on date NOT NULL,
  duration_days integer,
  schedule_kind text NOT NULL DEFAULT 'daily',
  schedule_days smallint[],
  schedule_count integer,
  recommended_time text,
  source text NOT NULL DEFAULT 'member',
  assigned_by_user_id text,
  member_reason text,
  coach_note text,
  -- ── end frozen ──────────────────────────────────────────────────────────

  -- Derived, not stored twice. A counter is a thing something has to
  -- increment, and the something is a job that didn't run the night the
  -- server restarted.
  ends_on date GENERATED ALWAYS AS (
    CASE WHEN duration_days IS NULL THEN NULL
         ELSE starts_on + (duration_days - 1) END
  ) STORED,

  -- Lifecycle, not configuration. The last day this contract applied.
  closed_on date,
  created_at timestamptz DEFAULT now(),
  closed_at timestamptz,

  CONSTRAINT phase_status_chk CHECK (status IN
    ('active','completed','superseded','cancelled','paused')),
  CONSTRAINT phase_type_chk CHECK (phase_type IN ('ongoing','fixed')),
  CONSTRAINT phase_source_chk CHECK (source IN ('member','coach','plan','retreat','cohort')),
  CONSTRAINT phase_schedule_kind_chk CHECK (schedule_kind IN
    ('daily','days_of_week','times_per_week','weekly','as_needed')),

  -- A fixed phase without a length has no end; an ongoing phase with one is
  -- lying about which kind it is.
  CONSTRAINT phase_duration_chk CHECK (
    (phase_type = 'fixed'   AND duration_days IS NOT NULL AND duration_days BETWEEN 1 AND 365)
 OR (phase_type = 'ongoing' AND duration_days IS NULL)),

  -- The half-written schedule this prevents: kind = 'days_of_week' with no
  -- days, which shows nothing on any day and looks like a sync bug.
  CONSTRAINT phase_schedule_shape_chk CHECK (
    (schedule_kind = 'days_of_week'
       AND schedule_days IS NOT NULL AND array_length(schedule_days,1) BETWEEN 1 AND 7
       AND schedule_count IS NULL)
 OR (schedule_kind = 'times_per_week'
       AND schedule_count IS NOT NULL AND schedule_count BETWEEN 1 AND 7
       AND schedule_days IS NULL)
 OR (schedule_kind IN ('daily','weekly','as_needed')
       AND schedule_days IS NULL AND schedule_count IS NULL)),

  CONSTRAINT phase_days_range_chk CHECK (
    schedule_days IS NULL OR schedule_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),

  CONSTRAINT phase_closed_after_start_chk CHECK (closed_on IS NULL OR closed_on >= starts_on)
);

-- One live contract at a time. The failure mode of a two-statement
-- reconfiguration is two active phases with different targets, and from there
-- nothing downstream can say what the member was asked to do.
CREATE UNIQUE INDEX IF NOT EXISTS uq_phase_one_active
  ON tracked_habit_phases (tracked_habit_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_phase_user_active ON tracked_habit_phases (user_id, status);
CREATE INDEX IF NOT EXISTS idx_phase_tracked ON tracked_habit_phases (tracked_habit_id, starts_on);

-- "Frozen" enforced, not documented.
--
-- A convention that lives only in a comment is a convention somebody breaks at
-- 2am with a one-line fix that looks harmless. Lifecycle columns (status,
-- closed_on, closed_at) stay writable; everything that describes what the
-- person was asked to do does not.
CREATE OR REPLACE FUNCTION tracked_habit_phase_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tracked_habit_id  IS DISTINCT FROM OLD.tracked_habit_id
  OR NEW.user_id           IS DISTINCT FROM OLD.user_id
  OR NEW.routine_habit_id  IS DISTINCT FROM OLD.routine_habit_id
  OR NEW.target            IS DISTINCT FROM OLD.target
  OR NEW.phase_type        IS DISTINCT FROM OLD.phase_type
  OR NEW.starts_on         IS DISTINCT FROM OLD.starts_on
  OR NEW.duration_days     IS DISTINCT FROM OLD.duration_days
  OR NEW.schedule_kind     IS DISTINCT FROM OLD.schedule_kind
  OR NEW.schedule_days     IS DISTINCT FROM OLD.schedule_days
  OR NEW.schedule_count    IS DISTINCT FROM OLD.schedule_count
  OR NEW.recommended_time  IS DISTINCT FROM OLD.recommended_time
  OR NEW.source            IS DISTINCT FROM OLD.source
  OR NEW.assigned_by_user_id IS DISTINCT FROM OLD.assigned_by_user_id
  OR NEW.member_reason     IS DISTINCT FROM OLD.member_reason
  OR NEW.coach_note        IS DISTINCT FROM OLD.coach_note
  THEN
    RAISE EXCEPTION
      'tracked_habit_phases %: a phase is a contract. Close it and open a new one rather than editing what somebody was already asked to do.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tracked_habit_phases_freeze ON tracked_habit_phases;
CREATE TRIGGER tracked_habit_phases_freeze
  BEFORE UPDATE ON tracked_habit_phases
  FOR EACH ROW EXECUTE FUNCTION tracked_habit_phase_freeze();

-- ─── 4. WHAT ACTUALLY HAPPENED ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS habit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tracked_habit_id uuid NOT NULL REFERENCES tracked_habits(id) ON DELETE CASCADE,
  -- The one column that answers the historical-configuration problem: the row
  -- already knows which contract it was written under.
  phase_id uuid NOT NULL REFERENCES tracked_habit_phases(id) ON DELETE CASCADE,
  on_date date NOT NULL,
  value double precision NOT NULL,
  -- 'add' | 'set'. Four taps of +20oz is four adds; "actually it was 165" is
  -- one set, and folding is the same code either way.
  op text NOT NULL DEFAULT 'set',
  -- 'manual' | 'override'. An override outranks health data for its day. A
  -- plain manual entry is only read when there is no health value at all —
  -- nothing anywhere sums a HealthKit step count with a typed one.
  kind text NOT NULL DEFAULT 'manual',
  note text,
  created_by_user_id text,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT habit_entries_op_chk CHECK (op IN ('add','set')),
  CONSTRAINT habit_entries_kind_chk CHECK (kind IN ('manual','override')),
  CONSTRAINT habit_entries_value_chk CHECK (value >= 0 AND value < 1e9)
);

CREATE INDEX IF NOT EXISTS idx_habit_entries_user_date ON habit_entries (user_id, on_date);
CREATE INDEX IF NOT EXISTS idx_habit_entries_tracked_date
  ON habit_entries (tracked_habit_id, on_date);
CREATE INDEX IF NOT EXISTS idx_habit_entries_phase ON habit_entries (phase_id);

-- ─── 5. PROPOSALS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS habit_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  routine_habit_id uuid NOT NULL REFERENCES routine_habits(id) ON DELETE CASCADE,
  emphasis text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  target double precision,
  phase_type text NOT NULL DEFAULT 'ongoing',
  duration_days integer,
  schedule_kind text NOT NULL DEFAULT 'daily',
  schedule_days smallint[],
  schedule_count integer,
  recommended_time text,
  reason text,
  proposed_by text NOT NULL DEFAULT 'coach',
  proposed_by_user_id text,
  responded_at timestamptz,
  resulting_phase_id uuid REFERENCES tracked_habit_phases(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT proposal_status_chk CHECK (status IN ('proposed','accepted','declined','withdrawn')),
  CONSTRAINT proposal_emphasis_chk CHECK (emphasis IN ('yin','yang')),
  CONSTRAINT proposal_by_chk CHECK (proposed_by IN ('coach','system')),
  CONSTRAINT proposal_schedule_kind_chk CHECK (schedule_kind IN
    ('daily','days_of_week','times_per_week','weekly','as_needed'))
);

-- One OPEN proposal per habit per member — not one ever. A habit declined in
-- January can be proposed again in June when the terrain has changed; what
-- must not happen is proposing it again next Tuesday.
CREATE UNIQUE INDEX IF NOT EXISTS uq_proposal_open
  ON habit_proposals (user_id, routine_habit_id) WHERE status = 'proposed';
CREATE INDEX IF NOT EXISTS idx_proposals_user ON habit_proposals (user_id, status);

-- ─── 6. CONTEXT MEMBERSHIP ─────────────────────────────────────────────────

-- Nick already tracks Morning Light because he chose to. In March his coach
-- puts Morning Light in the Coach's Plan. A single `source` column would
-- either overwrite the fact that he chose it, or create a second tracked habit
-- and show him the same item twice with two separate streaks.
CREATE TABLE IF NOT EXISTS tracked_habit_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_habit_id uuid NOT NULL REFERENCES tracked_habits(id) ON DELETE CASCADE,
  context_type text NOT NULL,
  context_id text NOT NULL,
  added_by_user_id text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT link_context_chk CHECK (context_type IN ('plan','cohort','retreat'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_link
  ON tracked_habit_links (tracked_habit_id, context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_tracked_link_context
  ON tracked_habit_links (context_type, context_id);

-- ─── 7. HOW CATALOGUE ITEMS RELATE ─────────────────────────────────────────

-- The engine that reads these is not being built today. The table is, because
-- the alternative is discovering in six months that 200 rows have no way to
-- say "don't add a third stressor to a week that already has two".
CREATE TABLE IF NOT EXISTS habit_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid NOT NULL REFERENCES routine_habits(id) ON DELETE CASCADE,
  related_habit_id uuid NOT NULL REFERENCES routine_habits(id) ON DELETE CASCADE,
  relation text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT habit_relation_chk CHECK (relation IN
    ('requires','conflicts','pairs','replaces','increases')),
  CONSTRAINT habit_relation_self_chk CHECK (habit_id <> related_habit_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_habit_relation
  ON habit_relations (habit_id, related_habit_id, relation);
CREATE INDEX IF NOT EXISTS idx_habit_relation_related ON habit_relations (related_habit_id);

-- ─── 8. TERRAIN SIGNALS ────────────────────────────────────────────────────

-- Seven columns on the profile would hold today's answer and destroy
-- yesterday's, and the entire value of asking is the trend: one low-energy day
-- is a Tuesday, five in a row is something a coach should see.
--
-- Wide rather than long — the opposite of health_days, on purpose. That
-- vocabulary belongs to Apple and Google and keeps growing, so a new metric
-- there has to be a string. This vocabulary is ours and changes about as often
-- as the product's idea of a body does.
CREATE TABLE IF NOT EXISTS terrain_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  on_date date NOT NULL,
  energy smallint,
  recovery smallint,
  nervous_system smallint,
  digestion smallint,
  body_tension smallint,
  mental_clarity smallint,
  drive smallint,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT terrain_scale_chk CHECK (
    (energy         IS NULL OR energy         BETWEEN 1 AND 5) AND
    (recovery       IS NULL OR recovery       BETWEEN 1 AND 5) AND
    (nervous_system IS NULL OR nervous_system BETWEEN 1 AND 5) AND
    (digestion      IS NULL OR digestion      BETWEEN 1 AND 5) AND
    (body_tension   IS NULL OR body_tension   BETWEEN 1 AND 5) AND
    (mental_clarity IS NULL OR mental_clarity BETWEEN 1 AND 5) AND
    (drive          IS NULL OR drive          BETWEEN 1 AND 5))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_terrain_checkin ON terrain_checkins (user_id, on_date);
CREATE INDEX IF NOT EXISTS idx_terrain_checkin_user ON terrain_checkins (user_id, on_date DESC);

-- ─── 9. ACCESS ─────────────────────────────────────────────────────────────
--
-- Stated plainly, because pretending otherwise is worse than the truth: the
-- app connects as service_role, which bypasses RLS by design. Express is
-- therefore the real authorization boundary, and server/habits/authz.ts is
-- where it lives. RLS below exists so that a leaked anon key still reaches
-- nothing — it is a second wall, not the first one.
--
-- The tests that matter are route tests. See script/test-habit-authz.ts.

ALTER TABLE tracked_habit_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_proposals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_habit_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_relations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_checkins     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tracked_habit_phases','habit_entries','habit_proposals',
                           'tracked_habit_links','habit_relations','terrain_checkins']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service', t);
  END LOOP;
END $$;
