-- Coaching attachments — private objects, authorized retrieval.
--
-- ── What this replaces ──────────────────────────────────────────────────────
--
-- `coaching_messages.image_url` held a permanent Supabase *public* URL, minted
-- by `getPublicUrl` on a bucket created with `public: true`. Anyone who came
-- into possession of the link — forwarded, pasted, logged, in a screenshot of a
-- screen — could retrieve a member's progress photo or lab result forever, with
-- no session and no authorization. The secrecy of the URL was the only control.
--
-- Production has zero coaching attachments today, so this is a change made
-- before there is anything to lose rather than a cleanup after.
--
-- ── Why a table and not a second URL column ─────────────────────────────────
--
-- The database should identify the object; it should not hold a way to reach
-- it. A signed URL expires, so persisting one makes the row wrong on a timer,
-- and persisting an unsigned one is the problem we are leaving. So: bucket and
-- path, and a URL minted per request after access has been checked.
--
-- It is a table rather than more columns because the feature already accepts
-- images, PDF, Word and text, and "the attachment" was already a lie — a
-- `bloodwork.pdf` was being stored in `image_url` with `message_type = 'photo'`.
-- One message may eventually carry several files, and a shape that makes that
-- impossible would have to be undone.

begin;

create table if not exists coaching_attachments (
  id uuid primary key default gen_random_uuid(),

  /**
   * The message this belongs to, once there is one.
   *
   * Null while staged. An upload has to be authorized, stored and shown to the
   * sender *before* they press send — otherwise the preview is a lie about
   * something that has not happened. So the row exists first and is claimed by
   * the message afterwards.
   */
  message_id uuid references coaching_messages(id) on delete cascade,

  /**
   * Whose conversation this is — always the member, never the coach.
   *
   * Denormalized deliberately. Retrieval has to answer "may you see this"
   * before the attachment is attached to anything, and a staged row has no
   * message to join through. Carrying the subject means authorization is one
   * indexed read and never depends on the link existing.
   */
  user_id varchar not null references users(id),

  /** Which human put it there. Not the same as whose conversation it is. */
  uploaded_by_user_id varchar not null references users(id),

  /** Named rather than assumed, so moving buckets later is not a guess. */
  storage_bucket text not null,
  storage_path text not null,

  mime_type text not null,
  original_filename text not null,
  size_bytes integer not null check (size_bytes >= 0),

  created_at timestamptz not null default now()
);

-- One row per object. A duplicate path would mean two rows disagreeing about
-- who may read one file, and the answer would depend on which was read first.
create unique index if not exists uq_coaching_attachment_object
  on coaching_attachments (storage_bucket, storage_path);

create index if not exists idx_coaching_attachment_message
  on coaching_attachments (message_id);

-- Authorization reads by subject, so that is the index that matters.
create index if not exists idx_coaching_attachment_user
  on coaching_attachments (user_id, created_at desc);

/**
 * Staged uploads, for the sweep.
 *
 * A member who picks a file and then closes the app leaves an object nobody
 * will ever reference. Partial, because the overwhelming majority of rows are
 * claimed within seconds and indexing them all to find the few that were not
 * is the wrong shape.
 */
create index if not exists idx_coaching_attachment_staged
  on coaching_attachments (created_at)
  where message_id is null;

/**
 * RLS on, with no policy that grants anything.
 *
 * The app connects as `service_role` and bypasses this by design — Express is
 * what protects the row. This is the second wall: a leaked anon or publishable
 * key reaches nothing here. RLS-on-with-zero-policies is deny-all, which is the
 * intended state and not the failure that looks like success.
 */
alter table coaching_attachments enable row level security;

commit;
