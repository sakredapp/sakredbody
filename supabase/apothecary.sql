-- ═══════════════════════════════════════════════════════════════════════════
-- The Apothecary — supply layer
--
-- Run once in the Supabase SQL editor for the sakredbody project
-- (ref zcvanbozvtojmnyuzsjh). Safe to re-run: everything is idempotent.
--
-- Mirrors shared/models/shop.ts. Change one, change the other.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Products ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  brand          text,
  category       text NOT NULL,
  description    text,
  why_this_one   text,
  sourcing_notes text,
  image_url      text,
  price_cents    integer,
  price_note     text,
  terrain_tags   text[] DEFAULT '{}',
  search_keywords text[] DEFAULT '{}',
  is_featured    boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamp DEFAULT now(),
  updated_at     timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products (is_active);

-- ─── 2. Product links ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label       text NOT NULL,
  url         text NOT NULL,
  vendor      text,
  price_cents integer,
  is_primary  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_links_product ON product_links (product_id);

-- ─── 3. Habit ↔ product ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS habit_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id     uuid NOT NULL REFERENCES routine_habits(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  note         text,
  is_essential boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_habit_products_habit   ON habit_products (habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_products_product ON habit_products (product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_habit_products   ON habit_products (habit_id, product_id);

-- ─── 4. Routine ↔ product ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS routine_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id   text NOT NULL REFERENCES wellness_routines(id) ON DELETE CASCADE ON UPDATE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  phase        text NOT NULL DEFAULT 'prepare',
  note         text,
  is_essential boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_products_routine ON routine_products (routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_products_product ON routine_products (product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_routine_products   ON routine_products (routine_id, product_id);

DO $$ BEGIN
  ALTER TABLE routine_products
    ADD CONSTRAINT routine_products_phase_chk CHECK (phase IN ('prepare','clear','rebuild'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. User check-offs ────────────────────────────────────────────────────
-- Presence of the row IS the state. Un-checking is a DELETE, so there is no
-- boolean that can drift out of sync with reality.

CREATE TABLE IF NOT EXISTS user_shop_checkoffs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  checked_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_checkoffs_user ON user_shop_checkoffs (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_checkoffs ON user_shop_checkoffs (user_id, product_id);

-- ─── Row level security ────────────────────────────────────────────────────
-- The catalog is readable by anyone; only admins write it. This is deliberately
-- stricter than the macro app, where any authenticated user could write to the
-- content tables.
--
-- The app itself talks to Postgres through the Express server with a service
-- connection, so these policies guard direct PostgREST access.

ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shop_checkoffs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','product_links','habit_products','routine_products']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (public.is_sakred_admin()) WITH CHECK (public.is_sakred_admin())',
      t || '_write', t);
  END LOOP;
END $$;

-- Check-offs are private to the member who made them.
DROP POLICY IF EXISTS user_shop_checkoffs_own ON user_shop_checkoffs;
CREATE POLICY user_shop_checkoffs_own ON user_shop_checkoffs
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- Verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('products','product_links','habit_products',
--                        'routine_products','user_shop_checkoffs');
