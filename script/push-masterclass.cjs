const { Pool } = require("pg");
const { readFileSync } = require("fs");
const { resolve } = require("path");

// Load .env manually
const envPath = resolve(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = `
CREATE TABLE IF NOT EXISTS masterclass_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_image_url TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS masterclass_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  video_url TEXT NOT NULL,
  duration TEXT,
  instructor TEXT,
  tags TEXT[],
  search_keywords TEXT[],
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_category_subs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  category_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mc_videos_category ON masterclass_videos(category_id);
CREATE INDEX IF NOT EXISTS idx_mc_videos_featured ON masterclass_videos(is_featured);
CREATE INDEX IF NOT EXISTS idx_ucs_user ON user_category_subs(user_id);
CREATE INDEX IF NOT EXISTS idx_ucs_category ON user_category_subs(category_id);
CREATE INDEX IF NOT EXISTS idx_ucs_user_category ON user_category_subs(user_id, category_id);

ALTER TABLE masterclass_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE masterclass_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_category_subs ENABLE ROW LEVEL SECURITY;
`;

// RLS policies (separate because CREATE POLICY has no IF NOT EXISTS)
const rlsSql = `
DO $$ BEGIN
  -- Drop existing masterclass policies for idempotent re-run
  DROP POLICY IF EXISTS sakred_mc_categories_select ON masterclass_categories;
  DROP POLICY IF EXISTS sakred_mc_videos_select ON masterclass_videos;
  DROP POLICY IF EXISTS sakred_ucs_select ON user_category_subs;
  DROP POLICY IF EXISTS sakred_ucs_insert ON user_category_subs;
  DROP POLICY IF EXISTS sakred_ucs_delete ON user_category_subs;
  DROP POLICY IF EXISTS sakred_mc_categories_insert ON masterclass_categories;
  DROP POLICY IF EXISTS sakred_mc_categories_update ON masterclass_categories;
  DROP POLICY IF EXISTS sakred_mc_categories_delete ON masterclass_categories;
  DROP POLICY IF EXISTS sakred_mc_videos_insert ON masterclass_videos;
  DROP POLICY IF EXISTS sakred_mc_videos_update ON masterclass_videos;
  DROP POLICY IF EXISTS sakred_mc_videos_delete ON masterclass_videos;
END $$;

CREATE POLICY sakred_mc_categories_select ON masterclass_categories
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY sakred_mc_videos_select ON masterclass_videos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY sakred_ucs_select ON user_category_subs
  FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY sakred_ucs_insert ON user_category_subs
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY sakred_ucs_delete ON user_category_subs
  FOR DELETE USING (auth.uid()::text = user_id);

CREATE POLICY sakred_mc_categories_insert ON masterclass_categories
  FOR INSERT WITH CHECK (public.is_sakred_admin());
CREATE POLICY sakred_mc_categories_update ON masterclass_categories
  FOR UPDATE USING (public.is_sakred_admin());
CREATE POLICY sakred_mc_categories_delete ON masterclass_categories
  FOR DELETE USING (public.is_sakred_admin());

CREATE POLICY sakred_mc_videos_insert ON masterclass_videos
  FOR INSERT WITH CHECK (public.is_sakred_admin());
CREATE POLICY sakred_mc_videos_update ON masterclass_videos
  FOR UPDATE USING (public.is_sakred_admin());
CREATE POLICY sakred_mc_videos_delete ON masterclass_videos
  FOR DELETE USING (public.is_sakred_admin());
`;

pool.query(sql).then(() => {
  console.log("✅ Tables + indexes created");
  return pool.query(rlsSql);
}).then(() => {
  console.log("✅ RLS policies applied");
  pool.end();
}).catch((e) => {
  console.error("❌ Error:", e.message);
  pool.end();
  process.exit(1);
});
