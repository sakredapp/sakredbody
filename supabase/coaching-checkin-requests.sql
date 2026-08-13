-- Coach-requested check-ins.
--
-- ── What this table is, and what it deliberately is not ─────────────────────
--
-- It is a *request*. The answer lives in `terrain_checkins`, where the member's
-- own answers have always lived, and this points at it.
--
-- The alternative — a `coach_checkin_answers` table — would give the product two
-- subjective histories of one body: one Sakred reads for terrain and
-- recommendations, and one the coach reads. They would disagree within a week,
-- and there would be no answer to which one was the member. One body, one
-- subjective history; coaching adds provenance to it, not a second copy.
--
-- ── Requested does not mean owned ───────────────────────────────────────────
--
-- Nick asks. Sarah answers. The answer is Sarah's health record, and it does not
-- become Nick's because he asked — which is why nothing here copies a value out
-- of the check-in, and why the link survives him being reassigned.

create table if not exists coaching_checkin_requests (
  id uuid primary key default gen_random_uuid(),

  member_user_id varchar not null references users(id) on delete cascade,
  coach_user_id varchar not null references users(id) on delete cascade,

  -- The relationship this was asked under. Kept even after reassignment, so the
  -- history says who was coaching at the time rather than who is now.
  relationship_id uuid references coach_relationships(id) on delete set null,

  -- Who actually clicked. Distinct from coach_user_id for the same reason plans
  -- separate them: an admin acting on a coach's behalf must never be recorded as
  -- the coach.
  requested_by_user_id varchar not null references users(id),

  -- Which shape of check-in was asked for. All three resolve to the same seven
  -- canonical signals; this is what the coach wanted looked at, not a schema.
  kind text not null default 'quick'
    check (kind in ('quick', 'recovery', 'reflection')),

  status text not null default 'open'
    check (status in ('open', 'completed', 'cancelled')),

  -- What Nick wants to know. Shown to the member — this is not a private note.
  coach_prompt text,

  requested_at timestamptz not null default now(),
  due_on date,

  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_user_id varchar references users(id),

  -- The canonical check-in the member completed it with.
  --
  -- Not a copy of the answers, and not a freeze. If Sarah revises today's
  -- check-in at 6pm, this keeps pointing at the same row and the coach sees its
  -- current values — with `completed_at` still saying when she completed the
  -- request. The two facts are different and are stored differently.
  checkin_id uuid references terrain_checkins(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A completed request has both an answer and a time; an open one has neither.
  constraint coaching_checkin_completed_has_answer check (
    (status = 'completed' and completed_at is not null and checkin_id is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint coaching_checkin_cancelled_has_time check (
    (status = 'cancelled') = (cancelled_at is not null)
  ),
  -- Nobody requests a check-in from themselves.
  constraint coaching_checkin_not_self check (member_user_id <> coach_user_id)
);

-- One open request per coach per member.
--
-- Not a rate limiter — a correctness rule. Ten identical open requests is not
-- ten questions, it is one question asked badly, and a member opening Today to
-- a stack of them learns to ignore the module.
create unique index if not exists uq_coaching_checkin_open
  on coaching_checkin_requests (member_user_id, coach_user_id)
  where status = 'open';

create index if not exists idx_coaching_checkin_member
  on coaching_checkin_requests (member_user_id, status);
create index if not exists idx_coaching_checkin_coach
  on coaching_checkin_requests (coach_user_id, status, requested_at desc);

-- The app connects as service_role and every read goes through Express, which
-- is the first wall. RLS on with no policies is the second: nothing reaches this
-- table through PostgREST, by anyone, ever.
alter table coaching_checkin_requests enable row level security;
