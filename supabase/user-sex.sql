-- Sex on the account.
--
-- Physiology rather than birth data, so it belongs on `users` and not on
-- `user_cosmology`. Several health readings mean different things by it —
-- resting heart rate and heart-rate-variability baselines most of all — and
-- reading those without it means silently comparing a member against a
-- population that may not include them.
--
-- Nullable with no default, deliberately. Every member who signed up before
-- this column existed genuinely has not answered, and backfilling them to
-- either value would be inventing a fact about a person. Null means unanswered
-- and every reader has to handle it, which is the correct amount of friction.
--
-- Asked at intake rather than read from Apple Health. HealthKit does expose a
-- biological-sex characteristic, but reading it would mean requesting another
-- permission and showing another prompt for a single value the member can give
-- us in one tap — and it would add a read type to the entitlement for no gain.

ALTER TABLE users ADD COLUMN IF NOT EXISTS sex varchar;

-- The app validates this too. Both, because the app is the boundary that
-- returns a good error message and the constraint is the one that is still
-- true after a migration script or a console session gets it wrong.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_sex_check;
ALTER TABLE users ADD CONSTRAINT users_sex_check
  CHECK (sex IS NULL OR sex IN ('male', 'female'));

-- Relationship status, same shape and for the same reason.
--
-- The lifestyle guidance that actually helps differs when there is another
-- person in someone's week. 'private' is stored as a real value rather than
-- left null: null means never asked, 'private' means asked and declined, and
-- only the second one should stop us ever prompting again.
ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status varchar;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_relationship_status_check;
ALTER TABLE users ADD CONSTRAINT users_relationship_status_check
  CHECK (relationship_status IS NULL
         OR relationship_status IN ('single', 'dating', 'married', 'private'));
