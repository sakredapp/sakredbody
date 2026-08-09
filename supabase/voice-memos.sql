-- ═══════════════════════════════════════════════════════════════════════════
-- Voice memos in the community
--
-- A message can carry a recording as well as (or instead of) text.
--
-- `audio_mime` is stored rather than inferred from the URL, and that is the
-- load-bearing decision here. Browsers do not agree on what MediaRecorder
-- produces: iOS Safari makes audio/mp4, Android Chrome makes audio/webm, and
-- **iOS cannot play webm at all**. Knowing the real type is what lets the
-- player say so honestly instead of rendering a control that produces silence.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.community_messages
  add column if not exists audio_url text,
  add column if not exists audio_mime text,
  add column if not exists audio_duration_seconds integer;

-- A memo has to be short enough to listen to. Ten minutes is already long for
-- something somebody speaks into a phone in a community thread.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_messages_audio_len_chk') then
    alter table public.community_messages
      add constraint community_messages_audio_len_chk
      check (audio_duration_seconds is null or (audio_duration_seconds > 0 and audio_duration_seconds <= 600));
  end if;
end $$;

comment on column public.community_messages.audio_mime is
  'The real container/codec as recorded. Stored, never inferred: iOS records mp4 and Android records webm, and iOS cannot play webm — the player needs the truth to say so rather than fail silently.';

-- The existing body-length rule assumed every message had text. A voice memo
-- with no words is a legitimate message, so the rule becomes "say something,
-- in one medium or the other".
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'community_messages_body_chk') then
    alter table public.community_messages drop constraint community_messages_body_chk;
  end if;

  alter table public.community_messages
    add constraint community_messages_has_content_chk
    check (
      deleted_at is not null
      or coalesce(length(btrim(body)), 0) > 0
      or audio_url is not null
    );
end $$;
