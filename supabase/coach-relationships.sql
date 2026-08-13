-- Who coaches whom.
--
-- The application had coaching messages and coach-authored habit phases, and no
-- answer to "who is this member's coach". Every screen that needed one inferred
-- it from a side effect — a plan exists, a message exists — which gets the
-- common case right and the important cases wrong: a coach assigned this
-- morning who has not written yet does not exist, and a coach replaced last
-- month still does.
--
-- ── A table, not users.coach_id ─────────────────────────────────────────────
--
-- A column on `users` answers "who coaches Sarah" and nothing else. It cannot
-- say when the relationship started, who assigned it, who coached her before,
-- or that it has ended without deleting the fact that it existed. Every one of
-- those is needed the first time somebody is reassigned, and reassignment is
-- not an edge case — it is the normal life of a coaching business.
--
-- ── Three concepts, kept apart ─────────────────────────────────────────────
--
--   role / capability   what may this account do          users.role
--   relationship        for which member may they do it   this table
--   attribution         which human actually did it       *_user_id columns
--
-- The role ladder is hierarchical, so every admin already satisfies a
-- coach-level capability check. That must never mean an admin is the assigned
-- coach of every member: capability says what kind of action is permitted, and
-- this table says for whom. Both are checked, separately.
--
-- ── No `paused` in V1 ──────────────────────────────────────────────────────
--
-- A third status whose access semantics nobody has decided is worse than two
-- that are exact. `paused` would sit somewhere between "can read this member"
-- and "cannot", and every route would have to guess which. It can be added
-- with its own migration and its own tests when there is a real reason for it.

create table if not exists coach_relationships (
  id uuid primary key default gen_random_uuid(),

  -- varchar, not uuid: users.id is varchar and some live rows are not uuids
  -- (legacy numeric ids and seeded test accounts). A uuid column here would
  -- have failed on exactly the rows that already exist.
  coach_user_id varchar not null references users(id) on delete cascade,
  member_user_id varchar not null references users(id) on delete cascade,

  status text not null default 'active',

  started_at timestamptz not null default now(),
  -- Set when the relationship ends. The row stays: history is what makes a
  -- past coach's messages and plans attributable after somebody takes over.
  ended_at timestamptz,

  -- Which admin did this. Nullable because a future automated assignment path
  -- would have no human to name, and a fabricated one would be worse.
  assigned_by varchar references users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coach_relationships_status_check
    check (status in ('active', 'ended')),

  -- Nobody coaches themselves. Cheap to state, and the kind of row that would
  -- otherwise appear once through a UI bug and be very confusing.
  constraint coach_relationships_not_self
    check (coach_user_id <> member_user_id),

  -- An ended relationship has an end date and an active one does not. Without
  -- this the two representations drift and every query has to check both.
  constraint coach_relationships_ended_at_matches_status
    check (
      (status = 'active' and ended_at is null)
      or (status = 'ended' and ended_at is not null)
    )
);

-- One primary coach per member, enforced by the database rather than by every
-- code path remembering to check. Partial, so a member can have any number of
-- ended relationships behind them and exactly one live one.
create unique index if not exists uq_coach_relationships_active_member
  on coach_relationships (member_user_id)
  where status = 'active';

-- The coach's roster: their active clients.
create index if not exists idx_coach_relationships_coach
  on coach_relationships (coach_user_id, status);

-- The member's side: "who is my coach", asked on every navigation render.
create index if not exists idx_coach_relationships_member
  on coach_relationships (member_user_id, status);

-- ── Which coach wrote this ─────────────────────────────────────────────────
--
-- `coaching_messages` recorded `sender_role` — 'member' or 'coach' — and not
-- which coach. That was survivable while there was no such thing as a specific
-- coach; it stops being survivable the moment a member can be reassigned,
-- because "a coach wrote this" is not something anybody can act on afterwards.
--
-- Nullable, and deliberately not backfilled. The evidence report found one
-- message in the entire database, sent by a member, so there is no historical
-- attribution to recover — and inventing one would be worse than admitting the
-- author is unknown. New messages record their actual sender.
alter table coaching_messages
  add column if not exists sender_user_id varchar references users(id) on delete set null;

create index if not exists idx_coaching_messages_sender
  on coaching_messages (sender_user_id);
