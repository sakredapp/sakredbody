-- ═══════════════════════════════════════════════════════════════════════════
-- Indexes on foreign keys that had none
--
-- Postgres indexes the *referenced* side of a foreign key automatically — it
-- has to, since that side is a primary key or unique. It does not index the
-- *referencing* side, and nothing warns you.
--
-- The cost shows up on delete. Removing one row from a parent table makes
-- Postgres prove no child still points at it, and with no index that proof is
-- a sequential scan of the entire child table, per row deleted, while holding
-- a lock. Eleven foreign keys here were in that state — found by asking the
-- live catalogue which `pg_constraint` entries of type 'f' had no index whose
-- leading column matched, not by reading the schema files.
--
-- Two of them are the ones that will actually bite:
--
--   users.membership_tier   — deleting or renaming a tier scans every user
--   habits.routine_habit_id — this is the habit-identity link added to
--                             survive a template rename, so it is followed
--                             on every template edit
--
-- The rest are small today and will not stay small.
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists idx_ebook_entitlements_ebook       on public.ebook_entitlements (ebook_id);
create index if not exists idx_ebook_progress_ebook           on public.ebook_progress (ebook_id);
create index if not exists idx_ebook_progress_section         on public.ebook_progress (section_id);
create index if not exists idx_frequencies_centre             on public.frequencies (centre_id);
create index if not exists idx_habits_routine_habit           on public.habits (routine_habit_id);
create index if not exists idx_session_hosts_host             on public.session_hosts (host_id);
create index if not exists idx_user_centre_readings_centre    on public.user_centre_readings (centre_id);
create index if not exists idx_user_removed_habits_rh         on public.user_removed_habits (routine_habit_id);
create index if not exists idx_user_removed_habits_ur         on public.user_removed_habits (user_routine_id);
create index if not exists idx_user_shop_checkoffs_product    on public.user_shop_checkoffs (product_id);
create index if not exists idx_users_membership_tier          on public.users (membership_tier);
