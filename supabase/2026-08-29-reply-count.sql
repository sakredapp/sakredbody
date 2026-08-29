-- The reply count was maintained twice, so it was wrong.
--
-- ── What was on screen ────────────────────────────────────────────────────
--
-- A message with one reply said "2 replies". A root with a reply and a reply
-- to that reply said 3. Measured through the real endpoints against QA, not
-- reasoned about:
--
--   root  reply_count = 3   (one direct reply and one grandchild)
--   kid   reply_count = 2   (one direct reply)
--
-- ── Why ───────────────────────────────────────────────────────────────────
--
-- Two writers for one number. `trg_reply_count` increments the direct parent
-- on INSERT; the post handler in server/community/routes.ts walks the whole
-- parent chain and increments every ancestor. The direct parent is in both,
-- so it gets two.
--
-- The trigger is the one that goes. It is wrong twice over: it counts only the
-- direct parent, where the product wants every ancestor's number ("a collapsed
-- reply reads its own"), and its other half fires on DELETE — which this
-- application never does. Messages are tombstoned with an UPDATE, so the
-- trigger has never taken a single reply back off a count in its life. That is
-- the other half of why a deleted message stayed on screen forever: the
-- tombstone is kept while something hangs off it, and nothing ever stopped
-- hanging off it.
--
-- After this the rule lives in one place, the way the visibility rule does:
-- the handler walks the ancestors up on a reply, and `forgetReply` walks them
-- back down on a delete.
--
-- ── The repair ────────────────────────────────────────────────────────────
--
-- Every existing count is recomputed from the rows rather than adjusted, since
-- there is no way to know how much any individual number drifted. The number
-- becomes what a member is told it is: how many replies are still there.
-- Deleted ones do not count, which is also what makes a childless tombstone
-- disappear on the next read.


-- NOTE ON TRANSACTIONS
--
-- This file deliberately does not open one. It used to begin with BEGIN; and
-- end the schema changes with COMMIT;, and that COMMIT closed the transaction
-- the caller had opened around the whole file — so the verification block
-- below ran outside it. Proved against QA rather than reasoned about: a file
-- shaped that way, whose verification raises, reports "rolled back" while its
-- table is still there afterwards.
--
-- The caller wraps the file. script/qa-migrate.ts does, and the Management API
-- runs a file whole. Leave the transaction to whoever is applying this, so
-- that a verification that objects takes the changes down with it.

DROP TRIGGER IF EXISTS trg_reply_count ON community_messages;
DROP FUNCTION IF EXISTS bump_reply_count();

-- Every (ancestor, descendant) pair, then the live descendants per ancestor.
-- Recursion is bounded by MAX_THREAD_DEPTH, which is eight.
WITH RECURSIVE chain(top, id) AS (
  SELECT id, id FROM community_messages
  UNION ALL
  SELECT c.top, m.id
    FROM community_messages m
    JOIN chain c ON m.parent_id = c.id
),
live AS (
  SELECT c.top AS id,
         count(*) FILTER (WHERE c.id <> c.top AND d.deleted_at IS NULL) AS n
    FROM chain c
    JOIN community_messages d ON d.id = c.id
   GROUP BY c.top
)
UPDATE community_messages m
   SET reply_count = live.n
  FROM live
 WHERE live.id = m.id
   AND m.reply_count IS DISTINCT FROM live.n;


-- ── Verify, rather than trust the success above ───────────────────────────

DO $$
DECLARE
  trigger_left  int;
  function_left int;
  wrong         int;
  stranded      int;
BEGIN
  SELECT count(*) INTO trigger_left
    FROM pg_trigger WHERE tgname = 'trg_reply_count' AND NOT tgisinternal;
  IF trigger_left > 0 THEN
    RAISE EXCEPTION 'trg_reply_count is still on community_messages — the count would still be maintained twice';
  END IF;

  SELECT count(*) INTO function_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bump_reply_count';
  IF function_left > 0 THEN
    RAISE EXCEPTION 'bump_reply_count() is still defined';
  END IF;

  -- Every count now equals the live descendants underneath it.
  WITH RECURSIVE chain(top, id) AS (
    SELECT id, id FROM community_messages
    UNION ALL
    SELECT c.top, m.id
      FROM community_messages m
      JOIN chain c ON m.parent_id = c.id
  ),
  live AS (
    SELECT c.top AS id,
           count(*) FILTER (WHERE c.id <> c.top AND d.deleted_at IS NULL) AS n
      FROM chain c
      JOIN community_messages d ON d.id = c.id
     GROUP BY c.top
  )
  SELECT count(*) INTO wrong
    FROM community_messages m
    JOIN live ON live.id = m.id
   WHERE m.reply_count <> live.n;
  IF wrong > 0 THEN
    RAISE EXCEPTION '% message(s) still carry a reply count that does not match their replies', wrong;
  END IF;

  -- What the member sees change: tombstones holding nothing up, which the
  -- next read now drops.
  SELECT count(*) INTO stranded
    FROM community_messages
   WHERE deleted_at IS NOT NULL AND reply_count = 0;

  RAISE NOTICE 'reply counts repaired; % deleted message(s) hold nothing up and will stop being drawn', stranded;
END $$;
