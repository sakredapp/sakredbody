-- ═══════════════════════════════════════════════════════════════════════════
-- Login throttling
--
-- See shared/models/security.ts for why this is a table and not an in-process
-- counter. Short version: several Vercel instances serve login at once and
-- none of them share memory, so a memory counter is not a limit.
--
-- Applied transactionally, like every migration in this directory.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.login_attempts (
  identifier   text primary key,
  attempts     integer     not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

create index if not exists idx_login_attempts_locked
  on public.login_attempts (locked_until);

-- ─── Access ────────────────────────────────────────────────────────────────
--
-- Nothing outside the server has any business reading this: the row keys are
-- email addresses, so the table is a list of who has an account and who has
-- been having trouble getting into it. RLS on with no policy means the
-- anon and authenticated roles can read exactly nothing, while the server's
-- own connection (which is not subject to RLS) works normally.

alter table public.login_attempts enable row level security;

drop policy if exists "login_attempts_no_client_access" on public.login_attempts;
create policy "login_attempts_no_client_access"
  on public.login_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.login_attempts is
  'Failed-login counters, keyed email:<addr> or ip:<addr>. Server-only; RLS denies all client access. Rows are self-expiring — see THROTTLE in shared/models/security.ts.';
