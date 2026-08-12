-- What the member says about an imported session.
--
-- Everything else on health_workouts is Apple's or Google's account of what
-- happened, and a re-sync is entitled to correct any of it. These two columns
-- are not that. They are the person's own reading of the session, and the sync
-- must never touch them — the upsert in server/health/routes.ts names its
-- columns and these are deliberately not among them.
--
-- ── Two columns, not three ───────────────────────────────────────────────────
--
-- There is no `classification_source`. Whether a placement came from the member
-- or from Sakred is already answered by whether the override is null, and a
-- stored copy of a derivable fact is a second thing that can disagree with the
-- first. If learned personalisation ever needs to record a third origin, it can
-- add a column that says something the schema does not already say.
--
-- ── An override moves a session, it does not forgive it ──────────────────────
--
-- user_orientation_override decides which side of the app a session is shown
-- on. It is not read by the terrain or load path, which goes through the
-- activity's category and CATEGORY_LOAD as it does for every Sakred-logged
-- session. Somebody who found their 54-minute run restorative still ran for 54
-- minutes, and the reading that decides whether to tell them to rest has to
-- keep knowing that.
--
-- That separation is also why the vocabulary here is restore/build/both rather
-- than the model's yin/yang/both. A column spelled in the load model's own
-- words is one careless line away from being fed back into the load model.

alter table health_workouts
  add column if not exists user_response text,
  add column if not exists user_orientation_override text;

-- Null is the normal state for both — most sessions are never answered, and
-- clearing an answer returns the row to it rather than writing a "none" value
-- that would then need its own handling everywhere.
--
-- A CHECK rather than an enum type: adding a value to a Postgres enum is a
-- migration that cannot run inside a transaction on older servers, and these
-- three words are a product decision that may well gain a fourth.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'health_workouts_user_response_check'
  ) then
    alter table health_workouts
      add constraint health_workouts_user_response_check
      check (user_response is null or user_response in ('restored', 'steady', 'taxed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'health_workouts_orientation_override_check'
  ) then
    alter table health_workouts
      add constraint health_workouts_orientation_override_check
      check (
        user_orientation_override is null
        or user_orientation_override in ('restore', 'build', 'both')
      );
  end if;
end $$;
