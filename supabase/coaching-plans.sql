-- The Coach's Plan — a container and a provenance object, not a second engine.
--
-- ── What the audit found, and why this is small ─────────────────────────────
--
-- The Habit OS already does almost all of this:
--
--   addTrackedHabit  is idempotent — a member who already tracks Morning Light
--                    and is then assigned it gets one tracked habit, not two
--   reconfigure      closes the old phase and opens a new one, transactionally,
--                    with a database trigger freezing the closed contract
--   source           already accepts 'plan'
--   tracked_habit_links  already joins a tracked habit to a context, and
--                    CONTEXT_TYPES already contains 'plan'
--
-- So the grouping concept exists. What was missing is the thing `context_id`
-- points at. That is all this table is. Habit truth stays in
-- `tracked_habit_phases`; nothing here duplicates a target, a schedule or a
-- completion.
--
-- ── Why there is a separate items table ─────────────────────────────────────
--
-- A coach has to be able to assemble a plan across several sittings without
-- each click changing what the member is asked to do that evening. A draft
-- therefore cannot be expressed as phases — phases are live by construction.
-- `coaching_plan_items` holds the *intent*; activation turns intent into
-- contracts through the existing writers, in one transaction.
--
-- ── On statuses ─────────────────────────────────────────────────────────────
--
-- draft, active, ended. Not 'completed': whether a plan ran its course is
-- `ended_at >= ends_on`, which is derivable, and a derivable fourth state is a
-- state two code paths will eventually disagree about. Same reasoning that kept
-- `classification_source` off the workouts table and `paused` off
-- `coach_relationships`.

begin;

create table if not exists coaching_plans (
  id uuid primary key default gen_random_uuid(),

  member_user_id varchar not null references users(id),

  /**
   * The coach this plan belongs to.
   *
   * Kept even after reassignment, because "who put Sarah on this" is a
   * historical fact. The relationship row it was created under is recorded
   * separately so a plan can be read against the arrangement that produced it.
   */
  coach_user_id varchar not null references users(id),
  relationship_id uuid references coach_relationships(id),

  title text not null,
  focus text,

  /**
   * Two notes, two audiences, never one field.
   *
   * `member_visible_note` is guidance written *to* the member. `internal_note`
   * is the coach's own, and the member is not its audience — the same
   * separation `tracked_habit_phases` already keeps between `member_reason` and
   * `coach_note`. One field serving both is how a private observation ends up
   * on somebody's home screen.
   */
  member_visible_note text,
  internal_note text,

  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),

  starts_on date,
  ends_on date,

  /**
   * Who actually did it, which is not always the coach it belongs to.
   *
   * An admin acting under `superviseCoaching` may intervene on a member's plan.
   * Recording that as the assigned coach's work would be a lie that survives in
   * the record forever, and the member could act on it.
   */
  created_by_user_id varchar not null references users(id),
  activated_by_user_id varchar references users(id),
  ended_by_user_id varchar references users(id),

  activated_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An active plan has to have been activated, and an ended one ended. Kept in
  -- the database because a status that disagrees with its own timestamps is a
  -- row nothing downstream can reason about.
  constraint coaching_plan_activated_matches_status check (
    (status = 'draft'  and activated_at is null and ended_at is null) or
    (status = 'active' and activated_at is not null and ended_at is null) or
    (status = 'ended'  and ended_at is not null)
  ),

  constraint coaching_plan_dates_ordered check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  ),

  -- Nobody plans for themselves through this table.
  constraint coaching_plan_not_self check (coach_user_id <> member_user_id)
);

/**
 * One active plan per member.
 *
 * The same shape as the one-active-coach index. Two live plans would mean two
 * answers to "what is Sarah on", and every screen would pick whichever it read
 * first.
 */
create unique index if not exists uq_coaching_plan_active_member
  on coaching_plans (member_user_id)
  where status = 'active';

create index if not exists idx_coaching_plan_member
  on coaching_plans (member_user_id, status, created_at desc);

create index if not exists idx_coaching_plan_coach
  on coaching_plans (coach_user_id, status);

-- ── What a draft intends ────────────────────────────────────────────────────

create table if not exists coaching_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references coaching_plans(id) on delete cascade,

  /**
   * A catalogue habit, always.
   *
   * There is deliberately no free-text title. The Habit OS runs on defined
   * practices with a load class, a terrain fit and a tracking contract; a name
   * typed into a box has none of those, so it cannot be scheduled, graded,
   * measured against a health metric, or weighed by the safety check. A coach
   * who needs something not in the catalogue needs the catalogue changed.
   */
  routine_habit_id uuid not null references routine_habits(id),

  /**
   * What this plan means to do about it.
   *
   *   add     put the member on it
   *   change  they are already on it; this is a new contract
   *   end     they are on it and this plan stops it
   *
   * Recorded as intent rather than computed at activation so the review screen
   * and the activation agree by construction. Computing it twice is how a
   * coach approves "target 140 → 165" and something else happens.
   */
  intent text not null default 'add' check (intent in ('add', 'change', 'end')),

  -- The contract this item wants. Null means "whatever the catalogue says".
  target double precision,
  schedule_kind text,
  schedule_days smallint[],
  schedule_count integer,
  recommended_time text,

  member_reason text,
  coach_note text,

  order_index integer not null default 0,
  created_at timestamptz not null default now(),

  -- One decision per habit per plan. Two rows for one habit would be two
  -- intentions and no way to say which won.
  constraint uq_coaching_plan_item unique (plan_id, routine_habit_id)
);

create index if not exists idx_coaching_plan_item_plan
  on coaching_plan_items (plan_id, order_index);

/**
 * RLS on, with no policy that grants anything.
 *
 * The app connects as `service_role` and bypasses this by design — Express is
 * what protects the row. This is the second wall: a leaked anon key reaches
 * nothing. Deny-all is the intended state here, not the failure that looks like
 * success.
 */
alter table coaching_plans enable row level security;
alter table coaching_plan_items enable row level security;

commit;
