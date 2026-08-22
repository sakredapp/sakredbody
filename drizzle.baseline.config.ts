/**
 * Emitting the schema as SQL, from the schema files, with no database.
 *
 * `drizzle-kit push` is how the repo lost the ability to rebuild itself: it
 * diffs against a live database and applies, so the truth ends up in
 * production and the history nowhere. `generate` is the opposite — it reads
 * the schema and writes the SQL — which can be committed, reviewed and
 * replayed into an empty Postgres.
 *
 * It reads `.baseline-src`, a throwaway copy of `shared/` with the NodeNext
 * `.js` specifiers stripped, because drizzle-kit's CJS loader cannot resolve
 * them. `script/baseline.ts` makes that copy; nothing else should touch it.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./.baseline-out",
  schema: "./.baseline-src/shared/schema.ts",
  dialect: "postgresql",
});
