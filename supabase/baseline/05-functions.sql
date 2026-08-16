-- ─── Functions the policies depend on ─────────────────────────────────────
--
-- Production has 37 functions in `public`; 31 of them belong to pg_trgm and
-- arrive with the extension. These six are ours, and the policies in 04 do not
-- work without them.
--
-- ── One thing found while writing this down ───────────────────────────────
--
-- `can_see_channel` exists TWICE, with different signatures and different
-- rules:
--
--   can_see_channel(text, uuid)              -- tier rank + offering
--   can_see_channel(character varying, uuid) -- admin bypass, explicit invites,
--                                            -- private rooms
--
-- The policies call `can_see_channel((auth.uid())::text, id)`, which resolves
-- to the FIRST — the older, simpler one. The second, which is the version
-- somebody wrote comments for about admins never being locked out and private
-- rooms staying private, is not what the database consults.
--
-- Both are reproduced here so the QA branch matches production exactly. Which
-- one should survive is a decision, not a cleanup, and it belongs to whoever
-- owns Community. Recorded rather than quietly resolved.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.is_sakred_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()::text
      AND is_admin = 'true'
  );
$function$;

CREATE OR REPLACE FUNCTION public.member_tier_rank(p_user_id text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(t.rank, 0)
  FROM users u
  LEFT JOIN membership_tiers t ON t.id = u.membership_tier
  WHERE u.id = p_user_id;
$function$;

-- The overload the policies actually resolve to.
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

-- The overload that is never called. See the note at the top of this file.
CREATE OR REPLACE FUNCTION public.can_see_channel(p_user_id character varying, p_channel_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from channels c
    left join users u on u.id = p_user_id
    left join membership_tiers t on t.id = u.membership_tier
    where c.id = p_channel_id
      and c.is_active
      and (
        u.is_admin = 'true'
        or exists (
          select 1 from channel_members m
          where m.channel_id = c.id and m.user_id = p_user_id
        )
        or (
          not c.is_private
          and (
            case
              when c.offering_id is not null then exists (
                select 1 from offering_registrations r
                where r.offering_id = c.offering_id
                  and r.user_id = p_user_id
                  and r.status = 'confirmed'
              )
              else coalesce(t.rank, 0) >= c.min_tier_rank
            end
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.bump_reply_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE community_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE community_messages SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END $function$;

-- A phase is a contract: close it and open a new one rather than editing what
-- somebody was already asked to do.
CREATE OR REPLACE FUNCTION public.tracked_habit_phase_freeze()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tracked_habit_id  IS DISTINCT FROM OLD.tracked_habit_id
  OR NEW.user_id           IS DISTINCT FROM OLD.user_id
  OR NEW.routine_habit_id  IS DISTINCT FROM OLD.routine_habit_id
  OR NEW.target            IS DISTINCT FROM OLD.target
  OR NEW.phase_type        IS DISTINCT FROM OLD.phase_type
  OR NEW.starts_on         IS DISTINCT FROM OLD.starts_on
  OR NEW.duration_days     IS DISTINCT FROM OLD.duration_days
  OR NEW.schedule_kind     IS DISTINCT FROM OLD.schedule_kind
  OR NEW.schedule_days     IS DISTINCT FROM OLD.schedule_days
  OR NEW.schedule_count    IS DISTINCT FROM OLD.schedule_count
  OR NEW.recommended_time  IS DISTINCT FROM OLD.recommended_time
  OR NEW.source            IS DISTINCT FROM OLD.source
  OR NEW.assigned_by_user_id IS DISTINCT FROM OLD.assigned_by_user_id
  OR NEW.member_reason     IS DISTINCT FROM OLD.member_reason
  OR NEW.coach_note        IS DISTINCT FROM OLD.coach_note
  THEN
    RAISE EXCEPTION
      'tracked_habit_phases %: a phase is a contract. Close it and open a new one rather than editing what somebody was already asked to do.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;
