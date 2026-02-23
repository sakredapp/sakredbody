-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase RLS Policies — Sakred Body Coaching Engine
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ARCHITECTURE NOTES:
-- This app connects to Supabase via a direct PostgreSQL pool (service role / postgres).
-- Row-level access control is enforced in the Express backend via middleware:
--   • isAuthenticated — verifies session, attaches userId
--   • isAdmin — checks users.is_admin = 'true'
--
-- RLS below is a DEFENSE-IN-DEPTH layer that protects against:
--   • Accidental direct Supabase client SDK usage
--   • Future mobile/client-side Supabase SDK integration
--
-- The service role connection (used by the Express backend) bypasses RLS.
-- If you switch to the anon key for any client, these policies kick in.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. ENABLE RLS ON ALL TABLES ───────────────────────────────────────────

ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wellness_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS routine_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS habit_routine_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_assigned_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS retreats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS partner_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coaching_messages ENABLE ROW LEVEL SECURITY;

-- ─── 2. DROP EXISTING POLICIES (idempotent re-run) ────────────────────────

DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND policyname LIKE 'sakred_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ─── 3. USER-OWNED TABLES ─────────────────────────────────────────────────
-- Users can only read/write their own rows (auth.uid() = user_id)

-- users: users can read/update their own profile
CREATE POLICY sakred_users_select ON users
  FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY sakred_users_update ON users
  FOR UPDATE USING (auth.uid()::text = id);

-- user_routines: users can read/write their own enrollments
CREATE POLICY sakred_user_routines_select ON user_routines
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY sakred_user_routines_insert ON user_routines
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY sakred_user_routines_update ON user_routines
  FOR UPDATE USING (auth.uid()::text = user_id);

-- habits: users can read/write their own habit rows
CREATE POLICY sakred_habits_select ON habits
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY sakred_habits_insert ON habits
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY sakred_habits_update ON habits
  FOR UPDATE USING (auth.uid()::text = user_id);

-- rewards: users can read their own reward history
CREATE POLICY sakred_rewards_select ON rewards
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY sakred_rewards_insert ON rewards
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- user_assigned_habits: users can manage their own standalone habits
CREATE POLICY sakred_user_assigned_select ON user_assigned_habits
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY sakred_user_assigned_insert ON user_assigned_habits
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY sakred_user_assigned_update ON user_assigned_habits
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY sakred_user_assigned_delete ON user_assigned_habits
  FOR DELETE USING (auth.uid()::text = user_id);

-- booking_requests: users can read/write their own bookings
CREATE POLICY sakred_bookings_select ON booking_requests
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY sakred_bookings_insert ON booking_requests
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY sakred_bookings_update ON booking_requests
  FOR UPDATE USING (auth.uid()::text = user_id);

-- ─── 4. PUBLIC READ-ONLY TABLES ──────────────────────────────────────────
-- Anyone authenticated can read these (no user_id column)

CREATE POLICY sakred_routines_select ON wellness_routines
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY sakred_routine_habits_select ON routine_habits
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY sakred_hra_select ON habit_routine_assignments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY sakred_retreats_select ON retreats
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY sakred_properties_select ON properties
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY sakred_partners_select ON partners
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY sakred_partner_services_select ON partner_services
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── 5. ADMIN WRITE POLICIES ─────────────────────────────────────────────
-- Users with is_admin = 'true' can read/write admin-managed tables

-- Helper function: check if the current Supabase user is an admin
CREATE OR REPLACE FUNCTION public.is_sakred_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid()::text 
      AND is_admin = 'true'
  );
$$;

-- wellness_routines: admin full CRUD
CREATE POLICY sakred_routines_insert ON wellness_routines
  FOR INSERT WITH CHECK (public.is_sakred_admin());

CREATE POLICY sakred_routines_update ON wellness_routines
  FOR UPDATE USING (public.is_sakred_admin());

CREATE POLICY sakred_routines_delete ON wellness_routines
  FOR DELETE USING (public.is_sakred_admin());

-- routine_habits: admin full CRUD
CREATE POLICY sakred_routine_habits_insert ON routine_habits
  FOR INSERT WITH CHECK (public.is_sakred_admin());

CREATE POLICY sakred_routine_habits_update ON routine_habits
  FOR UPDATE USING (public.is_sakred_admin());

CREATE POLICY sakred_routine_habits_delete ON routine_habits
  FOR DELETE USING (public.is_sakred_admin());

-- habit_routine_assignments: admin full CRUD
CREATE POLICY sakred_hra_insert ON habit_routine_assignments
  FOR INSERT WITH CHECK (public.is_sakred_admin());

CREATE POLICY sakred_hra_update ON habit_routine_assignments
  FOR UPDATE USING (public.is_sakred_admin());

CREATE POLICY sakred_hra_delete ON habit_routine_assignments
  FOR DELETE USING (public.is_sakred_admin());

-- Admin can manage all booking requests (read + update concierge notes / status)
CREATE POLICY sakred_bookings_admin_select ON booking_requests
  FOR SELECT USING (public.is_sakred_admin());

CREATE POLICY sakred_bookings_admin_update ON booking_requests
  FOR UPDATE USING (public.is_sakred_admin());

-- Admin can manage partners and services
CREATE POLICY sakred_partners_admin_insert ON partners
  FOR INSERT WITH CHECK (public.is_sakred_admin());

CREATE POLICY sakred_partners_admin_update ON partners
  FOR UPDATE USING (public.is_sakred_admin());

CREATE POLICY sakred_partners_admin_delete ON partners
  FOR DELETE USING (public.is_sakred_admin());

CREATE POLICY sakred_partner_services_admin_insert ON partner_services
  FOR INSERT WITH CHECK (public.is_sakred_admin());

CREATE POLICY sakred_partner_services_admin_update ON partner_services
  FOR UPDATE USING (public.is_sakred_admin());

CREATE POLICY sakred_partner_services_admin_delete ON partner_services
  FOR DELETE USING (public.is_sakred_admin());

-- Admin can manage retreats and properties
CREATE POLICY sakred_retreats_admin_insert ON retreats
  FOR INSERT WITH CHECK (public.is_sakred_admin());

CREATE POLICY sakred_retreats_admin_update ON retreats
  FOR UPDATE USING (public.is_sakred_admin());

CREATE POLICY sakred_retreats_admin_delete ON retreats
  FOR DELETE USING (public.is_sakred_admin());

CREATE POLICY sakred_properties_admin_insert ON properties
  FOR INSERT WITH CHECK (public.is_sakred_admin());

CREATE POLICY sakred_properties_admin_update ON properties
  FOR UPDATE USING (public.is_sakred_admin());

CREATE POLICY sakred_properties_admin_delete ON properties
  FOR DELETE USING (public.is_sakred_admin());

-- ─── 6. SESSIONS TABLE ──────────────────────────────────────────────────
-- Sessions are managed by connect-pg-simple via the service role.
-- No client-side access needed.

CREATE POLICY sakred_sessions_deny ON sessions
  FOR ALL USING (false);

-- ─── 7. APPLICATIONS TABLE ──────────────────────────────────────────────
-- Public insert (unauthenticated users can submit applications)
-- Admin-only read

CREATE POLICY sakred_applications_insert ON applications
  FOR INSERT WITH CHECK (true);

CREATE POLICY sakred_applications_select ON applications
  FOR SELECT USING (public.is_sakred_admin());

-- coaching_messages: users can read/write their own messages
CREATE POLICY sakred_coaching_msgs_select ON coaching_messages
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY sakred_coaching_msgs_insert ON coaching_messages
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Admin can read all messages and update (mark read, etc.)
CREATE POLICY sakred_coaching_msgs_admin_select ON coaching_messages
  FOR SELECT USING (public.is_sakred_admin());

CREATE POLICY sakred_coaching_msgs_admin_insert ON coaching_messages
  FOR INSERT WITH CHECK (public.is_sakred_admin());

CREATE POLICY sakred_coaching_msgs_admin_update ON coaching_messages
  FOR UPDATE USING (public.is_sakred_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEX VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════
-- The following indexes are defined in the Drizzle schema and will be
-- created by `npm run db:push`. Listed here for reference / verification.
--
-- CRITICAL (high-traffic):
--   idx_habits_user_date          ON habits(user_id, scheduled_date)
--   idx_habits_user_routine       ON habits(user_routine_id)
--   idx_habits_completed          ON habits(user_id, completed)
--
-- Idempotency:
--   idx_user_routines_idempotency ON user_routines(client_request_id)
--
-- Junction queries:
--   idx_hra_habit                 ON habit_routine_assignments(habit_id)
--   idx_hra_routine               ON habit_routine_assignments(routine_id)
--
-- Standard lookups:
--   idx_routine_habits_routine    ON routine_habits(routine_id)
--   idx_routine_habits_intensity  ON routine_habits(intensity)
--   idx_user_routines_user        ON user_routines(user_id)
--   idx_user_routines_status      ON user_routines(status)
--   idx_rewards_user              ON rewards(user_id)
--   idx_rewards_user_date         ON rewards(user_id, created_at)
--   idx_user_assigned_habits_user ON user_assigned_habits(user_id)
--   IDX_session_expire            ON sessions(expire)
--
-- To verify indexes exist after db:push, run:
--   SELECT indexname, tablename FROM pg_indexes 
--   WHERE schemaname = 'public' ORDER BY tablename, indexname;
-- ═══════════════════════════════════════════════════════════════════════════
