-- ─── Extensions ───────────────────────────────────────────────────────────
--
-- First, because everything else is allowed to depend on them and nothing here
-- depends on anything. `pg_trgm` used to be created halfway down the functions
-- file, which worked only because nothing happened to need it earlier — the
-- same accident that hid the policies-before-functions bug for months.
--
-- Production has 37 functions in `public`; 31 of them arrive with this line.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
