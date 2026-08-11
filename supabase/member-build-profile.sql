-- ═══════════════════════════════════════════════════════════════════════════
-- What kinds of movement are part of your life
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One answer, once, so that six hundred and fifty-seven movements can present
-- themselves as six. It narrows what Build shows by default and nothing else:
-- search still spans the whole catalogue and every group chip is still there,
-- because the failure mode of a preference like this is a member unable to
-- find a movement they know exists.
--
-- Its own table rather than a column on `users` — this is the first row of
-- what will become a Build profile: goals, equipment, limitations, the things
-- a recommendation would actually need.
--
-- NULL means the question has not been answered. An empty array means it was
-- answered with nothing, which is a different fact and is why the column is
-- nullable rather than defaulted.

CREATE TABLE IF NOT EXISTS member_build_profile (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar NOT NULL,
  modalities  text[],
  updated_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_build_profile
  ON member_build_profile (user_id);

-- RLS on with a policy, not on with none. The API holds the service role and
-- scopes every read by session user; the policy exists so that a table with
-- RLS enabled is not silently unreadable by anything else that ever needs it.
ALTER TABLE member_build_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_build_profile_service ON member_build_profile;
CREATE POLICY member_build_profile_service ON member_build_profile
  FOR ALL TO service_role USING (true) WITH CHECK (true);
