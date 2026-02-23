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

const pool = new Pool({
  connectionString: env.SAKREDBODY_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool
  .query("SELECT id, email, first_name, last_name, is_admin FROM users ORDER BY created_at")
  .then((r) => {
    console.log("Users in database:");
    console.table(r.rows);
    pool.end();
  })
  .catch((e) => {
    console.error("Error:", e.message);
    pool.end();
  });
