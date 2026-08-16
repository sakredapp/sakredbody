-- ═══════════════════════════════════════════════════════════════════════════
-- A workout is made of movements — session_exercises
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now, "what is in this workout" had no row anywhere. It was inferred
-- from `select distinct exercise_id from workout_sets`, plus a React `useState`
-- on the phone holding whatever had been chosen and not yet logged. The gap
-- between those two is the minute between picking a movement and finishing its
-- first set, and in that minute the only record of the choice was in browser
-- memory. Lock the phone, take a call, let iOS reclaim the tab: gone.
--
-- A set is a record of work done. "Incline chest press is in today's workout"
-- is an earlier and different claim, and it needs somewhere to live.
--
-- ── Four things become expressible ─────────────────────────────────────────
--
--   · a movement survives before its first set;
--   · order is stored rather than re-derived from whichever set was logged
--     first, so a cold reopen returns the workout as it was arranged;
--   · a superset becomes a relationship between movements, which is what it
--     is — `superset_group`, shared by everything performed together;
--   · previous performance can bind to the exact movement about to be
--     performed rather than to a string scraped out of the set rows.
--
-- ── workout_sets is not touched by the first half of this ──────────────────
--
-- No new foreign key on sets, and no backfill of the product's whole history to
-- populate it. There is one composition row per movement per session — held by
-- a unique index — so `(session_id, exercise_id)` already identifies it for any
-- set. The join is free.
--
-- ── The second half: set metadata ──────────────────────────────────────────
--
-- `set_style` and `to_failure` are added to workout_sets. `is_warmup` stays,
-- because every derived number in the product reads it — volume, the e1RM
-- series, the movement events terrain is built on — and a CHECK holds the two
-- in agreement so neither reader can be wrong. There is deliberately no
-- 'superset' style: it is not a property of a repetition.
--
-- Forward-only and idempotent. Verify after applying rather than trusting the
-- success response — see CLAUDE.md §5.
--
-- Applied 2026-08-16. Verified after: 8 composition rows against 8 distinct
-- (session, exercise) pairs in workout_sets, RLS on with one policy, three
-- indexes plus the primary key, and all three guards negative-tested inside a
-- rolled-back block — a warm-up style disagreeing with the flag, an unknown
-- style, and a duplicate movement in one session were each refused.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Composition ─────────────────────────────────────────────────────────

create table if not exists public.session_exercises (
  id                 uuid primary key default gen_random_uuid(),

  -- Cascades: discarding a workout must not leave its composition behind, the
  -- same rule the sets and observations already follow.
  session_id         uuid not null references public.workout_sessions(id) on delete cascade,

  -- Text, because exercises.id is a slug rather than a uuid. No FK to
  -- exercises, matching workout_sets: a catalogue row that disappears must not
  -- be able to take a member's workout with it.
  exercise_id        text not null,

  -- Which prescribed line this answers, when it answers one.
  habit_exercise_id  uuid,

  -- The member's own order, 0-based. Not unique — two movements in a superset
  -- share a position, and created_at breaks the tie.
  position           integer not null default 0,

  -- Movements sharing a key are performed together. Null is the usual case.
  -- A shared key rather than a pointer to a "primary" exercise, so a tri-set is
  -- the same shape with three members and removing one does not orphan the
  -- rest.
  superset_group     uuid,

  created_at         timestamptz not null default now()
);

-- One row per movement per session. The workout screen has always grouped by
-- exercise; this makes that a rule the database holds, and it is what lets a
-- set find its composition row without carrying a second id.
create unique index if not exists uq_session_exercises_session_exercise
  on public.session_exercises (session_id, exercise_id);
create index if not exists idx_session_exercises_session
  on public.session_exercises (session_id, position);
create index if not exists idx_session_exercises_group
  on public.session_exercises (superset_group);

-- ── 2. Backfill, without changing any history ──────────────────────────────
--
-- Every session that already has sets gets its composition stated explicitly,
-- in the order it was trained: first appearance by set_index. Nothing about the
-- sets themselves changes, and `on conflict do nothing` makes a re-run a no-op
-- rather than an error.

insert into public.session_exercises (session_id, exercise_id, position, created_at)
select
  s.session_id,
  s.exercise_id,
  (row_number() over (partition by s.session_id order by s.first_index, s.first_at)) - 1,
  s.first_at
from (
  select
    session_id,
    exercise_id,
    min(set_index)  as first_index,
    min(created_at) as first_at
  from public.workout_sets
  group by session_id, exercise_id
) s
on conflict (session_id, exercise_id) do nothing;

-- ── 3. Set metadata ────────────────────────────────────────────────────────

alter table public.workout_sets
  add column if not exists set_style text not null default 'normal',
  add column if not exists to_failure boolean not null default false;

-- Existing warm-ups get the spelling that matches them, before the constraint
-- that requires it. Order matters: adding the CHECK first would reject the
-- table it is meant to describe.
update public.workout_sets
   set set_style = 'warmup'
 where is_warmup and set_style <> 'warmup';

alter table public.workout_sets
  drop constraint if exists workout_sets_set_style_known;
alter table public.workout_sets
  add constraint workout_sets_set_style_known
  check (set_style in ('normal', 'warmup', 'dropset', 'backoff'));

-- The invariant, so the two spellings of "this was a warm-up" cannot drift.
-- Every existing reader of is_warmup stays correct without knowing set_style
-- exists, which is the entire reason both columns are kept.
alter table public.workout_sets
  drop constraint if exists workout_sets_warmup_agrees;
alter table public.workout_sets
  add constraint workout_sets_warmup_agrees
  check ((set_style = 'warmup') = is_warmup);

-- ── 4. Same posture as every other training table ──────────────────────────
--
-- The server holds the connection and the client never touches this directly.
-- RLS on with no policy is the failure that looks like success, so the policy
-- is written in the same statement block as the enable.

alter table public.session_exercises enable row level security;

drop policy if exists "session_exercises_no_client" on public.session_exercises;
create policy "session_exercises_no_client" on public.session_exercises
  for all to anon, authenticated using (false) with check (false);
