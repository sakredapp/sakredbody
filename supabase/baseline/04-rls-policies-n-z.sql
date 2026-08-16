-- Policies, tables n–z. Introspected from production 16 Aug 2026.
CREATE POLICY offering_hosts_read ON public.offering_hosts AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM offerings o
  WHERE ((o.id = offering_hosts.offering_id) AND (o.status <> 'draft'::text)))));
CREATE POLICY cohort_members_admin ON public.offering_registrations AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_members_apply ON public.offering_registrations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cohort_members_own ON public.offering_registrations AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cohort_sessions_admin ON public.offering_sessions AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_sessions_select ON public.offering_sessions AS PERMISSIVE FOR SELECT TO public USING ((is_sakred_admin() OR (EXISTS ( SELECT 1
   FROM offering_registrations m
  WHERE ((m.offering_id = offering_sessions.offering_id) AND ((m.user_id)::text = (auth.uid())::text) AND (m.status = 'confirmed'::text))))));
CREATE POLICY cohorts_select ON public.offerings AS PERMISSIVE FOR SELECT TO public USING (((status <> 'draft'::text) OR is_sakred_admin()));
CREATE POLICY cohorts_write ON public.offerings AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_partner_services_admin_delete ON public.partner_services AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_partner_services_admin_insert ON public.partner_services AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_partner_services_admin_update ON public.partner_services AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_partner_services_select ON public.partner_services AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_partners_admin_delete ON public.partners AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_partners_admin_insert ON public.partners AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_partners_admin_update ON public.partners AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_partners_select ON public.partners AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY product_links_select ON public.product_links AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY product_links_write ON public.product_links AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY products_select ON public.products AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY products_write ON public.products AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY profile_photos_service ON public.profile_photos AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY sakred_properties_admin_delete ON public.properties AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_properties_admin_insert ON public.properties AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_properties_admin_update ON public.properties AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_properties_select ON public.properties AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_retreats_admin_delete ON public.retreats AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_retreats_admin_insert ON public.retreats AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_retreats_admin_update ON public.retreats AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_retreats_select ON public.retreats AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_rewards_insert ON public.rewards AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY sakred_rewards_select ON public.rewards AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = user_id));
CREATE POLICY rhythm_events_service ON public.rhythm_events AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY rhythm_subjects_service ON public.rhythm_subjects AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY sakred_routine_habits_delete ON public.routine_habits AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_routine_habits_insert ON public.routine_habits AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_routine_habits_select ON public.routine_habits AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_routine_habits_update ON public.routine_habits AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY routine_products_select ON public.routine_products AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY routine_products_write ON public.routine_products AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_attendance_admin ON public.session_attendance AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_attendance_own ON public.session_attendance AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY session_hosts_read ON public.session_hosts AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (offering_sessions s
     JOIN offerings o ON ((o.id = s.offering_id)))
  WHERE ((s.id = session_hosts.session_id) AND (o.status <> 'draft'::text)))));
CREATE POLICY sakred_sessions_deny ON public.sessions AS PERMISSIVE FOR ALL TO public USING (false);
CREATE POLICY suggestion_dismissals_service ON public.suggestion_dismissals AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY support_products_service ON public.support_products AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY terrain_checkins_service ON public.terrain_checkins AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tracked_habit_links_service ON public.tracked_habit_links AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tracked_habit_phases_service ON public.tracked_habit_phases AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tracked_habits_service ON public.tracked_habits AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY training_observations_no_client ON public.training_observations AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY sakred_user_assigned_delete ON public.user_assigned_habits AS PERMISSIVE FOR DELETE TO public USING (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_assigned_insert ON public.user_assigned_habits AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_assigned_select ON public.user_assigned_habits AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_assigned_update ON public.user_assigned_habits AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = user_id));
CREATE POLICY user_blocks_no_client ON public.user_blocks AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY sakred_ucs_delete ON public.user_category_subs AS PERMISSIVE FOR DELETE TO public USING (((auth.uid())::text = (user_id)::text));
CREATE POLICY sakred_ucs_insert ON public.user_category_subs AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = (user_id)::text));
CREATE POLICY sakred_ucs_select ON public.user_category_subs AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (user_id)::text));
CREATE POLICY centre_readings_insert ON public.user_centre_readings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY centre_readings_own ON public.user_centre_readings AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cosmology_own ON public.user_cosmology AS PERMISSIVE FOR ALL TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin())) WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY user_removed_habits_own ON public.user_removed_habits AS PERMISSIVE FOR ALL TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin())) WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY sakred_user_routines_insert ON public.user_routines AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_routines_select ON public.user_routines AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_routines_update ON public.user_routines AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = user_id));
CREATE POLICY user_shop_checkoffs_own ON public.user_shop_checkoffs AS PERMISSIVE FOR ALL TO public USING (((user_id)::text = (auth.uid())::text)) WITH CHECK (((user_id)::text = (auth.uid())::text));
CREATE POLICY sakred_users_select ON public.users AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (id)::text));
CREATE POLICY sakred_users_update ON public.users AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = (id)::text));
CREATE POLICY sakred_routines_delete ON public.wellness_routines AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_routines_insert ON public.wellness_routines AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_routines_select ON public.wellness_routines AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_routines_update ON public.wellness_routines AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY wins_read_own ON public.wins AS PERMISSIVE FOR SELECT TO public USING (((user_id)::text = (auth.uid())::text));
CREATE POLICY workout_sessions_no_client ON public.workout_sessions AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY workout_sets_no_client ON public.workout_sets AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
