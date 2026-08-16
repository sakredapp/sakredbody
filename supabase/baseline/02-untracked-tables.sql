-- ─── Four tables Drizzle does not know about ──────────────────────────────
--
-- `coaching_plans`, `coaching_plan_items`, `coaching_checkin_requests` and
-- `notifications` exist in production and were created by migrations, but were
-- never added to `shared/schema.ts`. `drizzle-kit generate` therefore cannot
-- emit them, and — more alarming — `drizzle-kit push` considers them unknown.
-- Introspected from production on 16 Aug 2026.

CREATE TABLE IF NOT EXISTS public.coaching_checkin_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_user_id character varying NOT NULL,
  coach_user_id character varying NOT NULL,
  relationship_id uuid,
  requested_by_user_id character varying NOT NULL,
  kind text DEFAULT 'quick'::text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  coach_prompt text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  due_on date,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  cancelled_by_user_id character varying,
  checkin_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.coaching_plan_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  plan_id uuid NOT NULL,
  routine_habit_id uuid NOT NULL,
  intent text DEFAULT 'add'::text NOT NULL,
  target double precision,
  schedule_kind text,
  schedule_days smallint[],
  schedule_count integer,
  recommended_time text,
  member_reason text,
  coach_note text,
  order_index integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.coaching_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_user_id character varying NOT NULL,
  coach_user_id character varying NOT NULL,
  relationship_id uuid,
  title text NOT NULL,
  focus text,
  member_visible_note text,
  internal_note text,
  status text DEFAULT 'draft'::text NOT NULL,
  starts_on date,
  ends_on date,
  created_by_user_id character varying NOT NULL,
  activated_by_user_id character varying,
  ended_by_user_id character varying,
  activated_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id character varying NOT NULL,
  type text NOT NULL,
  actor_user_id character varying,
  resource_type text NOT NULL,
  resource_id uuid,
  title text NOT NULL,
  body text,
  dedupe_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  read_at timestamp with time zone
);

ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_pkey PRIMARY KEY (id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_cancelled_has_time CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL)));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_completed_has_answer CHECK ((((status = 'completed'::text) AND (completed_at IS NOT NULL) AND (checkin_id IS NOT NULL)) OR ((status <> 'completed'::text) AND (completed_at IS NULL))));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_not_self CHECK (((member_user_id)::text <> (coach_user_id)::text));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_kind_check CHECK ((kind = ANY (ARRAY['quick'::text, 'recovery'::text, 'reflection'::text])));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_intent_check CHECK ((intent = ANY (ARRAY['add'::text, 'change'::text, 'end'::text])));
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT uq_coaching_plan_item UNIQUE (plan_id, routine_habit_id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_activated_matches_status CHECK ((((status = 'draft'::text) AND (activated_at IS NULL) AND (ended_at IS NULL)) OR ((status = 'active'::text) AND (activated_at IS NOT NULL) AND (ended_at IS NULL)) OR ((status = 'ended'::text) AND (ended_at IS NOT NULL))));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_dates_ordered CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (ends_on >= starts_on)));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_not_self CHECK (((coach_user_id)::text <> (member_user_id)::text));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'ended'::text])));

ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_cancelled_by_user_id_fkey FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES terrain_checkins(id) ON DELETE SET NULL;
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES coach_relationships(id) ON DELETE SET NULL;
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES coaching_plans(id) ON DELETE CASCADE;
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_routine_habit_id_fkey FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_activated_by_user_id_fkey FOREIGN KEY (activated_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_ended_by_user_id_fkey FOREIGN KEY (ended_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES coach_relationships(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Partial uniques, which are where the real invariants live: one open check-in
-- per pair, one active plan per member, one notification per dedupe key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_checkin_open ON public.coaching_checkin_requests USING btree (member_user_id, coach_user_id) WHERE (status = 'open'::text);
CREATE INDEX IF NOT EXISTS idx_coaching_checkin_member ON public.coaching_checkin_requests USING btree (member_user_id, status);
CREATE INDEX IF NOT EXISTS idx_coaching_checkin_coach ON public.coaching_checkin_requests USING btree (coach_user_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_plan_item_plan ON public.coaching_plan_items USING btree (plan_id, order_index);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_plan_active_member ON public.coaching_plans USING btree (member_user_id) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS idx_coaching_plan_member ON public.coaching_plans USING btree (member_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_plan_coach ON public.coaching_plans USING btree (coach_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_dedupe ON public.notifications USING btree (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
