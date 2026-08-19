-- ═══════════════════════════════════════════════════════════════════════════
--  What Sakred recommended — the left side of every question worth asking.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `events` records what a member did. Nothing has ever recorded what the
--  product said first, so "did the thing we suggested help" was not a hard
--  query, it was an impossible one: the join had one side.
--
--  Two tables. `recommendation_events` is one row per recommendation — not
--  per render, see the unique index below — and `recommendation_feedback` is
--  the member's verdict on one, at most one per member per recommendation.
--
--  ── What is deliberately NULL here ──────────────────────────────────────
--
--  model_provider, model_id, prompt_version. The executed-path audit in
--  docs/intelligence-map.md established that no member-facing recommendation
--  in this product is produced by a language model: Terrain, Today, Today's
--  Build and Rhythm are deterministic, and the one Bedrock call in the
--  repository is reachable only from the daily-note cron and an admin route.
--
--  The columns exist because the record must be able to say "a model made
--  this" the day one does. Filling them in now, to make the schema look like
--  an AI schema, would destroy the only thing they are for: the first time a
--  recommendation is wrong, nobody could tell whether a rule or a model was
--  wrong.
--
--  ── What is deliberately absent ─────────────────────────────────────────
--
--  Every health value. `reason_codes` carries `sleep_deficit_large`, never
--  the hours; `provenance` carries the shape of the decision — which slot,
--  which rank, whether novelty broke the tie — and never a measurement and
--  never a sentence the member read. The because-line stays in the request
--  that generated it.

-- ─── 1. THE RECOMMENDATION ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL,

  recommendation_type text NOT NULL,
  recommendation_key  text NOT NULL,
  on_date             text NOT NULL,
  surface             text NOT NULL,

  brain_version             text NOT NULL,
  decision_logic_version    text NOT NULL,
  guidance_version          text NOT NULL,
  pattern_algorithm_version text,

  model_provider text,
  model_id       text,
  prompt_version text,

  canonical_action_type text,
  canonical_action_id   text,

  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance   jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at    timestamptz NOT NULL DEFAULT now(),
  last_shown_at timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  completed_at  timestamptz,
  dismissed_at  timestamptz
);

--  The identity of a recommendation, and the reason this table does not grow
--  with page loads. A member who opens Today four times before lunch has been
--  recommended three things, four times — not twelve things.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recommendation_identity
  ON recommendation_events (user_id, on_date, recommendation_type, recommendation_key, surface);

CREATE INDEX IF NOT EXISTS idx_recommendation_user_date
  ON recommendation_events (user_id, on_date);
CREATE INDEX IF NOT EXISTS idx_recommendation_type_time
  ON recommendation_events (recommendation_type, created_at);
CREATE INDEX IF NOT EXISTS idx_recommendation_action
  ON recommendation_events (canonical_action_type, canonical_action_id);

COMMENT ON COLUMN recommendation_events.reason_codes IS
  'Closed vocabulary from shared/models/brain.ts. Names the grounds, never '
  'the values: sleep_deficit_large, never the hours.';
COMMENT ON COLUMN recommendation_events.model_provider IS
  'NULL for every deterministic recommendation, which is currently all of '
  'them. See docs/intelligence-map.md — this is a finding, not a gap.';

-- ─── 2. THE VERDICT ───────────────────────────────────────────────────────
--
--  One row per member per recommendation. Changing your mind updates it;
--  the history of somebody toggling a thumb is not evidence about anything,
--  and keeping it would make every aggregate work out which of five rows
--  counted.

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL
    REFERENCES recommendation_events(id) ON DELETE CASCADE,
  user_id varchar NOT NULL,
  verdict text NOT NULL,
  reason  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recommendation_feedback
  DROP CONSTRAINT IF EXISTS recommendation_feedback_verdict_chk;
ALTER TABLE recommendation_feedback
  ADD CONSTRAINT recommendation_feedback_verdict_chk
  CHECK (verdict IN ('helpful', 'not_helpful'));

--  Nullable on purpose. A thumbs-down that demands a reason before it
--  registers is a survey, and the member who was about to tell us something
--  closes it instead.
ALTER TABLE recommendation_feedback
  DROP CONSTRAINT IF EXISTS recommendation_feedback_reason_chk;
ALTER TABLE recommendation_feedback
  ADD CONSTRAINT recommendation_feedback_reason_chk
  CHECK (reason IS NULL OR reason IN (
    'not_right_for_me', 'bad_timing', 'already_do_this', 'too_difficult',
    'too_easy', 'didnt_feel_good', 'not_relevant', 'other'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS uq_recommendation_feedback
  ON recommendation_feedback (recommendation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user
  ON recommendation_feedback (user_id, created_at);

-- ─── 3. ROW-LEVEL SECURITY ────────────────────────────────────────────────
--
--  Every table in this database has RLS. These two are reached only through
--  the Express server, which holds the service role and does its own
--  authorisation — so the policy set is deliberately empty and the tables are
--  closed to anon and authenticated. RLS-on-with-zero-policies is the
--  failure that looks like success everywhere else in this schema; here it is
--  the intent, and this comment is what distinguishes the two.

ALTER TABLE recommendation_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;

-- ─── 4. PROVE IT ──────────────────────────────────────────────────────────
--
--  A migration that reports success having created nothing is the failure
--  this project has actually had. Verify rather than trust.

DO $$
DECLARE
  cols int;
  idx  int;
BEGIN
  SELECT count(*) INTO cols FROM information_schema.columns
   WHERE table_name = 'recommendation_events'
     AND column_name IN ('brain_version', 'decision_logic_version', 'guidance_version',
                         'pattern_algorithm_version', 'model_provider', 'model_id',
                         'prompt_version', 'canonical_action_type', 'canonical_action_id',
                         'reason_codes', 'provenance');
  IF cols <> 11 THEN
    RAISE EXCEPTION 'recommendation_events is missing provenance columns (found %, expected 11)', cols;
  END IF;

  SELECT count(*) INTO idx FROM pg_indexes
   WHERE tablename = 'recommendation_events' AND indexname = 'uq_recommendation_identity';
  IF idx <> 1 THEN
    RAISE EXCEPTION 'the recommendation identity index is missing — the table would grow per render';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'recommendation_feedback' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'recommendation_feedback has RLS disabled';
  END IF;
END $$;
