/**
 * The security boundary, said in the repository so it can be checked.
 *
 * ── What went wrong that this exists for ─────────────────────────────────
 *
 * Every summary of this schema said "104 tables, RLS everywhere". Four of them
 * had row security switched off, and a fifth carried three unconditional
 * policies. As `anon` — the role behind the project's public REST endpoint —
 * a member's imported health history, the record of who coaches whom, and the
 * coaching thread itself were all readable. One of them was writable.
 *
 * None of that was visible from the application, because the application
 * connects as the owner and owners bypass row security. It was not visible
 * from the policy file either, which declared something the database did not
 * hold.
 *
 * So there are two checks, in two places, and both are needed:
 *
 *   here            the repository's own account of the boundary is coherent
 *   qa-rls.ts       the database agrees, asked as `anon` and `authenticated`
 *
 * This half runs with no database, in `npm test`, so a change that quietly
 * broadens the boundary fails before it reaches one.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PUBLICLY_READABLE, PUBLIC_ROLES, SERVER_ONLY_TABLES } from "./rlsPosture.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

/** A file with its prose removed, so a comment cannot satisfy a grep for the
    rule it explains. Same trick as test-media-privacy.ts. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

console.log("\nThe boundary is one the repository can describe\n");

// ─── 1. There is no client that would need a policy ───────────────────────

/*
  The whole posture rests on this. If a browser ever talks to Supabase
  directly, twenty-six deny-all tables stop being a decision and become an
  outage — and the fix is real owner-scoped policies, not deleting this test.
*/
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const clientFiles = walk("client/src");
const withSdk = clientFiles.filter((f) => /@supabase\/supabase-js/.test(code(f)));
check(
  "nothing in the client talks to Supabase directly",
  withSdk.length === 0,
  withSdk.join(", "),
);

const serverSdk = ["server/media/store.ts", "server/supabaseStorage.ts", "server/coaching/attachmentStore.ts"]
  .filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(code(f)));
check(
  "and the server's own use of it is service-role, for storage",
  serverSdk.length === 3,
  `${serverSdk.length} of 3`,
);

// ─── 2. The list is a list, not a pile ────────────────────────────────────

const declared = [...SERVER_ONLY_TABLES];
check("no table is named twice", new Set(declared).size === declared.length);

/* Every name has to be a table this product actually declares. A typo here is
   a table that silently stops being checked. */
const schema = readdirSync("shared/models")
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(join("shared/models", f), "utf8"))
  .join("\n");
const unknown = declared.filter((t) => !new RegExp(`pgTable\\(\\s*"${t}"`).test(schema));
check("every declared table exists in the schema", unknown.length === 0, unknown.join(", "));

const overlap = declared.filter((t) => PUBLICLY_READABLE.some((p) => p.table === t));
check("nothing is both server-only and publicly readable", overlap.length === 0, overlap.join(", "));

check(
  "every exception says which roles and why",
  PUBLICLY_READABLE.every(
    (p) => p.roles.length > 0 && p.roles.every((r) => (PUBLIC_ROLES as readonly string[]).includes(r)) && p.why.length > 20,
  ),
);
check("and there are few enough of them to read", PUBLICLY_READABLE.length <= 3, String(PUBLICLY_READABLE.length));

// ─── 3. The migration does what the list claims ───────────────────────────

const posture = readFileSync("supabase/2026-08-28-rls-posture.sql", "utf8");
for (const table of ["coach_relationships", "health_connections", "health_days", "health_workouts"]) {
  check(
    `${table} has row security switched on`,
    new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`).test(posture),
  );
}
check(
  "the unconditional coaching-message policies are dropped",
  ["select", "insert", "update", "admin_select", "admin_insert", "admin_update"].every((p) =>
    posture.includes(`DROP POLICY IF EXISTS sakred_coaching_msgs_${p}`),
  ),
);
check(
  "the migration refuses to leave any table unprotected",
  /row security is off on: %/.test(posture),
);
check(
  "and checks by becoming anon rather than by reading the catalogue",
  /SET LOCAL ROLE anon/.test(posture) && /anon can still read/.test(posture),
);

/* And the file that declares policies must not recreate what was dropped. */
const declaredPolicies = readFileSync("supabase/rls-policies.sql", "utf8");
check(
  "the policy file no longer declares a coaching-message policy",
  !/CREATE POLICY sakred_coaching_msgs/.test(declaredPolicies),
);
check(
  "and points at where the posture is written down",
  declaredPolicies.includes("script/rlsPosture.ts"),
);

if (failures.length) {
  console.error("✗ RLS posture\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} RLS posture assertions (${SERVER_ONLY_TABLES.length} tables server-only by decision)\n`);
