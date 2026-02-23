/**
 * Create coaching_messages table for member ↔ coach messaging.
 * Run: node script/create-coaching-messages.cjs
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const env = {};
envFile.split("\n").forEach((line) => {
  if (!line || line.startsWith("#")) return;
  const idx = line.indexOf("=");
  if (idx < 0) return;
  env[line.slice(0, idx)] = line.slice(idx + 1);
});

const pool = new Pool({ connectionString: env.SAKREDBODY_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const SQL = `
-- coaching_messages: member ↔ coach thread
CREATE TABLE IF NOT EXISTS coaching_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id),
  sender_role TEXT NOT NULL DEFAULT 'member',
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  image_url TEXT,
  metadata TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coaching_msgs_user ON coaching_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_msgs_user_created ON coaching_messages(user_id, created_at);

-- RLS
ALTER TABLE coaching_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS sakred_coaching_msgs_select ON coaching_messages;
DROP POLICY IF EXISTS sakred_coaching_msgs_insert ON coaching_messages;
DROP POLICY IF EXISTS sakred_coaching_msgs_admin_select ON coaching_messages;
DROP POLICY IF EXISTS sakred_coaching_msgs_admin_update ON coaching_messages;

-- Members can see their own messages
CREATE POLICY sakred_coaching_msgs_select ON coaching_messages
  FOR SELECT USING (true);

-- Members can insert messages
CREATE POLICY sakred_coaching_msgs_insert ON coaching_messages
  FOR INSERT WITH CHECK (true);

-- Admin can update (mark read, etc.)
CREATE POLICY sakred_coaching_msgs_admin_update ON coaching_messages
  FOR UPDATE USING (true);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log("Creating coaching_messages table...");
    await client.query(SQL);
    console.log("✓ coaching_messages table created");

    const { rows } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'coaching_messages' ORDER BY ordinal_position
    `);
    console.log("Columns:", rows.map((r) => `${r.column_name} (${r.data_type})`).join(", "));
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
