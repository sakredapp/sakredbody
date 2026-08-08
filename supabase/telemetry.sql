-- Telemetry — one table, one row per thing that happened.
--
-- There was none. No habit-completion event, no enrollment event, and for a
-- business that earns on affiliate links, no click event on a buy link. Fine
-- while nobody is using the app; indefensible the day someone is.
--
-- One table rather than one per feature: the questions worth asking cut across
-- features ("what did this member do in their first week", "which surface
-- produces buy clicks"), and a table per feature makes those a six-way union.

BEGIN;

CREATE TABLE IF NOT EXISTS events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Null for something that happened before sign-in.
  user_id    varchar,

  -- `domain.action`. Dotted so a prefix match is a category query. The closed
  -- list lives in shared/models/telemetry.ts — kept in code rather than as a
  -- CHECK constraint, because adding an event should not need a migration and
  -- an event we refuse to store is an event nobody learns from.
  name       text NOT NULL,

  -- Where in the app. The same event from two surfaces is two different facts:
  -- a buy click from a shopping list is not a buy click from a product page.
  surface    text,

  -- The thing it happened to. Deliberately NOT a foreign key — an event about
  -- a since-deleted product is still a true fact about the past, and a cascade
  -- here would quietly rewrite history.
  subject_id text,

  props      jsonb DEFAULT '{}'::jsonb,

  -- The member's own calendar date, denormalised. Nearly every question here
  -- is per-day-per-member, and deriving it at query time means re-deciding
  -- what day it was for someone in Los Angeles at 5pm — the exact bug the
  -- habit engine had.
  on_date    text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_user_time ON events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_name_time ON events (name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_subject   ON events (subject_id);
CREATE INDEX IF NOT EXISTS idx_events_date      ON events (on_date);

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Writes go through the Express layer with the service role, which bypasses
-- this. What these policies bound is a direct PostgREST call: a member may
-- read their own trail and nothing else, and nobody may write through that
-- path at all — an event a client could forge is worse than no event.

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_read_own ON events;
CREATE POLICY events_read_own ON events
  FOR SELECT USING (user_id = auth.uid()::text);

COMMIT;
