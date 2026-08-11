-- Re-read every connected device's history once, so the sleep fix reaches
-- data that was already written.
--
-- Until now both native readers summed the duration of every sleep sample
-- HealthKit and Health Connect returned. Those platforms hand back each
-- writing source separately, so a member with a watch and a sleep app had
-- every minute counted twice, and a member with a ring as well had it counted
-- three times. One normal night was landing in the database as 16h31m, and
-- another as 19h. The readers now union the intervals instead of adding them.
--
-- That fixes what gets written from here on and does nothing about what is
-- already stored, because a sync only re-reads a trailing week. The client
-- decides how far back to read from `synced_through`: when it is null it does
-- a full initial backfill instead. So clearing it asks every phone to re-read
-- its whole history on the next sync, and the unique index on
-- (user, date, metric) turns that into an update of the wrong rows.
--
-- Deliberately not a DELETE of the bad rows. The upsert corrects every day the
-- device can still account for, and dropping the rows first would mean a
-- member whose sync never completes ends up with less than they started with.
-- Self-healing beats clean.

UPDATE health_connections
SET synced_through = NULL,
    updated_at = now()
WHERE revoked_at IS NULL;
