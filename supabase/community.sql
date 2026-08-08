-- ═══════════════════════════════════════════════════════════════════════════
-- Membership tiers and community
--
-- Run once in the Supabase SQL editor (project ref zcvanbozvtojmnyuzsjh).
-- Safe to re-run. Mirrors shared/models/community.ts.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tiers ──────────────────────────────────────────────────────────────
-- A tier is a rank, not a set of flags. Every gate is "rank >= N", so adding a
-- tier between two existing ones is a row rather than a migration across every
-- check in the codebase. Ranks are spaced by 10 to leave room.

CREATE TABLE IF NOT EXISTS membership_tiers (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  rank        integer NOT NULL DEFAULT 0,
  description text,
  price_cents integer,
  price_note  text,
  includes    text[] DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_tiers_rank ON membership_tiers (rank);

INSERT INTO membership_tiers (id, name, rank, sort_order, description) VALUES
  ('free',      'Guest',            0,  1, 'The app, and nothing that requires a coach.'),
  ('member',    'Member',          10,  2, 'Protocols, the library, the apothecary, the general room.'),
  ('inner',     'Inner Circle',    20,  3, 'Direct coaching, the private rooms, priority on retreats.'),
  ('executive', 'Sakred Executive',30,  4, 'Everything, and a coach who knows your name.')
ON CONFLICT (id) DO NOTHING;

-- users.membership_tier already exists as a plain varchar defaulting to 'free'.
-- Point it at the table so a typo can't create a phantom tier that silently
-- fails every rank comparison.
UPDATE users SET membership_tier = 'free'
WHERE membership_tier IS NULL
   OR membership_tier NOT IN (SELECT id FROM membership_tiers);

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_membership_tier_fkey
    FOREIGN KEY (membership_tier) REFERENCES membership_tiers(id) ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Channels ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  description   text,
  min_tier_rank integer NOT NULL DEFAULT 0,
  cohort_id     uuid REFERENCES cohorts(id) ON DELETE CASCADE,
  is_read_only  boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_tier   ON channels (min_tier_rank);
CREATE INDEX IF NOT EXISTS idx_channels_cohort ON channels (cohort_id);

INSERT INTO channels (slug, name, description, min_tier_rank, sort_order) VALUES
  ('general', 'The Room',  'Everyone who is in.',                       10, 1),
  ('inner',   'Inner',     'Fewer people, longer conversations.',       20, 2),
  ('protocols','Protocols','What is working, what is not.',             10, 3)
ON CONFLICT (slug) DO NOTHING;

-- ─── 3. Messages ───────────────────────────────────────────────────────────
-- One table for messages and threads. parent_id null means top-level; a reply
-- can itself have replies, so a thread nests as far as the conversation goes.
-- root_id is denormalised to the top-level ancestor because the read pattern
-- is always "give me this whole thread" — a recursive walk per view would be
-- the wrong shape.

CREATE TABLE IF NOT EXISTS community_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id     varchar NOT NULL,
  parent_id   uuid REFERENCES community_messages(id) ON DELETE CASCADE,
  root_id     uuid,
  depth       integer NOT NULL DEFAULT 0,
  body        text NOT NULL,
  deleted_at  timestamp,
  edited_at   timestamp,
  reply_count integer NOT NULL DEFAULT 0,
  created_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_channel ON community_messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_root    ON community_messages (root_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_parent  ON community_messages (parent_id);
CREATE INDEX IF NOT EXISTS idx_community_user    ON community_messages (user_id);

-- Top-level messages only, newest first — the channel view's hot path.
CREATE INDEX IF NOT EXISTS idx_community_toplevel
  ON community_messages (channel_id, created_at DESC)
  WHERE parent_id IS NULL;

-- ─── 4. Search ─────────────────────────────────────────────────────────────
-- A generated tsvector column plus a GIN index. Generated rather than
-- trigger-maintained so it cannot drift from the body it indexes.

ALTER TABLE community_messages
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_community_search
  ON community_messages USING GIN (search_vector);

-- ─── 5. Reactions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  user_id    varchar NOT NULL,
  emoji      text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions (message_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reactions ON message_reactions (message_id, user_id, emoji);

-- ─── 6. Reply counts ───────────────────────────────────────────────────────
-- Maintained by trigger rather than counted per read. A thread list showing
-- fifty messages would otherwise be fifty counts.

CREATE OR REPLACE FUNCTION bump_reply_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE community_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE community_messages SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_reply_count ON community_messages;
CREATE TRIGGER trg_reply_count
  AFTER INSERT OR DELETE ON community_messages
  FOR EACH ROW EXECUTE FUNCTION bump_reply_count();

-- ─── Row level security ────────────────────────────────────────────────────
-- The gate is tier rank. Expressed once here as a helper so the policies and
-- the Express handlers can't drift apart on who is allowed where.

CREATE OR REPLACE FUNCTION public.member_tier_rank(p_user_id text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(t.rank, 0)
  FROM users u
  LEFT JOIN membership_tiers t ON t.id = u.membership_tier
  WHERE u.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.can_see_channel(p_user_id text, p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = p_channel_id
      AND c.is_active
      AND public.member_tier_rank(p_user_id) >= c.min_tier_rank
      -- A cohort room is for that cohort's confirmed members, whatever their tier.
      AND (
        c.cohort_id IS NULL
        OR EXISTS (
          SELECT 1 FROM cohort_members m
          WHERE m.cohort_id = c.cohort_id
            AND m.user_id = p_user_id
            AND m.status = 'confirmed'
        )
      )
  );
$$;

ALTER TABLE membership_tiers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS membership_tiers_select ON membership_tiers;
CREATE POLICY membership_tiers_select ON membership_tiers FOR SELECT USING (true);

DROP POLICY IF EXISTS membership_tiers_write ON membership_tiers;
CREATE POLICY membership_tiers_write ON membership_tiers
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

DROP POLICY IF EXISTS channels_select ON channels;
CREATE POLICY channels_select ON channels
  FOR SELECT USING (public.can_see_channel(auth.uid()::text, id) OR public.is_sakred_admin());

DROP POLICY IF EXISTS channels_write ON channels;
CREATE POLICY channels_write ON channels
  FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin());

DROP POLICY IF EXISTS community_messages_select ON community_messages;
CREATE POLICY community_messages_select ON community_messages
  FOR SELECT USING (public.can_see_channel(auth.uid()::text, channel_id) OR public.is_sakred_admin());

-- You may write into a room you can see, as yourself, if it isn't read-only.
DROP POLICY IF EXISTS community_messages_insert ON community_messages;
CREATE POLICY community_messages_insert ON community_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()::text
    AND public.can_see_channel(auth.uid()::text, channel_id)
    AND NOT EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_id AND c.is_read_only)
  );

DROP POLICY IF EXISTS community_messages_own ON community_messages;
CREATE POLICY community_messages_own ON community_messages
  FOR UPDATE USING (user_id = auth.uid()::text OR public.is_sakred_admin());

DROP POLICY IF EXISTS community_messages_admin ON community_messages;
CREATE POLICY community_messages_admin ON community_messages
  FOR DELETE USING (public.is_sakred_admin());

DROP POLICY IF EXISTS message_reactions_own ON message_reactions;
CREATE POLICY message_reactions_own ON message_reactions
  FOR ALL USING (user_id = auth.uid()::text OR public.is_sakred_admin())
  WITH CHECK (user_id = auth.uid()::text);

-- Verify:
--   SELECT id, name, rank FROM membership_tiers ORDER BY rank;
--   SELECT slug, min_tier_rank FROM channels ORDER BY sort_order;
