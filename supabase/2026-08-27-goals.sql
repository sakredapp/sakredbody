-- ═══════════════════════════════════════════════════════════════════════════
--  Goals — the durable half of what a member wants.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  A schema audit ran before this file was written, because five things here
--  already look like goals:
--
--    applications.goals            free text from the intake form
--    wellness_routines.goal        what a routine is for
--    tracked_habits.target         how often to do a habit this week
--    coaching_plan_items.target    what a coach prescribed
--    habit_exercises.target_*      sets and reps on a prescribed line
--
--  Every one of them is a plan, and every one of them dies when the plan
--  changes. A member who wants a six-minute mile still wants it after the
--  intervals stop working and after the coach rewrites the block. That is
--  what has had nowhere to live.
--
--  ── Three tables and why not one ────────────────────────────────────────
--
--    member_goals            where they are going
--    goal_target_revisions   where they were going before
--    goal_progress           what has actually been observed
--
--  The single-table version puts `current_value` on the goal and loses the
--  only thing progress is for. Best and latest are different questions — best
--  is what the body has proved it can do, latest is where it is today — and a
--  column can hold one of them.
--
--  The revisions table exists for a subtler failure. Targets move, healthily:
--  7:00, then 6:30, then 6:00. Without a record of when, a progress row from
--  March reading 6:42 is unreadable — it beat the target at the time and looks
--  like a miss now. A member's history would become a record of failure the
--  day they got ambitious.
--
--  ── What this does NOT do ───────────────────────────────────────────────
--
--  Nothing here marks a goal achieved. `achieved_at` is set by the member and
--  by nobody else. A single 225 lb rep may have been spotted, may have been a
--  fluke, and may be something they want to hold for a month before believing;
--  closing their goal on the strength of one row is the app deciding something
--  it cannot see. `meetsTarget` in shared/models/goals.ts reports that a target
--  was reached and stops there.

-- ─── 1. THE GOAL ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS member_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL,

  title       text NOT NULL,
  description text,

  status   text NOT NULL DEFAULT 'active',
  emphasis text NOT NULL DEFAULT 'build',

  --  The kind decides the shape of the payload. A `{amount, unit}` column for
  --  everything falls over on the first goal anybody actually has: "a
  --  six-minute mile" is two numbers that only mean something together, and
  --  360 seconds labelled "seconds" has lost the mile.
  measurement text  NOT NULL,
  target      jsonb NOT NULL,

  --  What the goal is about, when the catalogue already knows. A slug from
  --  `exercises`, or a normalized activity word from the health readers.
  --  These are the entire mechanism for automatic progress: matching a goal to
  --  a set by comparing titles would attach "Bench Press" to "Bench Press
  --  (Smith)" and be wrong in a way that reads right.
  exercise_id   text,
  activity_type text,

  target_date date,
  sort_order  integer NOT NULL DEFAULT 0,

  --  Attribution, not ownership. A coach may write a goal during a call; the
  --  goal is still the member's, and there is no such thing here as one the
  --  coach can see and the member cannot.
  created_by varchar NOT NULL,
  updated_by varchar NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  achieved_at timestamptz
);

ALTER TABLE member_goals DROP CONSTRAINT IF EXISTS member_goals_status_chk;
ALTER TABLE member_goals ADD CONSTRAINT member_goals_status_chk
  CHECK (status IN ('active', 'paused', 'achieved', 'archived'));

ALTER TABLE member_goals DROP CONSTRAINT IF EXISTS member_goals_emphasis_chk;
ALTER TABLE member_goals ADD CONSTRAINT member_goals_emphasis_chk
  CHECK (emphasis IN ('restore', 'build', 'both'));

ALTER TABLE member_goals DROP CONSTRAINT IF EXISTS member_goals_measurement_chk;
ALTER TABLE member_goals ADD CONSTRAINT member_goals_measurement_chk
  CHECK (measurement IN (
    'time_for_distance', 'reps', 'load_reps', 'duration',
    'distance', 'frequency', 'custom'
  ));

--  A goal is about a movement or about an activity, never both. Two ways to
--  collect evidence for one goal is two ways for them to disagree, and
--  `evidenceFromActivity` already refuses any goal that names a movement —
--  this turns that silent refusal into a rejected write.
ALTER TABLE member_goals DROP CONSTRAINT IF EXISTS member_goals_subject_chk;
ALTER TABLE member_goals ADD CONSTRAINT member_goals_subject_chk
  CHECK (exercise_id IS NULL OR activity_type IS NULL);

CREATE INDEX IF NOT EXISTS idx_member_goals_user     ON member_goals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_member_goals_exercise ON member_goals (exercise_id);
CREATE INDEX IF NOT EXISTS idx_member_goals_activity ON member_goals (activity_type);

-- ─── 2. WHERE THEY WERE GOING BEFORE ──────────────────────────────────────
--
--  One row at creation, one per change, never edited. The goal's own `target`
--  stays the current value because every list needs it in a single read, and
--  the writer sets both in one statement pair. No event sourcing, no
--  rebuild-on-read — just the ability to answer what the target was on the
--  tenth of August.

CREATE TABLE IF NOT EXISTS goal_target_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES member_goals(id) ON DELETE CASCADE,
  user_id varchar NOT NULL,

  --  The kind can change too, rarely: a member who reframes "run more" as "a
  --  six-minute mile" has changed it, and their old observations belong to the
  --  old kind.
  measurement text  NOT NULL,
  target      jsonb NOT NULL,

  changed_by varchar NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_target_revisions
  ON goal_target_revisions (goal_id, created_at);

-- ─── 3. WHAT WAS ACTUALLY OBSERVED ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS goal_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES member_goals(id) ON DELETE CASCADE,
  user_id varchar NOT NULL,

  --  When it happened, not when it was recorded.
  observed_at timestamptz NOT NULL,
  on_date     date NOT NULL,

  measurement text  NOT NULL,
  value       jsonb NOT NULL,

  source           text NOT NULL,
  --  A workout_sets.id, a health_workouts.external_id. NULL for anything a
  --  person typed. See the partial unique index below.
  source_reference text,

  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goal_progress DROP CONSTRAINT IF EXISTS goal_progress_source_chk;
ALTER TABLE goal_progress ADD CONSTRAINT goal_progress_source_chk
  CHECK (source IN ('member', 'workout', 'health', 'coach'));

ALTER TABLE goal_progress DROP CONSTRAINT IF EXISTS goal_progress_measurement_chk;
ALTER TABLE goal_progress ADD CONSTRAINT goal_progress_measurement_chk
  CHECK (measurement IN (
    'time_for_distance', 'reps', 'load_reps', 'duration',
    'distance', 'frequency', 'custom'
  ));

--  Idempotency, and the reason a re-sync is free.
--
--  Health Connect and HealthKit both re-read a trailing window on a timer and
--  hand back the same session with the same id. Without this, a member who ran
--  on Tuesday would collect a fresh "47 minutes" every fifteen minutes until
--  the window moved past it, and their goal would show forty entries for one
--  run.
--
--  Partial, because two things a member typed by hand on the same day are two
--  facts and must both be keepable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_goal_progress_source
  ON goal_progress (goal_id, source, source_reference)
  WHERE source_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress (goal_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_goal_progress_user ON goal_progress (user_id, on_date);

-- ─── 4. WHICH GOALS ACTUALLY MOVED A RECOMMENDATION ───────────────────────
--
--  The recommendation foundation already exists — recommendation_events
--  carries reason codes, canonical action, provenance and version stamps, and
--  recommendation_feedback carries a verdict. None of that needed rebuilding.
--  What was missing is one edge.
--
--  ── Why a table and not relevant_goal_ids jsonb ─────────────────────────
--
--  Because the failure mode is writing all of them. An array field invites a
--  caller to hand it `activeGoals.map(g => g.id)` and produce a row that says
--  every goal influenced every recommendation — which then licenses "Supports
--  your running goal" under advice that had nothing to do with running. A row
--  that has to be inserted deliberately is harder to fill in by accident, and
--  cascades keep it honest when a goal is deleted.
--
--  This is provenance. A goal appears here only when goal relevance genuinely
--  participated in the ranking, and `Why this?` may only mention a goal that
--  is in here. Never a retrospective explanation because a goal exists.

CREATE TABLE IF NOT EXISTS recommendation_goals (
  recommendation_id uuid NOT NULL REFERENCES recommendation_events(id) ON DELETE CASCADE,
  goal_id           uuid NOT NULL REFERENCES member_goals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recommendation_id, goal_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_goals_goal
  ON recommendation_goals (goal_id, created_at);

--  And the plan the recommendation was aware of, when there was one. A single
--  optional pointer rather than a set: a recommendation is made under at most
--  one active plan.
ALTER TABLE recommendation_events ADD COLUMN IF NOT EXISTS plan_item_id uuid;
CREATE INDEX IF NOT EXISTS idx_recommendation_plan_item
  ON recommendation_events (plan_item_id);

-- ─── 5. A PLANNED LINE MAY SAY WHICH GOAL IT SERVES ───────────────────────
--
--  Optional, and it stays optional. Health is not only goal pursuit: sleep,
--  breath and the walk a coach prescribes because somebody is fraying are all
--  legitimate lines in a plan that serve no goal at all. Requiring every
--  planned action to belong to one would turn a coach's judgement into a
--  filing exercise.

ALTER TABLE coaching_plan_items ADD COLUMN IF NOT EXISTS goal_id uuid
  REFERENCES member_goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_coaching_plan_items_goal
  ON coaching_plan_items (goal_id);

-- ─── 6. ROW-LEVEL SECURITY ────────────────────────────────────────────────
--
--  Reached only through the Express server, which holds the service role and
--  does its own authorisation — member, or the coach currently assigned to
--  them, and nobody else. The policy set is therefore deliberately empty and
--  these tables are closed to anon and authenticated.
--
--  RLS-on-with-zero-policies is the failure that looks like success everywhere
--  else in this schema. Here it is the intent, and this comment is what
--  distinguishes the two.

ALTER TABLE member_goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_target_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_progress         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_goals  ENABLE ROW LEVEL SECURITY;

-- ─── 7. PROVE IT ──────────────────────────────────────────────────────────
--
--  A migration that reports success having created nothing is the failure this
--  project has actually had.

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'member_goals'
     AND column_name IN ('title', 'status', 'emphasis', 'measurement', 'target',
                         'exercise_id', 'activity_type', 'created_by', 'updated_by',
                         'achieved_at');
  IF n <> 10 THEN
    RAISE EXCEPTION 'member_goals is missing columns (found %, expected 10)', n;
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE tablename = 'goal_progress' AND indexname = 'uq_goal_progress_source';
  IF n <> 1 THEN
    RAISE EXCEPTION 'the goal progress idempotency index is missing — a re-sync would duplicate every observation';
  END IF;

  --  The index must be partial, or a second hand-typed entry on the same goal
  --  collides with the first and a member cannot correct themselves.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE indexname = 'uq_goal_progress_source' AND indexdef ILIKE '%WHERE%'
  ) THEN
    RAISE EXCEPTION 'uq_goal_progress_source is not partial — manual entries would collide';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'coaching_plan_items' AND column_name = 'goal_id'
  ) THEN
    RAISE EXCEPTION 'coaching_plan_items.goal_id was not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'recommendation_events' AND column_name = 'plan_item_id'
  ) THEN
    RAISE EXCEPTION 'recommendation_events.plan_item_id was not added';
  END IF;

  SELECT count(*) INTO n FROM pg_tables
   WHERE tablename IN ('member_goals', 'goal_target_revisions', 'goal_progress',
                       'recommendation_goals')
     AND rowsecurity;
  IF n <> 4 THEN
    RAISE EXCEPTION 'RLS is not enabled on every goals table (found % of 4)', n;
  END IF;
END $$;
