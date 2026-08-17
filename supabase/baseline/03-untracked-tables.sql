-- ─── The columns Drizzle does not model ───────────────────────────────────
--
-- This file used to hold four whole tables, then ten CHECK constraints. It
-- holds neither now: the modules defining those tables are re-exported from
-- `shared/schema.ts` so drizzle-kit emits them in 02, and every constraint in
-- the database — all 116 checks and all 99 foreign keys — is introspected in
-- one place in 07 rather than a handful of them here.
--
-- What is left is the narrowest thing: seven columns production has and
-- `shared/models/*` does not. Found by rebuilding from zero and diffing the
-- result against production, 17 Aug 2026 — 1,001 columns against 1,008.
--
-- ── Why each one is here rather than in the model ─────────────────────────
--
-- Four of them are superseded and still populated:
--
--     tracked_habits.active            → status
--     tracked_habits.added_by          → first_added_by
--     tracked_habits.added_by_user_id  → first_added_by_user_id
--     tracked_habits.target            → tracked_habit_phases.target
--
-- The newer spelling is what the application reads; the older one is NOT NULL
-- with a default, so a rebuilt database that omits it accepts inserts the real
-- one refuses — and any writer still setting it fails against a column that is
-- not there. Modelling them in Drizzle would invite new code to use them.
-- Dropping them is a migration and a decision, not a baseline's business.
--
-- `community_messages.search_vector` is a GENERATED column, which Drizzle
-- cannot express at all, and `idx_community_search` is built on it — Room's
-- search is a GIN index over this expression and nothing else.
--
-- `offerings.application_required` and `user_assigned_habits.start_date` are
-- both NOT NULL with defaults and simply never made it into the models.

ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(body, ''::text))) STORED;

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS application_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.tracked_habits
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS added_by text NOT NULL DEFAULT 'member'::text,
  ADD COLUMN IF NOT EXISTS added_by_user_id text,
  ADD COLUMN IF NOT EXISTS target double precision;

ALTER TABLE public.user_assigned_habits
  ADD COLUMN IF NOT EXISTS start_date date NOT NULL DEFAULT CURRENT_DATE;
