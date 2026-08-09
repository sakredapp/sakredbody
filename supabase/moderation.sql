-- ═══════════════════════════════════════════════════════════════════════════
-- Moderation — reporting and blocking
--
-- Required, not optional: Google Play's UGC policy and Apple guideline 1.2
-- both demand a way to report content and a way to block a person before an
-- app with member-to-member content can be listed. The community shipped with
-- neither.
--
-- See shared/models/moderation.ts for why a block is one-directional and why
-- a report has no foreign key to the message it points at.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.content_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  varchar not null references public.users(id) on delete cascade,

  -- Deliberately NOT a foreign key. Deleting the message is frequently the
  -- resolution, and a cascade would destroy the record of why it happened.
  message_id   uuid not null,

  -- Denormalised so the queue still shows who wrote what after the message is
  -- gone. This is the only place these are duplicated, and the duplication is
  -- the point: it has to outlive the original.
  author_id    varchar,
  excerpt      text,

  reason       text not null,
  detail       text,

  status       text not null default 'open',
  reviewed_by  varchar references public.users(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,

  created_at   timestamptz default now(),

  constraint content_reports_reason_chk check (reason in
    ('harassment','spam','hate','sexual','violence','self_harm','misinformation','other')),
  constraint content_reports_status_chk check (status in ('open','actioned','dismissed'))
);

-- One report per person per message: a second is the same complaint, and
-- counting it twice makes one upset member look like a crowd.
create unique index if not exists uq_content_reports_reporter_message
  on public.content_reports (reporter_id, message_id);
create index if not exists idx_content_reports_status
  on public.content_reports (status, created_at desc);
create index if not exists idx_content_reports_message
  on public.content_reports (message_id);

create table if not exists public.user_blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  varchar not null references public.users(id) on delete cascade,
  blocked_id  varchar not null references public.users(id) on delete cascade,
  created_at  timestamptz default now(),

  -- Blocking yourself is not a thing, and would hide your own posts from you.
  constraint user_blocks_not_self_chk check (blocker_id <> blocked_id)
);

create unique index if not exists uq_user_blocks_pair
  on public.user_blocks (blocker_id, blocked_id);
create index if not exists idx_user_blocks_blocker
  on public.user_blocks (blocker_id);

-- ─── Access ────────────────────────────────────────────────────────────────
--
-- Server-only, both of them. A client that could read content_reports could
-- see who reported whom, which is exactly the information that turns a quiet
-- report into a confrontation. Same pattern as login_attempts.

alter table public.content_reports enable row level security;
alter table public.user_blocks     enable row level security;

drop policy if exists "content_reports_no_client" on public.content_reports;
create policy "content_reports_no_client" on public.content_reports
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "user_blocks_no_client" on public.user_blocks;
create policy "user_blocks_no_client" on public.user_blocks
  for all to anon, authenticated using (false) with check (false);

comment on table public.content_reports is
  'Member reports of community messages. message_id has no FK on purpose: deleting the message is often the resolution and must not erase the record of why.';
comment on table public.user_blocks is
  'One-directional. The blocker stops seeing the blocked person everywhere; nothing changes on the other side, and no notice is sent.';
