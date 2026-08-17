-- ─── Row-level security ───────────────────────────────────────────────────
--
-- Drizzle models none of this, which is the other half of why `push` left the
-- repository unable to rebuild itself: the schema files describe the shape of
-- the data and say nothing about who may read a row.
--
-- Introspected from production, 16 Aug 2026: 89 of 93 tables have RLS enabled
-- and 154 policies between them.
--
-- ── The four that do not, stated rather than hidden ───────────────────────
--
--   coach_relationships
--   health_connections
--   health_days
--   health_workouts
--
-- CLAUDE.md says "Every table has RLS". That is not true of these four, and
-- they hold sleep, heart rate, workouts and who coaches whom — the most
-- sensitive rows in the product. It is defensible if every read goes through
-- the server's service-role connection and no anon key ever touches them; it
-- is not defensible silently. Recorded here so the QA branch reproduces
-- production exactly, and so the decision has somewhere to be argued.

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centre_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centre_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_checkin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_intentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebook_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebook_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebook_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_routine_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.masterclass_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.masterclass_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_build_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retreats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rhythm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rhythm_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestion_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terrain_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_habit_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_habit_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_assigned_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_category_subs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_centre_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cosmology ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_removed_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_shop_checkoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;
