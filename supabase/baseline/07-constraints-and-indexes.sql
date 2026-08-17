-- ─── Foreign keys, CHECK constraints and the rest of the indexes ──────────
--
-- Introspected from production 17 Aug 2026, and the third thing the empty QA
-- branch found.
--
-- ── What was missing ──────────────────────────────────────────────────────
--
-- Parts 02 and 03 create the tables. Between them they carry 18 foreign keys,
-- 12 CHECK constraints and 283 indexes. Production has 99, 116 and 325. So a
-- database rebuilt from the repository had the right shape and the wrong
-- rules: no cascade from a deleted member to their sessions, no
-- `uniq_open_workout_per_member`, no `uq_coach_relationships_active_member`,
-- nothing stopping a plan naming its own coach as its member. It would have
-- accepted rows production refuses, which is the worst kind of test
-- environment — one that passes and then production does not.
--
-- The gap is not Drizzle's fault. `shared/models/*` declares columns and
-- indexes; almost none of it declares `.references()` or a CHECK, because
-- those arrived through hand-written migrations that ran once against a live
-- database and were never part of what `generate` can see.
--
-- ── Why introspected rather than modelled ─────────────────────────────────
--
-- Moving 99 references and 116 checks into the Drizzle models would rename
-- every one of them: drizzle-kit emits `x_y_z_fk`, production has `x_y_fkey`,
-- and a future migration's `drop constraint if exists` would then silently do
-- nothing. Production's names are the canonical ones. So they are reproduced
-- verbatim, the same way parts 03 to 06 were, and regenerating this file is
-- `npm run db:introspect-constraints` against a database that has them.
--
-- Every statement is drop-if-exists then add, so applying this twice is a
-- no-op rather than an error.
--
-- ── One delta that is deliberate ──────────────────────────────────────────
--
-- Four primary keys and seven unique constraints carry Drizzle's names here
-- and Postgres's defaults in production — `offerings_pkey` against
-- `cohorts_pkey1`, `channels_slug_unique` against `channels_slug_key`. They
-- are the same constraint on the same columns; the production names are
-- fossils of tables renamed years ago. Dropping and recreating a primary key
-- to match a fossil is not worth what it risks, so the difference is recorded
-- here rather than chased.

-- ── 1. The 18 foreign keys Drizzle names differently ──────────────────────
--
-- Same columns, same referenced table. Dropped so production's name is the
-- only one, rather than the relationship being enforced twice.

alter table public.coaching_messages drop constraint if exists coaching_messages_user_id_users_id_fk;
alter table public.habit_products drop constraint if exists habit_products_product_id_products_id_fk;
alter table public.product_links drop constraint if exists product_links_product_id_products_id_fk;
alter table public.routine_products drop constraint if exists routine_products_product_id_products_id_fk;
alter table public.user_shop_checkoffs drop constraint if exists user_shop_checkoffs_product_id_products_id_fk;
alter table public.ebook_entitlements drop constraint if exists ebook_entitlements_ebook_id_ebooks_id_fk;
alter table public.ebook_progress drop constraint if exists ebook_progress_ebook_id_ebooks_id_fk;
alter table public.ebook_progress drop constraint if exists ebook_progress_section_id_ebook_sections_id_fk;
alter table public.ebook_sections drop constraint if exists ebook_sections_ebook_id_ebooks_id_fk;
alter table public.offering_hosts drop constraint if exists offering_hosts_offering_id_offerings_id_fk;
alter table public.offering_hosts drop constraint if exists offering_hosts_host_id_hosts_id_fk;
alter table public.offering_registrations drop constraint if exists offering_registrations_offering_id_offerings_id_fk;
alter table public.offering_sessions drop constraint if exists offering_sessions_offering_id_offerings_id_fk;
alter table public.session_attendance drop constraint if exists session_attendance_session_id_offering_sessions_id_fk;
alter table public.session_hosts drop constraint if exists session_hosts_session_id_offering_sessions_id_fk;
alter table public.session_hosts drop constraint if exists session_hosts_host_id_hosts_id_fk;
alter table public.community_messages drop constraint if exists community_messages_channel_id_channels_id_fk;
alter table public.message_reactions drop constraint if exists message_reactions_message_id_community_messages_id_fk;

-- ── 2. Foreign keys ───────────────────────────────────────────────────────

alter table public.body_measurements drop constraint if exists body_measurements_user_id_fkey;
alter table public.body_measurements add constraint body_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.centre_habits drop constraint if exists centre_habits_centre_id_fkey;
alter table public.centre_habits add constraint centre_habits_centre_id_fkey FOREIGN KEY (centre_id) REFERENCES energy_centres(id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.centre_habits drop constraint if exists centre_habits_habit_id_fkey;
alter table public.centre_habits add constraint centre_habits_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES routine_habits(id) ON DELETE CASCADE;
alter table public.centre_routines drop constraint if exists centre_routines_centre_id_fkey;
alter table public.centre_routines add constraint centre_routines_centre_id_fkey FOREIGN KEY (centre_id) REFERENCES energy_centres(id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.centre_routines drop constraint if exists centre_routines_routine_id_fkey;
alter table public.centre_routines add constraint centre_routines_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES wellness_routines(id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.channel_members drop constraint if exists channel_members_added_by_fkey;
alter table public.channel_members add constraint channel_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
alter table public.channel_members drop constraint if exists channel_members_channel_id_fkey;
alter table public.channel_members add constraint channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE;
alter table public.channel_members drop constraint if exists channel_members_user_id_fkey;
alter table public.channel_members add constraint channel_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.channels drop constraint if exists channels_cohort_id_fkey;
alter table public.channels add constraint channels_cohort_id_fkey FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE;
alter table public.coach_relationships drop constraint if exists coach_relationships_assigned_by_fkey;
alter table public.coach_relationships add constraint coach_relationships_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
alter table public.coach_relationships drop constraint if exists coach_relationships_coach_user_id_fkey;
alter table public.coach_relationships add constraint coach_relationships_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.coach_relationships drop constraint if exists coach_relationships_member_user_id_fkey;
alter table public.coach_relationships add constraint coach_relationships_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.coaching_attachments drop constraint if exists coaching_attachments_message_id_fkey;
alter table public.coaching_attachments add constraint coaching_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES coaching_messages(id) ON DELETE CASCADE;
alter table public.coaching_attachments drop constraint if exists coaching_attachments_uploaded_by_user_id_fkey;
alter table public.coaching_attachments add constraint coaching_attachments_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id);
alter table public.coaching_attachments drop constraint if exists coaching_attachments_user_id_fkey;
alter table public.coaching_attachments add constraint coaching_attachments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_requests_cancelled_by_user_id_fkey;
alter table public.coaching_checkin_requests add constraint coaching_checkin_requests_cancelled_by_user_id_fkey FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id);
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_requests_checkin_id_fkey;
alter table public.coaching_checkin_requests add constraint coaching_checkin_requests_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES terrain_checkins(id) ON DELETE SET NULL;
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_requests_coach_user_id_fkey;
alter table public.coaching_checkin_requests add constraint coaching_checkin_requests_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_requests_member_user_id_fkey;
alter table public.coaching_checkin_requests add constraint coaching_checkin_requests_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_requests_relationship_id_fkey;
alter table public.coaching_checkin_requests add constraint coaching_checkin_requests_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES coach_relationships(id) ON DELETE SET NULL;
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_requests_requested_by_user_id_fkey;
alter table public.coaching_checkin_requests add constraint coaching_checkin_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES users(id);
alter table public.coaching_messages drop constraint if exists coaching_messages_sender_user_id_fkey;
alter table public.coaching_messages add constraint coaching_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL;
alter table public.coaching_messages drop constraint if exists coaching_messages_user_id_fkey;
alter table public.coaching_messages add constraint coaching_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
alter table public.coaching_plan_items drop constraint if exists coaching_plan_items_plan_id_fkey;
alter table public.coaching_plan_items add constraint coaching_plan_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES coaching_plans(id) ON DELETE CASCADE;
alter table public.coaching_plan_items drop constraint if exists coaching_plan_items_routine_habit_id_fkey;
alter table public.coaching_plan_items add constraint coaching_plan_items_routine_habit_id_fkey FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id);
alter table public.coaching_plans drop constraint if exists coaching_plans_activated_by_user_id_fkey;
alter table public.coaching_plans add constraint coaching_plans_activated_by_user_id_fkey FOREIGN KEY (activated_by_user_id) REFERENCES users(id);
alter table public.coaching_plans drop constraint if exists coaching_plans_coach_user_id_fkey;
alter table public.coaching_plans add constraint coaching_plans_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES users(id);
alter table public.coaching_plans drop constraint if exists coaching_plans_created_by_user_id_fkey;
alter table public.coaching_plans add constraint coaching_plans_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
alter table public.coaching_plans drop constraint if exists coaching_plans_ended_by_user_id_fkey;
alter table public.coaching_plans add constraint coaching_plans_ended_by_user_id_fkey FOREIGN KEY (ended_by_user_id) REFERENCES users(id);
alter table public.coaching_plans drop constraint if exists coaching_plans_member_user_id_fkey;
alter table public.coaching_plans add constraint coaching_plans_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES users(id);
alter table public.coaching_plans drop constraint if exists coaching_plans_relationship_id_fkey;
alter table public.coaching_plans add constraint coaching_plans_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES coach_relationships(id);
alter table public.cohort_attendance drop constraint if exists cohort_attendance_session_id_fkey1;
alter table public.cohort_attendance add constraint cohort_attendance_session_id_fkey1 FOREIGN KEY (session_id) REFERENCES cohort_sessions(id) ON DELETE CASCADE;
alter table public.cohort_members drop constraint if exists cohort_members_cohort_id_fkey1;
alter table public.cohort_members add constraint cohort_members_cohort_id_fkey1 FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE;
alter table public.cohort_sessions drop constraint if exists cohort_sessions_cohort_id_fkey1;
alter table public.cohort_sessions add constraint cohort_sessions_cohort_id_fkey1 FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE;
alter table public.community_messages drop constraint if exists community_messages_channel_id_fkey;
alter table public.community_messages add constraint community_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE;
alter table public.community_messages drop constraint if exists community_messages_parent_id_fkey;
alter table public.community_messages add constraint community_messages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES community_messages(id) ON DELETE CASCADE;
alter table public.content_reports drop constraint if exists content_reports_reporter_id_fkey;
alter table public.content_reports add constraint content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.content_reports drop constraint if exists content_reports_reviewed_by_fkey;
alter table public.content_reports add constraint content_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
alter table public.ebook_entitlements drop constraint if exists ebook_entitlements_ebook_id_fkey;
alter table public.ebook_entitlements add constraint ebook_entitlements_ebook_id_fkey FOREIGN KEY (ebook_id) REFERENCES ebooks(id) ON DELETE CASCADE;
alter table public.ebook_progress drop constraint if exists ebook_progress_ebook_id_fkey;
alter table public.ebook_progress add constraint ebook_progress_ebook_id_fkey FOREIGN KEY (ebook_id) REFERENCES ebooks(id) ON DELETE CASCADE;
alter table public.ebook_progress drop constraint if exists ebook_progress_section_id_fkey;
alter table public.ebook_progress add constraint ebook_progress_section_id_fkey FOREIGN KEY (section_id) REFERENCES ebook_sections(id) ON DELETE SET NULL;
alter table public.ebook_sections drop constraint if exists ebook_sections_ebook_id_fkey;
alter table public.ebook_sections add constraint ebook_sections_ebook_id_fkey FOREIGN KEY (ebook_id) REFERENCES ebooks(id) ON DELETE CASCADE;
alter table public.ebooks drop constraint if exists ebooks_routine_id_fkey;
alter table public.ebooks add constraint ebooks_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES wellness_routines(id) ON UPDATE CASCADE ON DELETE SET NULL;
alter table public.frequencies drop constraint if exists frequencies_centre_id_fkey;
alter table public.frequencies add constraint frequencies_centre_id_fkey FOREIGN KEY (centre_id) REFERENCES energy_centres(id) ON UPDATE CASCADE ON DELETE SET NULL;
alter table public.habit_entries drop constraint if exists habit_entries_phase_id_fkey;
alter table public.habit_entries add constraint habit_entries_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES tracked_habit_phases(id) ON DELETE CASCADE;
alter table public.habit_entries drop constraint if exists habit_entries_tracked_habit_id_fkey;
alter table public.habit_entries add constraint habit_entries_tracked_habit_id_fkey FOREIGN KEY (tracked_habit_id) REFERENCES tracked_habits(id) ON DELETE CASCADE;
alter table public.habit_exercises drop constraint if exists habit_exercises_exercise_id_fkey;
alter table public.habit_exercises add constraint habit_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT;
alter table public.habit_exercises drop constraint if exists habit_exercises_routine_habit_id_fkey;
alter table public.habit_exercises add constraint habit_exercises_routine_habit_id_fkey FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id) ON DELETE CASCADE;
alter table public.habit_products drop constraint if exists habit_products_habit_id_fkey;
alter table public.habit_products add constraint habit_products_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES routine_habits(id) ON DELETE CASCADE;
alter table public.habit_products drop constraint if exists habit_products_product_id_fkey;
alter table public.habit_products add constraint habit_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.habit_proposals drop constraint if exists habit_proposals_resulting_phase_id_fkey;
alter table public.habit_proposals add constraint habit_proposals_resulting_phase_id_fkey FOREIGN KEY (resulting_phase_id) REFERENCES tracked_habit_phases(id) ON DELETE SET NULL;
alter table public.habit_proposals drop constraint if exists habit_proposals_routine_habit_id_fkey;
alter table public.habit_proposals add constraint habit_proposals_routine_habit_id_fkey FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id) ON DELETE CASCADE;
alter table public.habit_relations drop constraint if exists habit_relations_habit_id_fkey;
alter table public.habit_relations add constraint habit_relations_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES routine_habits(id) ON DELETE CASCADE;
alter table public.habit_relations drop constraint if exists habit_relations_related_habit_id_fkey;
alter table public.habit_relations add constraint habit_relations_related_habit_id_fkey FOREIGN KEY (related_habit_id) REFERENCES routine_habits(id) ON DELETE CASCADE;
alter table public.habits drop constraint if exists habits_routine_habit_id_fkey;
alter table public.habits add constraint habits_routine_habit_id_fkey FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id) ON DELETE SET NULL;
alter table public.habits drop constraint if exists habits_user_routine_id_fkey;
alter table public.habits add constraint habits_user_routine_id_fkey FOREIGN KEY (user_routine_id) REFERENCES user_routines(id) ON DELETE CASCADE;
alter table public.member_workout_exercises drop constraint if exists member_workout_exercises_member_workout_id_fkey;
alter table public.member_workout_exercises add constraint member_workout_exercises_member_workout_id_fkey FOREIGN KEY (member_workout_id) REFERENCES member_workouts(id) ON DELETE CASCADE;
alter table public.message_reactions drop constraint if exists message_reactions_message_id_fkey;
alter table public.message_reactions add constraint message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
alter table public.notifications drop constraint if exists notifications_actor_user_id_fkey;
alter table public.notifications add constraint notifications_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
alter table public.notifications drop constraint if exists notifications_user_id_fkey;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.offering_hosts drop constraint if exists offering_hosts_host_id_fkey;
alter table public.offering_hosts add constraint offering_hosts_host_id_fkey FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;
alter table public.offering_hosts drop constraint if exists offering_hosts_offering_id_fkey;
alter table public.offering_hosts add constraint offering_hosts_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE;
alter table public.offering_registrations drop constraint if exists cohort_members_cohort_id_fkey;
alter table public.offering_registrations add constraint cohort_members_cohort_id_fkey FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE;
alter table public.offering_sessions drop constraint if exists cohort_sessions_cohort_id_fkey;
alter table public.offering_sessions add constraint cohort_sessions_cohort_id_fkey FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE;
alter table public.product_links drop constraint if exists product_links_product_id_fkey;
alter table public.product_links add constraint product_links_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.profile_photos drop constraint if exists profile_photos_user_id_fkey;
alter table public.profile_photos add constraint profile_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.rewards drop constraint if exists rewards_habit_id_fkey;
alter table public.rewards add constraint rewards_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE SET NULL;
alter table public.rhythm_events drop constraint if exists rhythm_events_recorded_by_user_id_fkey;
alter table public.rhythm_events add constraint rhythm_events_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.rhythm_events drop constraint if exists rhythm_events_subject_id_fkey;
alter table public.rhythm_events add constraint rhythm_events_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES rhythm_subjects(id) ON DELETE CASCADE;
alter table public.rhythm_events drop constraint if exists rhythm_events_superseded_by_fkey;
alter table public.rhythm_events add constraint rhythm_events_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES rhythm_events(id) ON DELETE SET NULL;
alter table public.rhythm_subjects drop constraint if exists rhythm_subjects_owner_user_id_fkey;
alter table public.rhythm_subjects add constraint rhythm_subjects_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.rhythm_subjects drop constraint if exists rhythm_subjects_subject_user_id_fkey;
alter table public.rhythm_subjects add constraint rhythm_subjects_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL;
alter table public.routine_products drop constraint if exists routine_products_product_id_fkey;
alter table public.routine_products add constraint routine_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.routine_products drop constraint if exists routine_products_routine_id_fkey;
alter table public.routine_products add constraint routine_products_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES wellness_routines(id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.session_attendance drop constraint if exists cohort_attendance_session_id_fkey;
alter table public.session_attendance add constraint cohort_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES offering_sessions(id) ON DELETE CASCADE;
alter table public.session_exercises drop constraint if exists session_exercises_session_id_fkey;
alter table public.session_exercises add constraint session_exercises_session_id_fkey FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE;
alter table public.session_hosts drop constraint if exists session_hosts_host_id_fkey;
alter table public.session_hosts add constraint session_hosts_host_id_fkey FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;
alter table public.session_hosts drop constraint if exists session_hosts_session_id_fkey;
alter table public.session_hosts add constraint session_hosts_session_id_fkey FOREIGN KEY (session_id) REFERENCES offering_sessions(id) ON DELETE CASCADE;
alter table public.suggestion_dismissals drop constraint if exists suggestion_dismissals_user_id_fkey;
alter table public.suggestion_dismissals add constraint suggestion_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.support_products drop constraint if exists support_products_product_id_fkey;
alter table public.support_products add constraint support_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.tracked_habit_links drop constraint if exists tracked_habit_links_tracked_habit_id_fkey;
alter table public.tracked_habit_links add constraint tracked_habit_links_tracked_habit_id_fkey FOREIGN KEY (tracked_habit_id) REFERENCES tracked_habits(id) ON DELETE CASCADE;
alter table public.tracked_habit_phases drop constraint if exists tracked_habit_phases_tracked_habit_id_fkey;
alter table public.tracked_habit_phases add constraint tracked_habit_phases_tracked_habit_id_fkey FOREIGN KEY (tracked_habit_id) REFERENCES tracked_habits(id) ON DELETE CASCADE;
alter table public.tracked_habits drop constraint if exists tracked_habits_habit_fk;
alter table public.tracked_habits add constraint tracked_habits_habit_fk FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id) ON DELETE RESTRICT;
alter table public.tracked_habits drop constraint if exists tracked_habits_routine_habit_id_fkey;
alter table public.tracked_habits add constraint tracked_habits_routine_habit_id_fkey FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id) ON DELETE CASCADE;
alter table public.training_observations drop constraint if exists training_observations_exercise_id_fkey;
alter table public.training_observations add constraint training_observations_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;
alter table public.training_observations drop constraint if exists training_observations_session_id_fkey;
alter table public.training_observations add constraint training_observations_session_id_fkey FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE;
alter table public.training_observations drop constraint if exists training_observations_user_id_fkey;
alter table public.training_observations add constraint training_observations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_blocks drop constraint if exists user_blocks_blocked_id_fkey;
alter table public.user_blocks add constraint user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_blocks drop constraint if exists user_blocks_blocker_id_fkey;
alter table public.user_blocks add constraint user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.user_centre_readings drop constraint if exists user_centre_readings_centre_id_fkey;
alter table public.user_centre_readings add constraint user_centre_readings_centre_id_fkey FOREIGN KEY (centre_id) REFERENCES energy_centres(id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.user_removed_habits drop constraint if exists user_removed_habits_routine_habit_id_fkey;
alter table public.user_removed_habits add constraint user_removed_habits_routine_habit_id_fkey FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id) ON DELETE CASCADE;
alter table public.user_removed_habits drop constraint if exists user_removed_habits_user_routine_id_fkey;
alter table public.user_removed_habits add constraint user_removed_habits_user_routine_id_fkey FOREIGN KEY (user_routine_id) REFERENCES user_routines(id) ON DELETE CASCADE;
alter table public.user_shop_checkoffs drop constraint if exists user_shop_checkoffs_product_id_fkey;
alter table public.user_shop_checkoffs add constraint user_shop_checkoffs_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.users drop constraint if exists users_membership_tier_fkey;
alter table public.users add constraint users_membership_tier_fkey FOREIGN KEY (membership_tier) REFERENCES membership_tiers(id) ON UPDATE CASCADE;
alter table public.workout_sessions drop constraint if exists workout_sessions_habit_id_fkey;
alter table public.workout_sessions add constraint workout_sessions_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE SET NULL;
alter table public.workout_sessions drop constraint if exists workout_sessions_user_id_fkey;
alter table public.workout_sessions add constraint workout_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.workout_sets drop constraint if exists workout_sets_exercise_id_fkey;
alter table public.workout_sets add constraint workout_sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT;
alter table public.workout_sets drop constraint if exists workout_sets_habit_exercise_id_fkey;
alter table public.workout_sets add constraint workout_sets_habit_exercise_id_fkey FOREIGN KEY (habit_exercise_id) REFERENCES habit_exercises(id) ON DELETE SET NULL;
alter table public.workout_sets drop constraint if exists workout_sets_session_id_fkey;
alter table public.workout_sets add constraint workout_sets_session_id_fkey FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE;

-- ── 3. CHECK constraints ──────────────────────────────────────────────────

alter table public.applications drop constraint if exists applications_status_chk;
alter table public.applications add constraint applications_status_chk CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'call booked'::text, 'accepted'::text, 'declined'::text, 'archived'::text])));
alter table public.body_measurements drop constraint if exists body_measurements_height_chk;
alter table public.body_measurements add constraint body_measurements_height_chk CHECK (((height_cm IS NULL) OR ((height_cm > (80)::double precision) AND (height_cm < (260)::double precision))));
alter table public.body_measurements drop constraint if exists body_measurements_weight_chk;
alter table public.body_measurements add constraint body_measurements_weight_chk CHECK (((weight_kg IS NULL) OR ((weight_kg > (9)::double precision) AND (weight_kg < (320)::double precision))));
alter table public.centre_habits drop constraint if exists centre_habits_action_chk;
alter table public.centre_habits add constraint centre_habits_action_chk CHECK ((action = ANY (ARRAY['moves'::text, 'opens'::text, 'grounds'::text, 'clears'::text])));
alter table public.coach_relationships drop constraint if exists coach_relationships_ended_at_matches_status;
alter table public.coach_relationships add constraint coach_relationships_ended_at_matches_status CHECK ((((status = 'active'::text) AND (ended_at IS NULL)) OR ((status = 'ended'::text) AND (ended_at IS NOT NULL))));
alter table public.coach_relationships drop constraint if exists coach_relationships_not_self;
alter table public.coach_relationships add constraint coach_relationships_not_self CHECK (((coach_user_id)::text <> (member_user_id)::text));
alter table public.coach_relationships drop constraint if exists coach_relationships_status_check;
alter table public.coach_relationships add constraint coach_relationships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])));
alter table public.coaching_attachments drop constraint if exists coaching_attachments_size_bytes_check;
alter table public.coaching_attachments add constraint coaching_attachments_size_bytes_check CHECK ((size_bytes >= 0));
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_cancelled_has_time;
alter table public.coaching_checkin_requests add constraint coaching_checkin_cancelled_has_time CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL)));
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_completed_has_answer;
alter table public.coaching_checkin_requests add constraint coaching_checkin_completed_has_answer CHECK ((((status = 'completed'::text) AND (completed_at IS NOT NULL) AND (checkin_id IS NOT NULL)) OR ((status <> 'completed'::text) AND (completed_at IS NULL))));
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_not_self;
alter table public.coaching_checkin_requests add constraint coaching_checkin_not_self CHECK (((member_user_id)::text <> (coach_user_id)::text));
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_requests_kind_check;
alter table public.coaching_checkin_requests add constraint coaching_checkin_requests_kind_check CHECK ((kind = ANY (ARRAY['quick'::text, 'recovery'::text, 'reflection'::text])));
alter table public.coaching_checkin_requests drop constraint if exists coaching_checkin_requests_status_check;
alter table public.coaching_checkin_requests add constraint coaching_checkin_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'cancelled'::text])));
alter table public.coaching_plan_items drop constraint if exists coaching_plan_items_intent_check;
alter table public.coaching_plan_items add constraint coaching_plan_items_intent_check CHECK ((intent = ANY (ARRAY['add'::text, 'change'::text, 'end'::text])));
alter table public.coaching_plans drop constraint if exists coaching_plan_activated_matches_status;
alter table public.coaching_plans add constraint coaching_plan_activated_matches_status CHECK ((((status = 'draft'::text) AND (activated_at IS NULL) AND (ended_at IS NULL)) OR ((status = 'active'::text) AND (activated_at IS NOT NULL) AND (ended_at IS NULL)) OR ((status = 'ended'::text) AND (ended_at IS NOT NULL))));
alter table public.coaching_plans drop constraint if exists coaching_plan_dates_ordered;
alter table public.coaching_plans add constraint coaching_plan_dates_ordered CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (ends_on >= starts_on)));
alter table public.coaching_plans drop constraint if exists coaching_plan_not_self;
alter table public.coaching_plans add constraint coaching_plan_not_self CHECK (((coach_user_id)::text <> (member_user_id)::text));
alter table public.coaching_plans drop constraint if exists coaching_plans_status_check;
alter table public.coaching_plans add constraint coaching_plans_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'ended'::text])));
alter table public.cohort_members drop constraint if exists cohort_members_status_chk;
alter table public.cohort_members add constraint cohort_members_status_chk CHECK ((status = ANY (ARRAY['applied'::text, 'invited'::text, 'confirmed'::text, 'declined'::text, 'withdrawn'::text])));
alter table public.cohorts drop constraint if exists cohorts_emphasis_chk;
alter table public.cohorts add constraint cohorts_emphasis_chk CHECK (((emphasis IS NULL) OR (emphasis = ANY (ARRAY['yin'::text, 'yang'::text]))));
alter table public.cohorts drop constraint if exists cohorts_format_chk;
alter table public.cohorts add constraint cohorts_format_chk CHECK ((format = ANY (ARRAY['in_person'::text, 'virtual'::text, 'hybrid'::text])));
alter table public.cohorts drop constraint if exists cohorts_kind_chk;
alter table public.cohorts add constraint cohorts_kind_chk CHECK ((kind = ANY (ARRAY['mastermind'::text, 'cohort'::text, 'circle'::text])));
alter table public.cohorts drop constraint if exists cohorts_status_chk;
alter table public.cohorts add constraint cohorts_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'running'::text, 'complete'::text])));
alter table public.community_messages drop constraint if exists community_messages_audio_len_chk;
alter table public.community_messages add constraint community_messages_audio_len_chk CHECK (((audio_duration_seconds IS NULL) OR ((audio_duration_seconds > 0) AND (audio_duration_seconds <= 600))));
alter table public.community_messages drop constraint if exists community_messages_has_content_chk;
alter table public.community_messages add constraint community_messages_has_content_chk CHECK (((deleted_at IS NOT NULL) OR (COALESCE(length(btrim(body)), 0) > 0) OR (audio_url IS NOT NULL)));
alter table public.content_reports drop constraint if exists content_reports_reason_chk;
alter table public.content_reports add constraint content_reports_reason_chk CHECK ((reason = ANY (ARRAY['harassment'::text, 'spam'::text, 'hate'::text, 'sexual'::text, 'violence'::text, 'self_harm'::text, 'misinformation'::text, 'other'::text])));
alter table public.content_reports drop constraint if exists content_reports_status_chk;
alter table public.content_reports add constraint content_reports_status_chk CHECK ((status = ANY (ARRAY['open'::text, 'actioned'::text, 'dismissed'::text])));
alter table public.daily_notes drop constraint if exists daily_notes_source_chk;
alter table public.daily_notes add constraint daily_notes_source_chk CHECK ((source = ANY (ARRAY['model'::text, 'fallback'::text, 'authored'::text])));
alter table public.ebook_entitlements drop constraint if exists ebook_entitlements_source_chk;
alter table public.ebook_entitlements add constraint ebook_entitlements_source_chk CHECK ((source = ANY (ARRAY['membership'::text, 'purchase'::text, 'coaching'::text, 'gift'::text])));
alter table public.ebooks drop constraint if exists ebooks_access_mode_chk;
alter table public.ebooks add constraint ebooks_access_mode_chk CHECK ((access_mode = ANY (ARRAY['membership'::text, 'purchase'::text, 'coaching'::text])));
alter table public.energy_centres drop constraint if exists energy_centres_element_chk;
alter table public.energy_centres add constraint energy_centres_element_chk CHECK (((element IS NULL) OR (element = ANY (ARRAY['earth'::text, 'water'::text, 'fire'::text, 'air'::text, 'ether'::text]))));
alter table public.exercises drop constraint if exists exercises_bw_factor_chk;
alter table public.exercises add constraint exercises_bw_factor_chk CHECK (((bodyweight_factor >= (0)::double precision) AND (bodyweight_factor <= (2)::double precision)));
alter table public.exercises drop constraint if exists exercises_equipment_chk;
alter table public.exercises add constraint exercises_equipment_chk CHECK ((equipment = ANY (ARRAY['barbell'::text, 'dumbbell'::text, 'kettlebell'::text, 'machine'::text, 'smith_machine'::text, 'cable'::text, 'bodyweight'::text, 'band'::text, 'medicine_ball'::text, 'rings'::text, 'sled'::text, 'mat'::text, 'reformer'::text, 'cadillac'::text, 'chair'::text, 'barrel'::text, 'spine_corrector'::text, 'megaformer'::text, 'barre'::text, 'pilates_ring'::text, 'other'::text])));
alter table public.exercises drop constraint if exists exercises_pattern_chk;
alter table public.exercises add constraint exercises_pattern_chk CHECK ((pattern = ANY (ARRAY['squat'::text, 'hinge'::text, 'push'::text, 'pull'::text, 'carry'::text, 'core'::text, 'rotation'::text, 'isometric'::text, 'balance'::text, 'locomotion'::text, 'elastic'::text, 'conditioning'::text, 'mobility'::text, 'tissue'::text, 'breath'::text, 'recovery'::text, 'flow'::text, 'sport'::text])));
alter table public.exercises drop constraint if exists exercises_tracking_chk;
alter table public.exercises add constraint exercises_tracking_chk CHECK ((tracking_type = ANY (ARRAY['reps'::text, 'duration'::text, 'distance'::text])));
alter table public.frequencies drop constraint if exists frequencies_moment_chk;
alter table public.frequencies add constraint frequencies_moment_chk CHECK ((moment = ANY (ARRAY['waking'::text, 'practice'::text, 'evening'::text, 'anytime'::text])));
alter table public.habit_entries drop constraint if exists habit_entries_kind_chk;
alter table public.habit_entries add constraint habit_entries_kind_chk CHECK ((kind = ANY (ARRAY['manual'::text, 'override'::text])));
alter table public.habit_entries drop constraint if exists habit_entries_op_chk;
alter table public.habit_entries add constraint habit_entries_op_chk CHECK ((op = ANY (ARRAY['add'::text, 'set'::text])));
alter table public.habit_entries drop constraint if exists habit_entries_value_chk;
alter table public.habit_entries add constraint habit_entries_value_chk CHECK (((value >= (0)::double precision) AND (value < ('1000000000'::numeric)::double precision)));
alter table public.habit_exercises drop constraint if exists habit_exercises_pct_chk;
alter table public.habit_exercises add constraint habit_exercises_pct_chk CHECK (((target_percent_1rm IS NULL) OR ((target_percent_1rm > (0)::double precision) AND (target_percent_1rm <= (150)::double precision))));
alter table public.habit_exercises drop constraint if exists habit_exercises_reps_chk;
alter table public.habit_exercises add constraint habit_exercises_reps_chk CHECK (((target_reps_low IS NULL) OR (target_reps_high IS NULL) OR (target_reps_low <= target_reps_high)));
alter table public.habit_exercises drop constraint if exists habit_exercises_sets_chk;
alter table public.habit_exercises add constraint habit_exercises_sets_chk CHECK (((target_sets > 0) AND (target_sets <= 20)));
alter table public.habit_proposals drop constraint if exists proposal_by_chk;
alter table public.habit_proposals add constraint proposal_by_chk CHECK ((proposed_by = ANY (ARRAY['coach'::text, 'system'::text])));
alter table public.habit_proposals drop constraint if exists proposal_emphasis_chk;
alter table public.habit_proposals add constraint proposal_emphasis_chk CHECK ((emphasis = ANY (ARRAY['yin'::text, 'yang'::text])));
alter table public.habit_proposals drop constraint if exists proposal_schedule_kind_chk;
alter table public.habit_proposals add constraint proposal_schedule_kind_chk CHECK ((schedule_kind = ANY (ARRAY['daily'::text, 'days_of_week'::text, 'times_per_week'::text, 'weekly'::text, 'as_needed'::text])));
alter table public.habit_proposals drop constraint if exists proposal_status_chk;
alter table public.habit_proposals add constraint proposal_status_chk CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'declined'::text, 'withdrawn'::text])));
alter table public.habit_relations drop constraint if exists habit_relation_chk;
alter table public.habit_relations add constraint habit_relation_chk CHECK ((relation = ANY (ARRAY['requires'::text, 'conflicts'::text, 'pairs'::text, 'replaces'::text, 'increases'::text])));
alter table public.habit_relations drop constraint if exists habit_relation_self_chk;
alter table public.habit_relations add constraint habit_relation_self_chk CHECK ((habit_id <> related_habit_id));
alter table public.health_workouts drop constraint if exists health_workouts_orientation_override_check;
alter table public.health_workouts add constraint health_workouts_orientation_override_check CHECK (((user_orientation_override IS NULL) OR (user_orientation_override = ANY (ARRAY['restore'::text, 'build'::text, 'both'::text]))));
alter table public.health_workouts drop constraint if exists health_workouts_user_response_check;
alter table public.health_workouts add constraint health_workouts_user_response_check CHECK (((user_response IS NULL) OR (user_response = ANY (ARRAY['restored'::text, 'steady'::text, 'taxed'::text]))));
alter table public.hosts drop constraint if exists hosts_kind_chk;
alter table public.hosts add constraint hosts_kind_chk CHECK ((kind = ANY (ARRAY['internal'::text, 'coach'::text, 'partner'::text])));
alter table public.offering_hosts drop constraint if exists offering_hosts_role_chk;
alter table public.offering_hosts add constraint offering_hosts_role_chk CHECK ((role = ANY (ARRAY['lead'::text, 'co_host'::text, 'guest'::text])));
alter table public.offering_registrations drop constraint if exists offering_registrations_status_chk;
alter table public.offering_registrations add constraint offering_registrations_status_chk CHECK ((status = ANY (ARRAY['applied'::text, 'invited'::text, 'confirmed'::text, 'waitlist'::text, 'declined'::text, 'withdrawn'::text])));
alter table public.offerings drop constraint if exists offerings_format_chk;
alter table public.offerings add constraint offerings_format_chk CHECK ((format = ANY (ARRAY['in_person'::text, 'virtual'::text, 'hybrid'::text])));
alter table public.offerings drop constraint if exists offerings_kind_chk;
alter table public.offerings add constraint offerings_kind_chk CHECK ((kind = ANY (ARRAY['retreat'::text, 'mastermind'::text, 'circle'::text, 'webinar'::text, 'talk'::text, 'workshop'::text, 'intensive'::text])));
alter table public.offerings drop constraint if exists offerings_registration_mode_chk;
alter table public.offerings add constraint offerings_registration_mode_chk CHECK ((registration_mode = ANY (ARRAY['open'::text, 'application'::text, 'invite'::text])));
alter table public.offerings drop constraint if exists offerings_status_chk;
alter table public.offerings add constraint offerings_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'running'::text, 'complete'::text])));
alter table public.retreats drop constraint if exists retreats_emphasis_chk;
alter table public.retreats add constraint retreats_emphasis_chk CHECK (((emphasis IS NULL) OR (emphasis = ANY (ARRAY['yin'::text, 'yang'::text]))));
alter table public.rhythm_events drop constraint if exists rhythm_events_confirm_needs_phase;
alter table public.rhythm_events add constraint rhythm_events_confirm_needs_phase CHECK (((type <> 'phase_confirmed'::text) OR (phase IS NOT NULL)));
alter table public.rhythm_events drop constraint if exists rhythm_events_context_kind_check;
alter table public.rhythm_events add constraint rhythm_events_context_kind_check CHECK (((context_kind IS NULL) OR (context_kind = ANY (ARRAY['work_stress'::text, 'short_sleep'::text, 'training_hard'::text, 'travel'::text, 'illness'::text, 'big_event'::text, 'wants_space'::text]))));
alter table public.rhythm_events drop constraint if exists rhythm_events_context_needs_kind;
alter table public.rhythm_events add constraint rhythm_events_context_needs_kind CHECK (((type <> 'context_noted'::text) OR (context_kind IS NOT NULL)));
alter table public.rhythm_events drop constraint if exists rhythm_events_phase_check;
alter table public.rhythm_events add constraint rhythm_events_phase_check CHECK (((phase IS NULL) OR (phase = ANY (ARRAY['menstrual'::text, 'follicular'::text, 'ovulatory'::text, 'luteal'::text]))));
alter table public.rhythm_events drop constraint if exists rhythm_events_provenance_check;
alter table public.rhythm_events add constraint rhythm_events_provenance_check CHECK ((provenance = ANY (ARRAY['self_reported'::text, 'partner_shared'::text, 'partner_confirmed'::text, 'member_entered'::text, 'estimated'::text])));
alter table public.rhythm_events drop constraint if exists rhythm_events_type_check;
alter table public.rhythm_events add constraint rhythm_events_type_check CHECK ((type = ANY (ARRAY['period_started'::text, 'period_ended'::text, 'phase_confirmed'::text, 'note'::text, 'context_noted'::text])));
alter table public.rhythm_subjects drop constraint if exists rhythm_subjects_lengths_check;
alter table public.rhythm_subjects add constraint rhythm_subjects_lengths_check CHECK ((((cycle_length IS NULL) OR ((cycle_length >= 20) AND (cycle_length <= 45))) AND ((period_length IS NULL) OR ((period_length >= 1) AND (period_length <= 10)))));
alter table public.rhythm_subjects drop constraint if exists rhythm_subjects_model_check;
alter table public.rhythm_subjects add constraint rhythm_subjects_model_check CHECK ((model = ANY (ARRAY['spontaneous_cycle'::text, 'hormonal_contraception'::text, 'irregular'::text, 'none'::text])));
alter table public.rhythm_subjects drop constraint if exists rhythm_subjects_relation_check;
alter table public.rhythm_subjects add constraint rhythm_subjects_relation_check CHECK ((relation = ANY (ARRAY['self'::text, 'partner'::text])));
alter table public.rhythm_subjects drop constraint if exists rhythm_subjects_sex_check;
alter table public.rhythm_subjects add constraint rhythm_subjects_sex_check CHECK (((subject_sex IS NULL) OR (subject_sex = ANY (ARRAY['male'::text, 'female'::text]))));
alter table public.rhythm_subjects drop constraint if exists rhythm_subjects_support_check;
alter table public.rhythm_subjects add constraint rhythm_subjects_support_check CHECK (((support_preference IS NULL) OR (support_preference = ANY (ARRAY['listening'::text, 'practical'::text, 'space'::text, 'company'::text, 'food'::text, 'unknown'::text]))));
alter table public.routine_habits drop constraint if exists routine_habits_emphasis_chk;
alter table public.routine_habits add constraint routine_habits_emphasis_chk CHECK (((emphasis IS NULL) OR (emphasis = ANY (ARRAY['yin'::text, 'yang'::text]))));
alter table public.routine_habits drop constraint if exists routine_habits_load_class_chk;
alter table public.routine_habits add constraint routine_habits_load_class_chk CHECK (((load_class IS NULL) OR (load_class = ANY (ARRAY['restorative'::text, 'supportive'::text, 'building'::text, 'adaptive-stressor'::text, 'depleting'::text, 'neutral'::text]))));
alter table public.routine_habits drop constraint if exists routine_habits_load_tags_chk;
alter table public.routine_habits add constraint routine_habits_load_tags_chk CHECK (((load_tags IS NULL) OR (load_tags <@ ARRAY['restorative'::text, 'supportive'::text, 'building'::text, 'adaptive-stressor'::text, 'depleting'::text, 'neutral'::text])));
alter table public.routine_habits drop constraint if exists routine_habits_max_per_week_chk;
alter table public.routine_habits add constraint routine_habits_max_per_week_chk CHECK (((max_per_week IS NULL) OR ((max_per_week >= 1) AND (max_per_week <= 21))));
alter table public.routine_habits drop constraint if exists routine_habits_polarity_strength_chk;
alter table public.routine_habits add constraint routine_habits_polarity_strength_chk CHECK ((polarity_strength = ANY (ARRAY['strong'::text, 'moderate'::text, 'contextual'::text])));
alter table public.routine_habits drop constraint if exists routine_habits_priority_chk;
alter table public.routine_habits add constraint routine_habits_priority_chk CHECK (((priority_level IS NULL) OR (priority_level = ANY (ARRAY['foundational'::text, 'supportive'::text, 'advanced'::text]))));
alter table public.routine_habits drop constraint if exists routine_habits_target_chk;
alter table public.routine_habits add constraint routine_habits_target_chk CHECK ((((tracking_type = 'boolean'::text) AND (default_target IS NULL)) OR ((tracking_type <> 'boolean'::text) AND (default_target IS NOT NULL))));
alter table public.routine_habits drop constraint if exists routine_habits_terrain_fit_chk;
alter table public.routine_habits add constraint routine_habits_terrain_fit_chk CHECK (((terrain_fit IS NULL) OR (terrain_fit = ANY (ARRAY['restore'::text, 'build'::text, 'either'::text]))));
alter table public.routine_habits drop constraint if exists routine_habits_tracking_type_chk;
alter table public.routine_habits add constraint routine_habits_tracking_type_chk CHECK ((tracking_type = ANY (ARRAY['boolean'::text, 'minutes'::text, 'hours'::text, 'count'::text, 'steps'::text, 'ounces'::text, 'litres'::text, 'grams'::text, 'servings'::text, 'rating'::text, 'time-of-day'::text, 'calories'::text, 'meals'::text])));
alter table public.routine_products drop constraint if exists routine_products_phase_chk;
alter table public.routine_products add constraint routine_products_phase_chk CHECK ((phase = ANY (ARRAY['prepare'::text, 'clear'::text, 'rebuild'::text])));
alter table public.support_requests drop constraint if exists support_requests_category_check;
alter table public.support_requests add constraint support_requests_category_check CHECK ((category = ANY (ARRAY['account'::text, 'billing'::text, 'technical'::text, 'protocol'::text, 'privacy'::text, 'other'::text])));
alter table public.support_requests drop constraint if exists support_requests_status_check;
alter table public.support_requests add constraint support_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'answered'::text, 'closed'::text])));
alter table public.terrain_checkins drop constraint if exists terrain_scale_chk;
alter table public.terrain_checkins add constraint terrain_scale_chk CHECK ((((energy IS NULL) OR ((energy >= 1) AND (energy <= 5))) AND ((recovery IS NULL) OR ((recovery >= 1) AND (recovery <= 5))) AND ((nervous_system IS NULL) OR ((nervous_system >= 1) AND (nervous_system <= 5))) AND ((digestion IS NULL) OR ((digestion >= 1) AND (digestion <= 5))) AND ((body_tension IS NULL) OR ((body_tension >= 1) AND (body_tension <= 5))) AND ((mental_clarity IS NULL) OR ((mental_clarity >= 1) AND (mental_clarity <= 5))) AND ((drive IS NULL) OR ((drive >= 1) AND (drive <= 5)))));
alter table public.tracked_habit_links drop constraint if exists link_context_chk;
alter table public.tracked_habit_links add constraint link_context_chk CHECK ((context_type = ANY (ARRAY['plan'::text, 'cohort'::text, 'retreat'::text])));
alter table public.tracked_habit_phases drop constraint if exists phase_closed_after_start_chk;
alter table public.tracked_habit_phases add constraint phase_closed_after_start_chk CHECK (((closed_on IS NULL) OR (closed_on >= starts_on)));
alter table public.tracked_habit_phases drop constraint if exists phase_days_range_chk;
alter table public.tracked_habit_phases add constraint phase_days_range_chk CHECK (((schedule_days IS NULL) OR (schedule_days <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint])));
alter table public.tracked_habit_phases drop constraint if exists phase_duration_chk;
alter table public.tracked_habit_phases add constraint phase_duration_chk CHECK ((((phase_type = 'fixed'::text) AND (duration_days IS NOT NULL) AND ((duration_days >= 1) AND (duration_days <= 365))) OR ((phase_type = 'ongoing'::text) AND (duration_days IS NULL))));
alter table public.tracked_habit_phases drop constraint if exists phase_schedule_kind_chk;
alter table public.tracked_habit_phases add constraint phase_schedule_kind_chk CHECK ((schedule_kind = ANY (ARRAY['daily'::text, 'days_of_week'::text, 'times_per_week'::text, 'weekly'::text, 'as_needed'::text])));
alter table public.tracked_habit_phases drop constraint if exists phase_schedule_shape_chk;
alter table public.tracked_habit_phases add constraint phase_schedule_shape_chk CHECK ((((schedule_kind = 'days_of_week'::text) AND (schedule_days IS NOT NULL) AND ((array_length(schedule_days, 1) >= 1) AND (array_length(schedule_days, 1) <= 7)) AND (schedule_count IS NULL)) OR ((schedule_kind = 'times_per_week'::text) AND (schedule_count IS NOT NULL) AND ((schedule_count >= 1) AND (schedule_count <= 7)) AND (schedule_days IS NULL)) OR ((schedule_kind = ANY (ARRAY['daily'::text, 'weekly'::text, 'as_needed'::text])) AND (schedule_days IS NULL) AND (schedule_count IS NULL))));
alter table public.tracked_habit_phases drop constraint if exists phase_source_chk;
alter table public.tracked_habit_phases add constraint phase_source_chk CHECK ((source = ANY (ARRAY['member'::text, 'coach'::text, 'plan'::text, 'retreat'::text, 'cohort'::text])));
alter table public.tracked_habit_phases drop constraint if exists phase_status_chk;
alter table public.tracked_habit_phases add constraint phase_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'superseded'::text, 'cancelled'::text, 'paused'::text])));
alter table public.tracked_habit_phases drop constraint if exists phase_type_chk;
alter table public.tracked_habit_phases add constraint phase_type_chk CHECK ((phase_type = ANY (ARRAY['ongoing'::text, 'fixed'::text])));
alter table public.tracked_habits drop constraint if exists tracked_habits_added_by_chk;
alter table public.tracked_habits add constraint tracked_habits_added_by_chk CHECK ((added_by = ANY (ARRAY['member'::text, 'coach'::text])));
alter table public.tracked_habits drop constraint if exists tracked_habits_emphasis_chk;
alter table public.tracked_habits add constraint tracked_habits_emphasis_chk CHECK ((emphasis = ANY (ARRAY['yin'::text, 'yang'::text])));
alter table public.tracked_habits drop constraint if exists tracked_habits_first_added_by_chk;
alter table public.tracked_habits add constraint tracked_habits_first_added_by_chk CHECK ((first_added_by = ANY (ARRAY['member'::text, 'coach'::text])));
alter table public.tracked_habits drop constraint if exists tracked_habits_status_chk;
alter table public.tracked_habits add constraint tracked_habits_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'archived'::text])));
alter table public.training_observations drop constraint if exists training_observations_quality_check;
alter table public.training_observations add constraint training_observations_quality_check CHECK ((quality = ANY (ARRAY['good'::text, 'tight'::text, 'weak'::text, 'discomfort'::text, 'unstable'::text, 'other'::text])));
alter table public.training_observations drop constraint if exists training_observations_says_something;
alter table public.training_observations add constraint training_observations_says_something CHECK (((COALESCE(btrim(note), ''::text) <> ''::text) OR (quality IS NOT NULL)));
alter table public.training_observations drop constraint if exists training_observations_side_check;
alter table public.training_observations add constraint training_observations_side_check CHECK ((side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])));
alter table public.user_blocks drop constraint if exists user_blocks_not_self_chk;
alter table public.user_blocks add constraint user_blocks_not_self_chk CHECK (((blocker_id)::text <> (blocked_id)::text));
alter table public.user_centre_readings drop constraint if exists centre_readings_by_chk;
alter table public.user_centre_readings add constraint centre_readings_by_chk CHECK ((recorded_by = ANY (ARRAY['member'::text, 'coach'::text])));
alter table public.user_centre_readings drop constraint if exists centre_readings_state_chk;
alter table public.user_centre_readings add constraint centre_readings_state_chk CHECK ((state = ANY (ARRAY['blocked'::text, 'stirring'::text, 'open'::text])));
alter table public.user_cosmology drop constraint if exists user_cosmology_polarity_chk;
alter table public.user_cosmology add constraint user_cosmology_polarity_chk CHECK (((polarity IS NULL) OR (polarity = ANY (ARRAY['masculine'::text, 'feminine'::text, 'balanced'::text]))));
alter table public.user_routines drop constraint if exists user_routines_status_chk;
alter table public.user_routines add constraint user_routines_status_chk CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'paused'::text, 'completed'::text, 'abandoned'::text])));
alter table public.users drop constraint if exists users_relationship_status_check;
alter table public.users add constraint users_relationship_status_check CHECK (((relationship_status IS NULL) OR ((relationship_status)::text = ANY ((ARRAY['single'::character varying, 'dating'::character varying, 'married'::character varying, 'private'::character varying])::text[]))));
alter table public.users drop constraint if exists users_role_chk;
alter table public.users add constraint users_role_chk CHECK ((role = ANY (ARRAY['member'::text, 'coach'::text, 'moderator'::text, 'admin'::text, 'owner'::text])));
alter table public.users drop constraint if exists users_sex_check;
alter table public.users add constraint users_sex_check CHECK (((sex IS NULL) OR ((sex)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying])::text[]))));
alter table public.users drop constraint if exists users_weight_unit_chk;
alter table public.users add constraint users_weight_unit_chk CHECK ((weight_unit = ANY (ARRAY['kg'::text, 'lb'::text])));
alter table public.wins drop constraint if exists wins_kind_chk;
alter table public.wins add constraint wins_kind_chk CHECK ((kind = ANY (ARRAY['routine_complete'::text, 'streak'::text, 'perfect_week'::text, 'first_step'::text, 'offering_complete'::text])));
alter table public.workout_sets drop constraint if exists workout_sets_distance_chk;
alter table public.workout_sets add constraint workout_sets_distance_chk CHECK (((distance_m IS NULL) OR ((distance_m > (0)::double precision) AND (distance_m <= (500000)::double precision))));
alter table public.workout_sets drop constraint if exists workout_sets_duration_chk;
alter table public.workout_sets add constraint workout_sets_duration_chk CHECK (((duration_seconds IS NULL) OR ((duration_seconds > 0) AND (duration_seconds <= 86400))));
alter table public.workout_sets drop constraint if exists workout_sets_measure_chk;
alter table public.workout_sets add constraint workout_sets_measure_chk CHECK (((reps IS NOT NULL) OR (duration_seconds IS NOT NULL) OR (distance_m IS NOT NULL)));
alter table public.workout_sets drop constraint if exists workout_sets_reps_chk;
alter table public.workout_sets add constraint workout_sets_reps_chk CHECK (((reps IS NULL) OR ((reps > 0) AND (reps <= 500))));
alter table public.workout_sets drop constraint if exists workout_sets_rpe_chk;
alter table public.workout_sets add constraint workout_sets_rpe_chk CHECK (((rpe IS NULL) OR ((rpe >= (1)::double precision) AND (rpe <= (10)::double precision))));
alter table public.workout_sets drop constraint if exists workout_sets_set_style_known;
alter table public.workout_sets add constraint workout_sets_set_style_known CHECK ((set_style = ANY (ARRAY['normal'::text, 'warmup'::text, 'dropset'::text, 'backoff'::text])));
alter table public.workout_sets drop constraint if exists workout_sets_warmup_agrees;
alter table public.workout_sets add constraint workout_sets_warmup_agrees CHECK (((set_style = 'warmup'::text) = is_warmup));
alter table public.workout_sets drop constraint if exists workout_sets_weight_chk;
alter table public.workout_sets add constraint workout_sets_weight_chk CHECK (((weight_kg >= (0)::double precision) AND (weight_kg <= (910)::double precision)));

-- ── 4. Indexes ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "IDX_auth_tokens_hash" ON public.auth_tokens USING btree (token_hash);
CREATE INDEX IF NOT EXISTS "IDX_password_reset_expires" ON public.password_reset_tokens USING btree (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS ebooks_slug_key ON public.ebooks USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_applications_created ON public.applications USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications USING btree (status);
CREATE INDEX IF NOT EXISTS idx_coaching_attachment_staged ON public.coaching_attachments USING btree (created_at) WHERE (message_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_coaching_messages_sender ON public.coaching_messages USING btree (sender_user_id);
CREATE INDEX IF NOT EXISTS idx_community_search ON public.community_messages USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_community_toplevel ON public.community_messages USING btree (channel_id, created_at DESC) WHERE (parent_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_ebook_entitlements_ebook ON public.ebook_entitlements USING btree (ebook_id);
CREATE INDEX IF NOT EXISTS idx_ebook_progress_ebook ON public.ebook_progress USING btree (ebook_id);
CREATE INDEX IF NOT EXISTS idx_ebook_progress_section ON public.ebook_progress USING btree (section_id);
CREATE INDEX IF NOT EXISTS idx_exec_apps_created ON public.executive_applications USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_apps_route ON public.executive_applications USING btree (route);
CREATE INDEX IF NOT EXISTS idx_exec_apps_status ON public.executive_applications USING btree (status);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON public.exercises USING btree (category);
CREATE INDEX IF NOT EXISTS idx_frequencies_centre ON public.frequencies USING btree (centre_id);
CREATE INDEX IF NOT EXISTS idx_habits_routine_habit ON public.habits USING btree (routine_habit_id);
CREATE INDEX IF NOT EXISTS idx_habits_user_routine_date ON public.habits USING btree (user_id, user_routine_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_routine_habits_emphasis ON public.routine_habits USING btree (emphasis) WHERE (emphasis IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_routine_habits_keywords ON public.routine_habits USING gin (search_keywords);
CREATE INDEX IF NOT EXISTS idx_routine_habits_published ON public.routine_habits USING btree (published, emphasis) WHERE published;
CREATE INDEX IF NOT EXISTS idx_routine_habits_title_trgm ON public.routine_habits USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_session_hosts_host ON public.session_hosts USING btree (host_id);
CREATE INDEX IF NOT EXISTS idx_user_centre_readings_centre ON public.user_centre_readings USING btree (centre_id);
CREATE INDEX IF NOT EXISTS idx_user_removed_habits_rh ON public.user_removed_habits USING btree (routine_habit_id);
CREATE INDEX IF NOT EXISTS idx_user_removed_habits_ur ON public.user_removed_habits USING btree (user_routine_id);
CREATE INDEX IF NOT EXISTS idx_user_shop_checkoffs_product ON public.user_shop_checkoffs USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_users_membership_tier ON public.users USING btree (membership_tier);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users USING btree (role);
CREATE INDEX IF NOT EXISTS idx_workout_sets_prescribed ON public.workout_sets USING btree (habit_exercise_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_workout_per_member ON public.workout_sessions USING btree (user_id) WHERE (finished_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_relationships_active_member ON public.coach_relationships USING btree (member_user_id) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_plan_active_member ON public.coaching_plans USING btree (member_user_id) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_habits_user_template_date ON public.habits USING btree (user_id, routine_habit_id, scheduled_date) WHERE (routine_habit_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_habits_user_title_date ON public.habits USING btree (user_id, title, scheduled_date) WHERE (routine_habit_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_offerings_slug ON public.offerings USING btree (slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_removed_habits_template ON public.user_removed_habits USING btree (user_id, user_routine_id, routine_habit_id) WHERE (routine_habit_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_removed_habits_title ON public.user_removed_habits USING btree (user_id, user_routine_id, title) WHERE (routine_habit_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rewards_habit_earn ON public.rewards USING btree (user_id, habit_id) WHERE ((habit_id IS NOT NULL) AND (type = 'earn'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_routines_one_active ON public.user_routines USING btree (user_id) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_routines_one_scheduled ON public.user_routines USING btree (user_id) WHERE (status = 'scheduled'::text);
