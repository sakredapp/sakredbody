-- ═══════════════════════════════════════════════════════════════════════════
-- Invite-only rooms
--
-- Channels could be gated two ways: by membership tier, or by registration in
-- an offering. Neither covers "a room for these six people" — a coaching pod,
-- a founders' circle, one retreat's alumni.
--
-- This adds the third path: an explicit member list, and a flag that says the
-- list is the ONLY way in.
--
-- ── The rule is written twice and both copies change here ─────────────────
--
-- `visibleChannelIds` in TypeScript and `can_see_channel` in SQL express the
-- same rule. The community module's own header warns about this, and the last
-- time the two drifted — a rename that rewrote policies but not function
-- bodies — every channel permission check threw. Both are updated below and
-- in the same migration on purpose.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.channels
  add column if not exists is_private boolean not null default false;

comment on column public.channels.is_private is
  'When true the explicit member list is the only way in — tier rank is ignored entirely. Admins still see everything.';

create table if not exists public.channel_members (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     varchar not null references public.users(id) on delete cascade,
  -- Who put them there. Useful a year later when nobody remembers why this
  -- person is in the founders' room.
  added_by    varchar references public.users(id) on delete set null,
  created_at  timestamptz default now()
);

create unique index if not exists uq_channel_members
  on public.channel_members (channel_id, user_id);
create index if not exists idx_channel_members_user
  on public.channel_members (user_id);

alter table public.channel_members enable row level security;

drop policy if exists "channel_members_no_client" on public.channel_members;
create policy "channel_members_no_client" on public.channel_members
  for all to anon, authenticated using (false) with check (false);

-- ─── The SQL half of the rule ──────────────────────────────────────────────
--
-- Recreated whole rather than patched. Function bodies are stored as text and
-- are never rewritten by anything, so the only safe way to change one is to
-- replace it and then call it.

create or replace function public.can_see_channel(p_user_id varchar, p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from channels c
    left join users u on u.id = p_user_id
    left join membership_tiers t on t.id = u.membership_tier
    where c.id = p_channel_id
      and c.is_active
      and (
        -- An admin sees every room. This bypass is the reason the rule cannot
        -- be reimplemented casually: a copy that forgets it locks out the only
        -- people who can fix anything.
        u.is_admin = 'true'

        -- Explicitly invited.
        or exists (
          select 1 from channel_members m
          where m.channel_id = c.id and m.user_id = p_user_id
        )

        -- A private room ends there: no tier and no offering opens it.
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
$$;
