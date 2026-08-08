-- Wins — the thing you finished.
--
-- Finishing a 28-day cleanse is the most meaningful event in this product and
-- it produced nothing: no record, no acknowledgement, nothing to show anyone.
--
-- A win is a ROW, written once, at the moment it is earned — not derived on
-- read. The inputs move: habits get removed, routines abandoned, templates
-- renamed. If "you completed the Liver Reset" were recomputed every page load
-- it could stop being true, and being un-congratulated is worse than never
-- being congratulated. `props` snapshots what it was about so the card still
-- reads correctly after the protocol behind it is edited or deleted.

BEGIN;

CREATE TABLE IF NOT EXISTS wins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,

  kind       text NOT NULL,

  -- Resolved at award time and stored, never recomputed.
  title      text NOT NULL,
  subtitle   text,

  -- A user_routines id, an offering id, or a streak length as text.
  -- Deliberately not a foreign key: the win outlives the thing it was about.
  subject_id text,

  props      jsonb DEFAULT '{}'::jsonb,

  earned_at  timestamptz DEFAULT now(),
  on_date    text,

  shared_at         timestamptz,
  shared_message_id uuid
);

CREATE INDEX IF NOT EXISTS idx_wins_user ON wins (user_id, earned_at DESC);

-- A win is earned once. The award path runs on every habit toggle, so without
-- this a member ticking a box on day 30 collects the same milestone over and
-- over. ON CONFLICT DO NOTHING against this index is what makes that path safe
-- to call as often as it likes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wins ON wins (user_id, kind, subject_id);

ALTER TABLE wins ADD CONSTRAINT wins_kind_chk
  CHECK (kind IN ('routine_complete','streak','perfect_week','first_step','offering_complete'));

-- ── RLS ───────────────────────────────────────────────────────────────────
-- A member reads their own. Nobody writes through PostgREST: a win a client
-- could forge is not a win.

ALTER TABLE wins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wins_read_own ON wins;
CREATE POLICY wins_read_own ON wins
  FOR SELECT USING (user_id = auth.uid()::text);

COMMIT;

-- ── The NULL trap ─────────────────────────────────────────────────────────
--
-- `uq_wins (user_id, kind, subject_id)` did not do what it looked like it did.
-- Postgres treats NULLs as DISTINCT in a unique index, so two rows with the
-- same (user, kind) and a NULL subject never conflict with each other.
--
-- `first_step` has no subject. So the award path — which runs on every single
-- habit toggle and relies entirely on ON CONFLICT DO NOTHING — would have
-- inserted a fresh "The first one" every time anybody ticked a box, forever.
-- Found by inserting the same win twice and counting, rather than by reading
-- the index definition, which looked correct.
--
-- NULLS NOT DISTINCT (Postgres 15+; this is 17.6) makes the index mean what it
-- was always meant to mean. The alternative — a sentinel string instead of
-- NULL — would work on older versions but lies about the data.

BEGIN;

DROP INDEX IF EXISTS uq_wins;
CREATE UNIQUE INDEX uq_wins ON wins (user_id, kind, subject_id) NULLS NOT DISTINCT;

COMMIT;
