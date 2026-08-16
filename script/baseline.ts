/**
 * Rebuild `supabase/schema-baseline.sql` from the parts.
 *
 * Part 01 is regenerated from `shared/schema.ts` by drizzle-kit, which needs a
 * copy of `shared/` with the NodeNext `.js` specifiers stripped — its CJS
 * loader cannot resolve them. Parts 02–05 were introspected from production
 * and are edited by hand; regenerating them needs a database, which
 * `db:verify-from-zero` is the place for.
 *
 * Run: npm run db:baseline
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const strip = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) strip(p);
    else if (p.endsWith(".ts")) {
      writeFileSync(p, readFileSync(p, "utf8").replace(/(from\s+"\.[^"]*?)\.js"/g, '$1"'));
    }
  }
};

rmSync(join(ROOT, ".baseline-src"), { recursive: true, force: true });
mkdirSync(join(ROOT, ".baseline-src"), { recursive: true });
cpSync(join(ROOT, "shared"), join(ROOT, ".baseline-src/shared"), { recursive: true });
strip(join(ROOT, ".baseline-src/shared"));

rmSync(join(ROOT, ".baseline-out"), { recursive: true, force: true });
execFileSync("npx", ["drizzle-kit", "generate", "--config=drizzle.baseline.config.ts"], {
  cwd: ROOT,
  stdio: "inherit",
});

const generated = readdirSync(join(ROOT, ".baseline-out")).find((f) => f.endsWith(".sql"));
if (!generated) throw new Error("drizzle-kit produced no SQL");
writeFileSync(
  join(ROOT, "supabase/baseline/01-drizzle-schema.sql"),
  readFileSync(join(ROOT, ".baseline-out", generated), "utf8"),
);

const parts = readdirSync(join(ROOT, "supabase/baseline")).filter((f) => f.endsWith(".sql")).sort();
writeFileSync(
  join(ROOT, "supabase/schema-baseline.sql"),
  parts.map((f) => readFileSync(join(ROOT, "supabase/baseline", f), "utf8")).join("\n"),
);

const whole = readFileSync(join(ROOT, "supabase/schema-baseline.sql"), "utf8");
console.log(
  `supabase/schema-baseline.sql — ${whole.split("\n").length} lines, ` +
    `${(whole.match(/CREATE TABLE/g) ?? []).length} tables, ` +
    `${(whole.match(/CREATE POLICY/g) ?? []).length} policies`,
);
