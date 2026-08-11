-- Rhythm, as history — and the two answers to a suggestion.
--
-- See shared/models/rhythmTracking.ts for why this is events and not a
-- current_phase column, and shared/models/suggestions.ts for why "not today"
-- and "not for me" are the same table with a nullable date.
--
-- Runs whole-file transactionally through the Management API. Verify RLS after
-- applying: on-with-zero-policies is the failure that looks like success.

-- ═══ 1. Whose rhythm ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rhythm_subjects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation          text NOT NULL,
  label             text,
  -- Reserved for the consent flow. Nothing reads it yet, and nothing should
  -- write it until a share record exists to justify the access it implies.
  subject_user_id   varchar REFERENCES users(id) ON DELETE SET NULL,
  -- Asked outright at setup. There is no honest way to infer it — not from the
  -- member's own sex, not from relationship status, not from a nickname — and
  -- guessing wrong means showing a man cycle guidance about his husband.
  -- NULL is a real answer and selects general guidance, not a default sex.
  subject_sex       text,
  -- How this person likes to be supported. A stable preference rather than an
  -- event, which is why it is a column: asking once beats inferring never.
  support_preference text,
  model             text NOT NULL DEFAULT 'spontaneous_cycle',
  cycle_length      smallint,
  period_length     smallint,
  -- Nullable on purpose: NULL is "we haven't asked", which leads to different
  -- confidence than "she says it's irregular".
  regular           boolean,
  archived_at       timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE rhythm_subjects DROP CONSTRAINT IF EXISTS rhythm_subjects_relation_check;
ALTER TABLE rhythm_subjects ADD CONSTRAINT rhythm_subjects_relation_check
  CHECK (relation IN ('self', 'partner'));

ALTER TABLE rhythm_subjects DROP CONSTRAINT IF EXISTS rhythm_subjects_sex_check;
ALTER TABLE rhythm_subjects ADD CONSTRAINT rhythm_subjects_sex_check
  CHECK (subject_sex IS NULL OR subject_sex IN ('male', 'female'));

ALTER TABLE rhythm_subjects DROP CONSTRAINT IF EXISTS rhythm_subjects_support_check;
ALTER TABLE rhythm_subjects ADD CONSTRAINT rhythm_subjects_support_check
  CHECK (support_preference IS NULL OR support_preference IN
         ('listening', 'practical', 'space', 'company', 'food', 'unknown'));

ALTER TABLE rhythm_subjects DROP CONSTRAINT IF EXISTS rhythm_subjects_model_check;
ALTER TABLE rhythm_subjects ADD CONSTRAINT rhythm_subjects_model_check
  CHECK (model IN ('spontaneous_cycle', 'hormonal_contraception', 'irregular', 'none'));

-- The bounds estimatePhase() actually honours. Outside them it silently falls
-- back to 28, so storing 90 would look accepted and do nothing.
ALTER TABLE rhythm_subjects DROP CONSTRAINT IF EXISTS rhythm_subjects_lengths_check;
ALTER TABLE rhythm_subjects ADD CONSTRAINT rhythm_subjects_lengths_check
  CHECK ((cycle_length IS NULL OR cycle_length BETWEEN 20 AND 45)
     AND (period_length IS NULL OR period_length BETWEEN 1 AND 10));

CREATE INDEX IF NOT EXISTS idx_rhythm_subjects_owner
  ON rhythm_subjects (owner_user_id);

-- One self per member. Two would mean two disagreeing estimates on one screen.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rhythm_subject_self
  ON rhythm_subjects (owner_user_id)
  WHERE relation = 'self' AND archived_at IS NULL;

-- ═══ 2. What happened ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rhythm_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id           uuid NOT NULL REFERENCES rhythm_subjects(id) ON DELETE CASCADE,
  type                 text NOT NULL,
  on_date              date NOT NULL,
  phase                text,
  -- The entire honest basis for saying anything specific about somebody who
  -- has no account. Without a row like this, guidance about another person
  -- falls back to asking a better question — the app holds the member's own
  -- sleep and training and nothing at all about their partner's.
  context_kind         text,
  -- The load-bearing column: only 'self_reported' earns unhedged language on
  -- screen. Decided by the server from the subject's relation, never sent by
  -- a client.
  provenance           text NOT NULL DEFAULT 'member_entered',
  note                 text,
  recorded_by_user_id  varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  superseded_by        uuid REFERENCES rhythm_events(id) ON DELETE SET NULL,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE rhythm_events DROP CONSTRAINT IF EXISTS rhythm_events_type_check;
ALTER TABLE rhythm_events ADD CONSTRAINT rhythm_events_type_check
  CHECK (type IN ('period_started', 'period_ended', 'phase_confirmed', 'note', 'context_noted'));

-- A closed list, because these select guidance. Free text would mean a model
-- reading it and improvising, which is the freestyling the curated-primitives
-- rule exists to prevent. The note column still holds the member's own words,
-- and nothing generates from it.
ALTER TABLE rhythm_events DROP CONSTRAINT IF EXISTS rhythm_events_context_kind_check;
ALTER TABLE rhythm_events ADD CONSTRAINT rhythm_events_context_kind_check
  CHECK (context_kind IS NULL OR context_kind IN
         ('work_stress', 'short_sleep', 'training_hard', 'travel',
          'illness', 'big_event', 'wants_space'));

ALTER TABLE rhythm_events DROP CONSTRAINT IF EXISTS rhythm_events_context_needs_kind;
ALTER TABLE rhythm_events ADD CONSTRAINT rhythm_events_context_needs_kind
  CHECK (type <> 'context_noted' OR context_kind IS NOT NULL);

ALTER TABLE rhythm_events DROP CONSTRAINT IF EXISTS rhythm_events_phase_check;
ALTER TABLE rhythm_events ADD CONSTRAINT rhythm_events_phase_check
  CHECK (phase IS NULL OR phase IN ('menstrual', 'follicular', 'ovulatory', 'luteal'));

-- Confirming a phase without naming one is a row that says nothing and would
-- make estimatePhase() return a confirmed null.
ALTER TABLE rhythm_events DROP CONSTRAINT IF EXISTS rhythm_events_confirm_needs_phase;
ALTER TABLE rhythm_events ADD CONSTRAINT rhythm_events_confirm_needs_phase
  CHECK (type <> 'phase_confirmed' OR phase IS NOT NULL);

ALTER TABLE rhythm_events DROP CONSTRAINT IF EXISTS rhythm_events_provenance_check;
ALTER TABLE rhythm_events ADD CONSTRAINT rhythm_events_provenance_check
  CHECK (provenance IN ('self_reported', 'partner_shared', 'partner_confirmed',
                        'member_entered', 'estimated'));

CREATE INDEX IF NOT EXISTS idx_rhythm_events_subject
  ON rhythm_events (subject_id, on_date DESC);

-- Tapping twice must not produce two anchors that then disagree.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rhythm_event_day
  ON rhythm_events (subject_id, type, on_date);

-- ═══ 3. Not today, or not for me ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS suggestion_dismissals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    text NOT NULL,
  -- NULL means "not for me, ever". A date means "not today", and expires on
  -- its own without teaching the engine anything about a busy Tuesday.
  on_date     date,
  created_at  timestamptz DEFAULT now()
);

-- Two partial indexes, not one: NULLs are distinct in Postgres, so a plain
-- unique index would store the same permanent dismissal a hundred times.
CREATE UNIQUE INDEX IF NOT EXISTS uq_suggestion_dismissal_day
  ON suggestion_dismissals (user_id, category, on_date) WHERE on_date IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_suggestion_dismissal_forever
  ON suggestion_dismissals (user_id, category) WHERE on_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_suggestion_dismissals_user
  ON suggestion_dismissals (user_id);

-- ═══ 4. RLS ════════════════════════════════════════════════════════════════
--
-- The app connects as the owner role and enforces ownership in the route
-- layer, exactly as every other table here does. RLS is on with a deny-all
-- posture so that anything reaching these tables through PostgREST or an
-- anon key sees nothing — this is menstrual data and a note somebody wrote
-- about their partner, which is the most sensitive pair of tables in the
-- database.

ALTER TABLE rhythm_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_dismissals ENABLE ROW LEVEL SECURITY;

-- Deliberately NOT `FORCE ROW LEVEL SECURITY`, however tempting it looks on
-- the most sensitive tables in the database. The application connects as the
-- table owner, and FORCE makes the owner subject to RLS too — with no policy
-- for that role, every read and write from the app would be silently denied.
-- Matching the posture every other table here already uses.

DROP POLICY IF EXISTS rhythm_subjects_service ON rhythm_subjects;
CREATE POLICY rhythm_subjects_service ON rhythm_subjects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS rhythm_events_service ON rhythm_events;
CREATE POLICY rhythm_events_service ON rhythm_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS suggestion_dismissals_service ON suggestion_dismissals;
CREATE POLICY suggestion_dismissals_service ON suggestion_dismissals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
