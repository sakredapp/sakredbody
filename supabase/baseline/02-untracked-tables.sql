-- ─── What Drizzle cannot say ──────────────────────────────────────────────
--
-- This file used to hold four whole tables. It no longer needs to: the three
-- modules defining them are now re-exported from `shared/schema.ts`, so
-- drizzle-kit emits them in 01 along with everything else.
--
-- What remains is the part Drizzle has no vocabulary for. CHECK constraints and
-- partial unique indexes are where these tables keep their actual invariants —
-- a plan cannot be active without an activation time, a member cannot have two
-- active plans, a check-in cannot be completed without the answer it was
-- waiting for. Drizzle models columns and simple uniques; these rules live in
-- SQL and would vanish from any environment built from the schema files alone.
--
-- Introspected from production 16 Aug 2026.

ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_cancelled_has_time CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL)));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_completed_has_answer CHECK ((((status = 'completed'::text) AND (completed_at IS NOT NULL) AND (checkin_id IS NOT NULL)) OR ((status <> 'completed'::text) AND (completed_at IS NULL))));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_not_self CHECK (((member_user_id)::text <> (coach_user_id)::text));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_kind_check CHECK ((kind = ANY (ARRAY['quick'::text, 'recovery'::text, 'reflection'::text])));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_intent_check CHECK ((intent = ANY (ARRAY['add'::text, 'change'::text, 'end'::text])));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_activated_matches_status CHECK ((((status = 'draft'::text) AND (activated_at IS NULL) AND (ended_at IS NULL)) OR ((status = 'active'::text) AND (activated_at IS NOT NULL) AND (ended_at IS NULL)) OR ((status = 'ended'::text) AND (ended_at IS NOT NULL))));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_dates_ordered CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (ends_on >= starts_on)));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_not_self CHECK (((coach_user_id)::text <> (member_user_id)::text));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'ended'::text])));

-- One active plan per member. A partial unique, so drafts and ended plans are
-- unlimited and the invariant is only about the one that is live.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_plan_active_member ON public.coaching_plans USING btree (member_user_id) WHERE (status = 'active'::text);
