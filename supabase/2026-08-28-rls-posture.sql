-- Row-level security, said out loud.
--
-- ── What was found, by running it ─────────────────────────────────────────
--
-- Supabase grants `anon` and `authenticated` full DML on every table in
-- `public` by default, and this project has 104 of them. Nothing in the client
-- uses the Supabase SDK — the only `createClient` calls in the tree are
-- server-side with the service-role key, for object storage — so the intended
-- boundary has always been "reached through Express, over a direct postgres
-- pool, as the owner". Owners bypass RLS, which is why the application has
-- never noticed what RLS says.
--
-- That makes RLS the only thing standing between the project's public REST
-- endpoint and the data. On the QA branch, as `anon`:
--
--     member_workouts        0 rows      RLS on, no policy — denied
--     workout_sessions       0 rows      RLS on, policies — denied
--     health_days            5 rows      RLS OFF
--     coach_relationships    1 row       RLS OFF
--
-- Four tables had row security disabled entirely: coach_relationships,
-- health_connections, health_days and health_workouts. A member's health
-- history and who coaches whom, readable and writable by anyone holding the
-- project's anon key — a value that is public by design.
--
-- ── The posture, stated rather than inferred ─────────────────────────────
--
-- Every table in `public` has row security ENABLED. A table with zero policies
-- is a deliberate deny-all: nothing reaches it except through the server's own
-- connection, which is the owner. That is not an omission waiting to be
-- filled in, and script/rlsPosture.ts names each one so a future reader does
-- not have to guess — nor "fix" the count by adding a permissive policy.
--
-- Adding policies here would be the wrong move for these four. There is no
-- client identity to write a policy against: `auth.uid()` is a Supabase-auth
-- concept and this product authenticates in Express against its own `users`
-- table. A policy phrased in terms of an identity that never arrives is a
-- policy that either denies everything — which enabling RLS already does,
-- honestly — or is written loosely enough to allow everything.
--
-- Additive and reapply-safe. Enabling RLS on a table the owner reads changes
-- nothing about the application; it changes what everybody else can reach.

BEGIN;

-- ── 1. The four with row security switched off ────────────────────────────

ALTER TABLE coach_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_days         ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_workouts     ENABLE ROW LEVEL SECURITY;

-- ── 2. And one where the policy was the leak ─────────────────────────────
--
-- `coaching_messages` is the private conversation between a member and their
-- coach. Asking as `anon` returned three rows.
--
-- The cause is a disagreement between the file and the database.
-- supabase/rls-policies.sql declares:
--
--     CREATE POLICY sakred_coaching_msgs_select ON coaching_messages
--       FOR SELECT USING (auth.uid()::text = user_id);
--
-- What production actually holds — recorded in supabase/baseline, which is a
-- dump of it — is:
--
--     FOR SELECT TO public USING (true)
--     FOR UPDATE TO public USING (true)
--     FOR INSERT TO public WITH CHECK (true)
--
-- Three of the five declared policies exist at all, and each of the three that
-- does is unconditional. So anybody with the project's anon key could read the
-- coaching thread, edit a message in it, and post into it.
--
-- Dropped rather than corrected to the declared version. `auth.uid()` is a
-- Supabase-auth concept and this product has never issued one — members are
-- rows in its own `users` table, authenticated in Express. A policy written
-- against an identity that never arrives evaluates to NULL for everyone, which
-- denies everyone, which is what dropping them does honestly and without
-- leaving a rule behind that reads as though it were doing something.
--
-- The baseline dump is deliberately not edited. It is the record of what
-- production was; this is the record of what changed.

DROP POLICY IF EXISTS sakred_coaching_msgs_select       ON coaching_messages;
DROP POLICY IF EXISTS sakred_coaching_msgs_insert       ON coaching_messages;
DROP POLICY IF EXISTS sakred_coaching_msgs_update       ON coaching_messages;
DROP POLICY IF EXISTS sakred_coaching_msgs_admin_select ON coaching_messages;
DROP POLICY IF EXISTS sakred_coaching_msgs_admin_insert ON coaching_messages;
DROP POLICY IF EXISTS sakred_coaching_msgs_admin_update ON coaching_messages;

COMMIT;

-- Verified by reading the catalogue, and then by actually being somebody else.
-- A count of enabled tables is the claim; what `anon` can select is the fact.
DO $$
DECLARE
  unprotected text;
  leaked int;
  tbl text;
BEGIN
  SELECT string_agg(tablename, ', ' ORDER BY tablename) INTO unprotected
    FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'row security is off on: %', unprotected;
  END IF;

  -- The four this file is about, asked as the role that could reach them.
  -- SET LOCAL, so the role is dropped when this block's transaction ends
  -- whatever happens next.
  FOREACH tbl IN ARRAY ARRAY['coach_relationships', 'health_connections', 'health_days',
                             'health_workouts', 'coaching_messages']
  LOOP
    SET LOCAL ROLE anon;
    EXECUTE format('SELECT count(*) FROM %I', tbl) INTO leaked;
    RESET ROLE;
    IF leaked > 0 THEN
      RAISE EXCEPTION 'anon can still read % rows from %', leaked, tbl;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coaching_messages') THEN
    RAISE EXCEPTION 'coaching_messages still carries a policy';
  END IF;

  RAISE NOTICE 'every table in public has row security enabled; anon reads none of the five';
END $$;
