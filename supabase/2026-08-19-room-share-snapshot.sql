-- ═══════════════════════════════════════════════════════════════════════════
--  What a member published to the Room stops being a live query.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `community_messages.shared_session_id` pointed at the member's real
--  session and the card was rebuilt from `workout_sets` on every read. The
--  intent was that correcting a set corrects the post. The effect was that
--  editing a private training log silently rewrote a public conversation:
--  the replies stay, the post they replied to becomes about a different lift,
--  and nobody is told.
--
--  So publishing now takes a copy. The session id stays as provenance — which
--  training this was, and how ownership is checked — and `shared_workout`
--  holds what was actually said.
--
--  Deliberately not a table. It is one document per message, read only with
--  its message, never queried across, and never updated. A jsonb column is
--  exactly that; three normalised tables would be a join per feed page in
--  exchange for a shape nothing needs.
--
--  Written once at publish time by server/community/sharedWorkout.ts, which
--  is the only thing allowed to build one, and parsed back through
--  `sharedWorkoutSchema` on the way out — a jsonb column has no shape at rest.

-- ─── 1. THE COLUMN ────────────────────────────────────────────────────────

ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS shared_workout jsonb;

COMMENT ON COLUMN community_messages.shared_workout IS
  'Immutable presentation of a shared workout, taken at publish time. Never '
  'contains session notes, per-set notes, RPE, failure flags, health values, '
  'Terrain reasons or Training Memory. shared_session_id is provenance only.';

-- ─── 2. NOTHING TO BACK-FILL, AND SAYING SO OUT LOUD ──────────────────────
--
--  Shares landed with 2026-08-18-member-media.sql and no member has posted
--  one: production does not have the column yet, and QA has three community
--  messages, none of them shares. So there is no historical card to
--  reconstruct.
--
--  That is an assumption about a database, made from a laptop, and the whole
--  point of this file being transactional is that a wrong one costs nothing.
--  If a share does exist, this refuses the migration rather than quietly
--  leaving a post that used to render a workout and now renders none.

DO $$
DECLARE orphaned int;
BEGIN
  SELECT count(*) INTO orphaned
  FROM community_messages
  WHERE shared_session_id IS NOT NULL AND shared_workout IS NULL;

  IF orphaned > 0 THEN
    RAISE EXCEPTION
      'ROLLED BACK: % message(s) share a workout but have no published snapshot. '
      'Back-fill them before applying this — see server/community/sharedWorkout.ts.',
      orphaned;
  END IF;
END $$;

-- ─── 3. A SHARE SURVIVES ITS SESSION ──────────────────────────────────────
--
--  The content CHECK counted `shared_session_id IS NOT NULL` as content. The
--  session FK is ON DELETE SET NULL, so deleting a workout runs an UPDATE
--  that nulls it — and for a workout-only post with no caption, that UPDATE
--  fails the CHECK and takes the delete down with it. A member could not
--  delete a workout they had shared without a caption.
--
--  Adding the snapshot to the constraint fixes that as a side effect of being
--  true: the post still has content, because the content was never the
--  reference. Deleting the workout now leaves the post exactly as published.
--  Removing the post is how a post is removed.

ALTER TABLE community_messages DROP CONSTRAINT IF EXISTS community_messages_has_content_chk;
ALTER TABLE community_messages ADD CONSTRAINT community_messages_has_content_chk
  CHECK (
    deleted_at IS NOT NULL
    OR COALESCE(length(btrim(body)), 0) > 0
    OR audio_url IS NOT NULL
    OR image_asset_id IS NOT NULL
    OR shared_session_id IS NOT NULL
    OR shared_workout IS NOT NULL
  );

-- ─── 4. NO INDEX ──────────────────────────────────────────────────────────
--
--  Stated rather than forgotten: nothing looks a message up by its snapshot,
--  and nothing filters on one. The column is read by primary key with the row
--  it belongs to. An index here would be size and write cost for a query
--  nobody makes.
