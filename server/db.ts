import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString = process.env.SAKREDBODY_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Database URL not configured. Set SAKREDBODY_DATABASE_URL or DATABASE_URL environment variable.",
  );
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });
