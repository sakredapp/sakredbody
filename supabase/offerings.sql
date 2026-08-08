-- Offerings — the scheduled catalogue.
--
-- `cohorts` was built for masterminds. The shape turned out to be the general
-- one: a thing that happens at a time, led by someone, that a member joins.
-- A retreat, a webinar, and a one-hour talk from a visiting practitioner are
-- the same row with different values.
--
-- So this widens rather than copies. Four tables get renamed and extended, and
-- three are added for hosts. Renaming carries indexes, constraints and RLS
-- policies with it — Postgres tracks dependencies by oid, not by name — so
-- nothing needs re-granting.
--
-- Safe to run: every cohort_* table is empty (0 rows, checked immediately
-- before). `retreats` and `booking_requests` are NOT touched — that is the
-- bespoke concierge flow ("design your own retreat, we call you"), which is a
-- genuinely different transaction from "this is happening on the 14th, come".

BEGIN;

-- ── 1. Rename into the general concept ────────────────────────────────────

ALTER TABLE cohorts            RENAME TO offerings;
ALTER TABLE cohort_members     RENAME TO offering_registrations;
ALTER TABLE cohort_sessions    RENAME TO offering_sessions;
ALTER TABLE cohort_attendance  RENAME TO session_attendance;

ALTER TABLE offering_registrations RENAME COLUMN cohort_id TO offering_id;
ALTER TABLE offering_sessions      RENAME COLUMN cohort_id TO offering_id;

-- The community's cohort-gated rooms point at this too.
ALTER TABLE channels RENAME COLUMN cohort_id TO offering_id;

-- Index names are cosmetic but they are what someone reads at 2am.
ALTER INDEX IF EXISTS idx_cohorts_status              RENAME TO idx_offerings_status;
ALTER INDEX IF EXISTS idx_cohort_members_cohort       RENAME TO idx_offering_registrations_offering;
ALTER INDEX IF EXISTS idx_cohort_members_user         RENAME TO idx_offering_registrations_user;
ALTER INDEX IF EXISTS uq_cohort_members               RENAME TO uq_offering_registrations;
ALTER INDEX IF EXISTS idx_cohort_sessions_cohort      RENAME TO idx_offering_sessions_offering;
ALTER INDEX IF EXISTS idx_cohort_attendance_session   RENAME TO idx_session_attendance_session;
ALTER INDEX IF EXISTS uq_cohort_attendance            RENAME TO uq_session_attendance;
ALTER INDEX IF EXISTS idx_channels_cohort             RENAME TO idx_channels_offering;

-- ── 2. Time becomes absolute ──────────────────────────────────────────────
--
-- `timestamp without time zone` says "7pm" without saying whose. That is fine
-- for a retreat everyone flies to and wrong the instant one attendee is
-- somewhere else — which is the entire point of an online talk. The existing
-- naive values are interpreted as UTC, which is exactly right here because
-- there are none.

ALTER TABLE offering_sessions
  ALTER COLUMN starts_at TYPE timestamptz USING starts_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

ALTER TABLE offerings
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE offering_registrations
  ALTER COLUMN applied_at TYPE timestamptz USING applied_at AT TIME ZONE 'UTC',
  ALTER COLUMN decided_at TYPE timestamptz USING decided_at AT TIME ZONE 'UTC';

ALTER TABLE session_attendance
  ALTER COLUMN recorded_at TYPE timestamptz USING recorded_at AT TIME ZONE 'UTC';

-- ── 3. Widen the offering ─────────────────────────────────────────────────

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS slug              text,
  ADD COLUMN IF NOT EXISTS summary           text,
  ADD COLUMN IF NOT EXISTS timezone          text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS registration_mode text NOT NULL DEFAULT 'application',
  ADD COLUMN IF NOT EXISTS min_tier_rank     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meeting_url       text,
  ADD COLUMN IF NOT EXISTS replay_url        text,
  ADD COLUMN IF NOT EXISTS is_featured       boolean NOT NULL DEFAULT false;

-- Capacity was NOT NULL DEFAULT 12, which is right for a mastermind and wrong
-- for a webinar. NULL now means unlimited.
ALTER TABLE offerings ALTER COLUMN capacity DROP NOT NULL;
ALTER TABLE offerings ALTER COLUMN capacity DROP DEFAULT;

-- Backfill a slug for anything that predates the column, then lock it down.
UPDATE offerings
   SET slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g') || '-' || left(id::text, 6)
 WHERE slug IS NULL;

ALTER TABLE offerings ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_offerings_slug ON offerings (slug);
CREATE INDEX IF NOT EXISTS idx_offerings_kind  ON offerings (kind);
CREATE INDEX IF NOT EXISTS idx_offerings_start ON offerings (start_date);
CREATE INDEX IF NOT EXISTS idx_offerings_tier  ON offerings (min_tier_rank);

ALTER TABLE offering_sessions
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS replay_url  text;

CREATE INDEX IF NOT EXISTS idx_offering_sessions_starts ON offering_sessions (starts_at);

-- ── 4. Hosts ──────────────────────────────────────────────────────────────
--
-- Not a `users` row. Most people who give a talk here will never hold a member
-- account, and requiring one would mean inventing logins for guests. `user_id`
-- is the optional bridge for hosts who are also members, so a coach can see
-- their own roster.

CREATE TABLE IF NOT EXISTS hosts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  title       text,
  bio         text,
  avatar_url  text,
  credentials text[],
  website     text,
  instagram   text,
  user_id     varchar,
  kind        text NOT NULL DEFAULT 'internal',
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hosts_user   ON hosts (user_id);
CREATE INDEX IF NOT EXISTS idx_hosts_active ON hosts (is_active);

CREATE TABLE IF NOT EXISTS offering_hosts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  host_id     uuid NOT NULL REFERENCES hosts(id)     ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'lead',
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_offering_hosts_offering ON offering_hosts (offering_id);
CREATE INDEX IF NOT EXISTS idx_offering_hosts_host     ON offering_hosts (host_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_offering_hosts    ON offering_hosts (offering_id, host_id);

CREATE TABLE IF NOT EXISTS session_hosts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES offering_sessions(id) ON DELETE CASCADE,
  host_id    uuid NOT NULL REFERENCES hosts(id)            ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_session_hosts_session ON session_hosts (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_hosts   ON session_hosts (session_id, host_id);

-- ── 5. RLS ────────────────────────────────────────────────────────────────
--
-- The renamed tables keep the policies they already had. The three new ones
-- need their own. Reads go through the Express layer with the service role, so
-- these bound a direct PostgREST call rather than the app — but a table with
-- RLS on and no policy is the failure that looks like success, so they are
-- written out rather than left implied.

ALTER TABLE hosts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_hosts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hosts_read ON hosts;
CREATE POLICY hosts_read ON hosts
  FOR SELECT USING (is_active);

DROP POLICY IF EXISTS offering_hosts_read ON offering_hosts;
CREATE POLICY offering_hosts_read ON offering_hosts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM offerings o
             WHERE o.id = offering_hosts.offering_id
               AND o.status <> 'draft')
  );

DROP POLICY IF EXISTS session_hosts_read ON session_hosts;
CREATE POLICY session_hosts_read ON session_hosts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM offering_sessions s
              JOIN offerings o ON o.id = s.offering_id
             WHERE s.id = session_hosts.session_id
               AND o.status <> 'draft')
  );

COMMIT;

-- ── 6. The one thing a rename does NOT carry ──────────────────────────────
--
-- ALTER TABLE ... RENAME rewrites policy expressions, because those are stored
-- as parsed trees. It does NOT rewrite function bodies, which are stored as
-- text. `can_see_channel` was left pointing at `c.cohort_id` and
-- `cohort_members`, neither of which exists any more — so every RLS evaluation
-- on `channels` would have raised instead of returning false.
--
-- This is the risk the community module's header warns about: the visibility
-- rule is written twice, once in TypeScript and once in SQL. Both were changed.

CREATE OR REPLACE FUNCTION public.can_see_channel(p_user_id text, p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = p_channel_id
      AND c.is_active
      AND public.member_tier_rank(p_user_id) >= c.min_tier_rank
      -- An offering's room is for that offering's confirmed registrants,
      -- whatever tier they hold.
      AND (
        c.offering_id IS NULL
        OR EXISTS (
          SELECT 1 FROM offering_registrations r
          WHERE r.offering_id = c.offering_id
            AND r.user_id = p_user_id
            AND r.status = 'confirmed'
        )
      )
  );
$function$;

-- ── 7. Constraints the rename carried but didn't widen ────────────────────
--
-- A rename keeps CHECK constraints intact, which means it keeps them *wrong*
-- when the concept widens. `cohorts_kind_chk` still only allowed the three
-- mastermind kinds, so inserting a talk failed; and the registration status
-- check never knew about 'waitlist', which the open-registration path writes
-- the moment an event is full. Both found by smoke-testing an insert rather
-- than by reading the schema.

BEGIN;

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS cohorts_kind_chk;
ALTER TABLE offerings ADD CONSTRAINT offerings_kind_chk
  CHECK (kind IN ('retreat','mastermind','circle','webinar','talk','workshop','intensive'));

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS cohorts_format_chk;
ALTER TABLE offerings ADD CONSTRAINT offerings_format_chk
  CHECK (format IN ('in_person','virtual','hybrid'));

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS cohorts_status_chk;
ALTER TABLE offerings ADD CONSTRAINT offerings_status_chk
  CHECK (status IN ('draft','open','closed','running','complete'));

-- Never existed, because the column is new.
ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_registration_mode_chk;
ALTER TABLE offerings ADD CONSTRAINT offerings_registration_mode_chk
  CHECK (registration_mode IN ('open','application','invite'));

ALTER TABLE offering_registrations DROP CONSTRAINT IF EXISTS cohort_members_status_chk;
ALTER TABLE offering_registrations ADD CONSTRAINT offering_registrations_status_chk
  CHECK (status IN ('applied','invited','confirmed','waitlist','declined','withdrawn'));

ALTER TABLE offering_hosts DROP CONSTRAINT IF EXISTS offering_hosts_role_chk;
ALTER TABLE offering_hosts ADD CONSTRAINT offering_hosts_role_chk
  CHECK (role IN ('lead','co_host','guest'));

ALTER TABLE hosts DROP CONSTRAINT IF EXISTS hosts_kind_chk;
ALTER TABLE hosts ADD CONSTRAINT hosts_kind_chk
  CHECK (kind IN ('internal','coach','partner'));

COMMIT;
