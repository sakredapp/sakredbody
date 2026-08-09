-- ═══════════════════════════════════════════════════════════════════════════
-- Training — the Build side
--
-- See shared/models/training.ts for the full reasoning. The shape in one
-- paragraph: Build is not a workout logger. Sessions are prebuilt by a coach
-- against a protocol and a season, mostly heavy — 2 to 8 reps. The member is
-- handed a prescription and records what they actually hit against it.
--
-- Because of that, this rides the protocol engine rather than paralleling it.
-- A Build protocol is a `wellness_routines` row; its habits are sessions; and
-- `habit_exercises` below is the only new idea — the lifts prescribed for one
-- of those sessions. Enrollment, day windows, materialisation, Today,
-- completion, streaks and wins are all inherited and none of it is rebuilt.
--
-- Applied transactionally like every migration in this directory.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Units, on the member ──────────────────────────────────────────────────
--
-- Defaults to lb: the client base is American, and a default that makes most
-- people change a setting before their first set costs sign-ups.

alter table public.users
  add column if not exists weight_unit text not null default 'lb';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_weight_unit_chk') then
    alter table public.users
      add constraint users_weight_unit_chk check (weight_unit in ('kg','lb'));
  end if;
end $$;

-- ─── 1. The catalogue ──────────────────────────────────────────────────────
--
-- Curated, not crowdsourced. Because sessions are prescribed rather than
-- composed, this stays small — the lifts the programme actually uses, not a
-- thousand machine variations. Free-text names would fragment "bench",
-- "Bench Press" and "BB bench" into three movements that can never be graphed
-- together, and no later cleanup recovers which was which.

create table if not exists public.exercises (
  id                  text primary key,
  name                text not null,
  -- squat | hinge | push | pull | carry | core | conditioning | mobility
  pattern             text not null default 'push',
  equipment           text not null default 'barbell',

  -- What a set of this is measured in. The reason this column exists: a plank
  -- has no reps and a carry has no reps, and forcing them to "1 rep" is a lie
  -- the data never recovers from.
  tracking_type       text not null default 'reps',

  -- What the movement loads as a multiple of bodyweight before added plates.
  -- Pull-up 1.0, push-up ~0.64, barbell squat 0. Without it, twenty pull-ups
  -- record as zero load.
  bodyweight_factor   real not null default 0,

  -- First is primary. Familiar to members in a way movement patterns are not.
  muscle_groups       text[],
  aliases             text[],

  -- False for carries and conditioning, where an estimated single is nonsense.
  tracks_one_rep_max  boolean not null default true,

  demo_url            text,
  cues                text,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz default now(),

  constraint exercises_pattern_chk check (pattern in
    ('squat','hinge','push','pull','carry','core','conditioning','mobility')),
  constraint exercises_equipment_chk check (equipment in
    ('barbell','dumbbell','kettlebell','machine','smith_machine','cable',
     'bodyweight','band','medicine_ball','other')),
  constraint exercises_tracking_chk check (tracking_type in
    ('reps','duration','distance')),
  constraint exercises_bw_factor_chk check (bodyweight_factor >= 0 and bodyweight_factor <= 2)
);

create index if not exists idx_exercises_pattern on public.exercises (pattern);
create index if not exists idx_exercises_active  on public.exercises (is_active);

-- ─── 2. The prescription ───────────────────────────────────────────────────
--
-- The lifts that make up one prescribed session. Hangs off `routine_habits`,
-- which is the habit template — so "Lower Body Power" is an ordinary habit
-- that happens to carry four exercises, and everything the habit engine does
-- for a breathwork step it already does for this.
--
-- Targets are a range rather than a number because that is how heavy work is
-- actually written: 4 × 3–5, take the top set to a hard 5 or stop at 3.

create table if not exists public.habit_exercises (
  id               uuid primary key default gen_random_uuid(),
  routine_habit_id uuid not null references public.routine_habits(id) on delete cascade,
  exercise_id      text not null references public.exercises(id) on delete restrict,

  order_index      integer not null default 0,
  target_sets      integer not null default 3,
  target_reps_low  integer,
  target_reps_high integer,

  -- Optional load guidance, as a percentage of the member's estimated max.
  -- Null means the coach wrote it in words instead — "top set heavy, back-offs
  -- at RPE 7" is a real prescription and does not reduce to a number.
  target_percent_1rm  real,
  rest_seconds        integer,
  note                text,
  created_at          timestamptz default now(),

  constraint habit_exercises_sets_chk check (target_sets > 0 and target_sets <= 20),
  constraint habit_exercises_reps_chk check (
    target_reps_low is null or target_reps_high is null or target_reps_low <= target_reps_high
  ),
  constraint habit_exercises_pct_chk check (
    target_percent_1rm is null or (target_percent_1rm > 0 and target_percent_1rm <= 150)
  )
);

create index if not exists idx_habit_exercises_habit
  on public.habit_exercises (routine_habit_id, order_index);
create index if not exists idx_habit_exercises_exercise
  on public.habit_exercises (exercise_id);

-- ─── 3. Bodyweight over time ───────────────────────────────────────────────
--
-- Its own table, not a column on users, because relative strength needs the
-- bodyweight AT the time of the lift. A single current-weight column would
-- silently rewrite history: lose fifteen pounds and every squat you ever did
-- retroactively becomes a better ratio.

create table if not exists public.body_measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     varchar not null references public.users(id) on delete cascade,
  on_date     date not null,
  weight_kg   real,
  height_cm   real,
  note        text,
  created_at  timestamptz default now(),

  constraint body_measurements_weight_chk check (weight_kg is null or (weight_kg > 9 and weight_kg < 320)),
  constraint body_measurements_height_chk check (height_cm is null or (height_cm > 80 and height_cm < 260))
);

create unique index if not exists uq_body_measurements_user_date
  on public.body_measurements (user_id, on_date);
create index if not exists idx_body_measurements_user
  on public.body_measurements (user_id, on_date desc);

-- ─── 4. What actually happened ─────────────────────────────────────────────

create table if not exists public.workout_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           varchar not null references public.users(id) on delete cascade,
  -- SET NULL, never CASCADE: deleting the habit that prescribed a session must
  -- not erase what somebody lifted. Same rule habit-identity established —
  -- templates are editable, history is not.
  habit_id          uuid references public.habits(id) on delete set null,
  on_date           date not null,
  title             text,
  note              text,
  duration_minutes  integer,
  -- Null while in progress. A session abandoned halfway keeps its sets.
  finished_at       timestamptz,
  created_at        timestamptz default now()
);

create index if not exists idx_workout_sessions_user_date
  on public.workout_sessions (user_id, on_date desc);
create index if not exists idx_workout_sessions_habit
  on public.workout_sessions (habit_id);

create table if not exists public.workout_sets (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.workout_sessions(id) on delete cascade,
  -- RESTRICT: deleting an exercise someone has lifted should fail loudly and
  -- make an admin deactivate it instead. CASCADE would delete their history;
  -- SET NULL would leave sets belonging to no movement, ungraphable forever.
  exercise_id      text not null references public.exercises(id) on delete restrict,
  -- Which prescribed line this set answers, when it answers one. SET NULL so
  -- rewriting a programme never deletes the sets performed under the old one.
  habit_exercise_id uuid references public.habit_exercises(id) on delete set null,

  set_index        integer not null default 1,

  -- One of these three, matching the exercise's tracking_type. All nullable
  -- because a plank has no reps and a squat has no distance.
  reps             integer,
  duration_seconds integer,
  distance_m       real,

  weight_kg        real not null default 0,
  -- Recorded and excluded from every derived number. Dropping warm-ups would
  -- be tidier and wrong: a member who logs their ramp wants it next week, and
  -- counting it toward volume would make a light day look heavy.
  is_warmup        boolean not null default false,
  rpe              real,
  note             text,
  created_at       timestamptz default now(),

  -- A set has to measure something. Without this a row of all-nulls is
  -- accepted and every average silently skips it.
  constraint workout_sets_measure_chk check (
    reps is not null or duration_seconds is not null or distance_m is not null
  ),
  constraint workout_sets_reps_chk     check (reps is null or (reps > 0 and reps <= 500)),
  constraint workout_sets_duration_chk check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 86400)),
  constraint workout_sets_distance_chk check (distance_m is null or (distance_m > 0 and distance_m <= 500000)),
  constraint workout_sets_weight_chk   check (weight_kg >= 0 and weight_kg <= 910),
  constraint workout_sets_rpe_chk      check (rpe is null or (rpe >= 1 and rpe <= 10))
);

create index if not exists idx_workout_sets_session  on public.workout_sets (session_id);
create index if not exists idx_workout_sets_exercise on public.workout_sets (exercise_id);
create index if not exists idx_workout_sets_prescribed on public.workout_sets (habit_exercise_id);

-- ─── Access ────────────────────────────────────────────────────────────────
--
-- Catalogue and prescriptions are readable by any signed-in member; personal
-- history is server-only. RLS on with no client policy means anon and
-- authenticated read nothing, while the server's connection — not subject to
-- RLS — works normally. Same pattern as login_attempts.

alter table public.exercises          enable row level security;
alter table public.habit_exercises    enable row level security;
alter table public.body_measurements  enable row level security;
alter table public.workout_sessions   enable row level security;
alter table public.workout_sets       enable row level security;

drop policy if exists "exercises_read" on public.exercises;
create policy "exercises_read" on public.exercises
  for select to authenticated using (is_active);

drop policy if exists "habit_exercises_read" on public.habit_exercises;
create policy "habit_exercises_read" on public.habit_exercises
  for select to authenticated using (true);

drop policy if exists "body_measurements_no_client" on public.body_measurements;
create policy "body_measurements_no_client" on public.body_measurements
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "workout_sessions_no_client" on public.workout_sessions;
create policy "workout_sessions_no_client" on public.workout_sessions
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "workout_sets_no_client" on public.workout_sets;
create policy "workout_sets_no_client" on public.workout_sets
  for all to anon, authenticated using (false) with check (false);

comment on table public.habit_exercises is
  'The lifts prescribed for one session. Hangs off routine_habits so a Build session is an ordinary habit that happens to carry exercises — enrollment, day windows, Today, streaks and wins all come from the existing engine.';
comment on column public.exercises.tracking_type is
  'reps | duration | distance. A plank has no reps; forcing it to 1 is a lie the data never recovers from.';
comment on column public.exercises.bodyweight_factor is
  'Load as a multiple of bodyweight before added plates. Pull-up 1.0, push-up ~0.64, barbell squat 0.';
