-- Durable application notifications.
--
-- ── Why these rows are written inside the business transaction ──────────────
--
-- The obvious shape is: commit the message, then emit an event, then create the
-- notification. On a long-lived server that is fine. This server is a Vercel
-- function that can be frozen the microsecond a response is written, so
-- "afterwards" is not a place work reliably happens — a coaching message could
-- commit and its notification never exist, permanently, with nothing anywhere
-- recording that it should have.
--
-- An outbox is the usual answer and it needs a worker to drain it. There is no
-- worker here; the only scheduled thing in the project runs hourly, and "Nick
-- sent you a message" arriving up to an hour later is worse than not having the
-- indirection at all.
--
-- So the notification is written with the thing that happened, in one
-- transaction. It is a single small insert saying "a human interaction
-- occurred and this person has not seen it", which is close enough to the
-- business fact to belong beside it. A rolled-back plan activation cannot
-- produce a notification, structurally, with no new mechanism to trust.
--
-- Push delivery is the opposite kind of thing — remote, slow, allowed to fail —
-- and stays outside, best-effort, on top of this. It is not built yet.
--
-- ── A notification is evidence, never a state ───────────────────────────────
--
-- It records that something happened. It does not make anything true. An old
-- `checkin_requested` row does not mean a request is still open, and an old
-- `plan_activated` row does not resurrect a plan that has ended. The UI reads
-- those from `coaching_checkin_requests.status` and `coaching_plans.status`
-- exactly as before.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),

  -- Who this is for. Resolved from canonical state at the moment of the event,
  -- never inferred later from rank or from who happens to be in a thread.
  user_id varchar not null references users(id) on delete cascade,

  -- The semantic identity. `title`/`body` are copy and may be reworded; this is
  -- what code matches on, so rewriting a sentence can never change behaviour.
  type text not null,

  -- The human who did it, where there is one. Null for anything the system did.
  actor_user_id varchar references users(id) on delete set null,

  -- What it happened to, so a tap can go somewhere and re-fetch under current
  -- authorization. Deliberately not a URL — a stored route outlives the routing.
  resource_type text not null,
  resource_id uuid,

  -- Safe copy. No message text, no check-in answers, no terrain values, no
  -- habit targets, no attachment names. This row has to stay safe enough to put
  -- on a lock screen, because one day it will be.
  title text not null,
  body text,

  -- Idempotency, enforced by the database rather than by a handler remembering.
  --
  -- Built from ids that already exist and do not change on retry — never a
  -- timestamp, never a fresh uuid, never the rendered sentence. A retried
  -- request hits the unique index below and does nothing, which is the whole
  -- mechanism.
  --
  --   coaching.message:<message_id>:<recipient_id>
  --   coaching.checkin_requested:<request_id>:<member_id>
  --   coaching.checkin_completed:<request_id>:<coach_id>
  --   coaching.plan_activated:<plan_id>:<member_id>
  dedupe_key text not null,

  created_at timestamptz not null default now(),
  read_at timestamptz
);

create unique index if not exists uq_notification_dedupe
  on notifications (dedupe_key);

-- The two reads that matter: the list, newest first, and the unread count.
create index if not exists idx_notifications_user
  on notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread
  on notifications (user_id)
  where read_at is null;

-- Express is the first wall; RLS on with no policies is the second. Nothing
-- reaches this table through PostgREST, by anyone.
alter table notifications enable row level security;
