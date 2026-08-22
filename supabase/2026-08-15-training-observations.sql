-- ═══════════════════════════════════════════════════════════════════════════
-- What the body said — training observations
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Three `note` columns already existed (workout_sets, workout_sessions,
-- member_workout_exercises) and all three had the same two problems: nothing
-- wrote to them and nothing read them. None of them can hold what matters
-- either — an observation is about a *movement, in a session, on a side*, and
-- a note on set 3 of 4 is not where that lives.
--
-- `note` is the member's own sentence and is never rewritten. `quality` and
-- `side` are their own structuring of their own answer, chosen from a short
-- list, not inferred from their words by anything. There is deliberately no
-- column for model-extracted tags: when extraction is worth adding it gets its
-- own columns and its own provenance, so an interpretation can never be
-- written over the thing it interprets.
--
-- Applied 2026-08-15. Verified after: table present, RLS on with a policy,
-- both indexes created.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.training_observations (
  id           uuid primary key default gen_random_uuid(),
  user_id      varchar not null references public.users(id) on delete cascade,

  -- Always a session. An observation with no training behind it is a mood.
  -- Cascades, because discarding a workout must not leave notes about it.
  session_id   uuid not null references public.workout_sessions(id) on delete cascade,

  -- Which movement, or null for the session as a whole. Text, because
  -- exercises.id is a slug rather than a uuid.
  exercise_id  text references public.exercises(id) on delete set null,

  -- The member's own day, denormalised from the session: "what have they said
  -- about hinging lately" is asked on the way into a warm-up, which is a
  -- request path, and should not join through sessions to answer.
  on_date      date not null,

  note         text,
  quality      text check (quality in ('good','tight','weak','discomfort','unstable','other')),
  side         text check (side in ('left','right','both')),

  created_at   timestamptz not null default now(),

  -- A row with neither a word nor a sentence records nothing but a tap.
  constraint training_observations_says_something
    check (coalesce(btrim(note), '') <> '' or quality is not null)
);

create index if not exists idx_training_observations_user
  on public.training_observations (user_id, on_date desc);
create index if not exists idx_training_observations_exercise
  on public.training_observations (user_id, exercise_id);
create index if not exists idx_training_observations_session
  on public.training_observations (session_id);

-- Same posture as workout_sessions: the server holds the connection, the
-- client never touches this table directly, and RLS-on-with-no-policy would be
-- a failure that looks like success.
alter table public.training_observations enable row level security;

drop policy if exists "training_observations_no_client" on public.training_observations;
create policy "training_observations_no_client" on public.training_observations
  for all to anon, authenticated using (false) with check (false);
