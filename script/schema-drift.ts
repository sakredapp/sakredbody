/**
 * Does the running database have the columns the running code selects?
 *
 * ── The outage this exists because of ─────────────────────────────────────
 *
 * On 18 Aug 2026 two migrations were written, reviewed, committed and never
 * applied. Nothing said so. Six days later every login on the product returned
 * 500 — not for a bad password, but because `getUserByEmail` selects every
 * column the model declares, Postgres refuses a SELECT naming a column that
 * does not exist, and the failure happens before any password is checked. It
 * locked out all 21 accounts that tried, including the owner's.
 *
 * The gap was not in review. `verify-from-zero` already proves the repository
 * can *build* a database from its own migrations, and it passed the whole
 * time — because it builds an empty one. Nothing compared the repository to
 * the database that was actually running, so a migration that was never
 * applied looked exactly like one that shipped.
 *
 *     schema.ts says       ──?──       production has
 *
 * That question mark is this file.
 *
 *   npx tsx script/schema-drift.ts                       # $DATABASE_URL
 *   SUPABASE_PROJECT_REF=… npx tsx script/schema-drift.ts   # Management API
 *
 * Read-only. It runs one query, names what is missing, and exits non-zero.
 * It is safe against production precisely because it changes nothing there —
 * which is what makes it usable as the last step of a deploy.
 */

import * as schema from "../shared/schema.js";

type Declared = Map<string, Set<string>>;

/**
 * Every table and column the code believes in.
 *
 * Read out of the Drizzle objects rather than by parsing the source, so this
 * cannot drift from the models the way a hand-kept list would — which is the
 * exact failure it is here to catch.
 */
export function declaredSchema(mod: Record<string, unknown>): Declared {
  const out: Declared = new Map();
  for (const value of Object.values(mod)) {
    if (!value || typeof value !== "object") continue;
    const table = value as Record<string | symbol, unknown>;
    const names = Object.getOwnPropertySymbols(table).map((s) => s.toString());
    const nameSym = Object.getOwnPropertySymbols(table).find((s) =>
      s.toString().includes("Name"),
    );
    if (!names.some((n) => n.includes("drizzle:Columns")) || !nameSym) continue;

    const tableName = String(table[nameSym]);
    const columnsSym = Object.getOwnPropertySymbols(table).find((s) =>
      s.toString().includes("drizzle:Columns"),
    )!;
    const columns = table[columnsSym] as Record<string, { name: string }>;
    out.set(
      tableName,
      new Set(Object.values(columns).map((c) => c.name)),
    );
  }
  return out;
}

/** What the database actually has. */
type Actual = Map<string, Set<string>>;

const QUERY = `
  select table_name, column_name
    from information_schema.columns
   where table_schema = 'public'
`;

async function viaManagementApi(ref: string, token: string): Promise<Actual> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) throw new Error(`management api ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return collect((await res.json()) as { table_name: string; column_name: string }[]);
}

async function viaConnection(url: string): Promise<Actual> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ table_name: string; column_name: string }>(QUERY);
    return collect(rows);
  } finally {
    await client.end();
  }
}

function collect(rows: { table_name: string; column_name: string }[]): Actual {
  const out: Actual = new Map();
  for (const r of rows) {
    const set = out.get(r.table_name) ?? new Set<string>();
    set.add(r.column_name);
    out.set(r.table_name, set);
  }
  return out;
}

export type Drift = {
  missingTables: string[];
  missingColumns: { table: string; column: string }[];
};

/**
 * What the code needs and the database lacks — and deliberately not the
 * reverse.
 *
 * A column in the database that no model declares is not an outage. It is
 * usually a migration that landed ahead of the code that will read it, which
 * is the correct order to ship in. Reporting it as drift would make this noisy
 * on exactly the deploys that were done carefully, and a noisy check is one
 * people stop reading.
 */
export function compare(declared: Declared, actual: Actual): Drift {
  const missingTables: string[] = [];
  const missingColumns: { table: string; column: string }[] = [];

  for (const [table, columns] of Array.from(declared.entries())) {
    const have = actual.get(table);
    if (!have) {
      missingTables.push(table);
      continue;
    }
    for (const column of Array.from(columns)) {
      if (!have.has(column)) missingColumns.push({ table, column });
    }
  }
  return {
    missingTables: missingTables.sort(),
    missingColumns: missingColumns.sort(
      (a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column),
    ),
  };
}

// ─── Run ───────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.DATABASE_URL;

  if ((!ref || !token) && !url) {
    /*
      Skipped, and saying so in the words that matter.

      A check that quietly passes when it cannot run is what let the outage
      happen: verify-from-zero was green for the whole six days, because it
      builds an empty database rather than looking at the running one. So this
      exits 0 — most machines genuinely cannot reach production — but it never
      prints anything a reader could mistake for a result.
    */
    console.log(
      "\n  – schema drift NOT CHECKED: no SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN, no DATABASE_URL." +
        "\n    This proves nothing about the running database. Run it against production after a deploy:" +
        "\n      SUPABASE_PROJECT_REF=… npm run db:drift\n",
    );
    process.exit(0);
  }

  const actual = ref && token ? await viaManagementApi(ref, token) : await viaConnection(url!);
  const declared = declaredSchema(schema as Record<string, unknown>);
  const drift = compare(declared, actual);

  console.log(
    `\n  ${declared.size} tables declared, ${actual.size} in the database` +
      `${ref ? ` (${ref})` : ""}\n`,
  );

  if (!drift.missingTables.length && !drift.missingColumns.length) {
    console.log("  ✓ every table and column the code selects exists\n");
    process.exit(0);
  }

  /*
    Named individually rather than counted. "3 columns missing" sends somebody
    to a diff; "users.coach_notification_email" sends them to the migration.
  */
  for (const t of drift.missingTables) console.error(`  missing table   ${t}`);
  for (const c of drift.missingColumns) console.error(`  missing column  ${c.table}.${c.column}`);
  console.error(
    `\n  ✗ the database is behind the code — a migration in supabase/ was never applied\n`,
  );
  process.exit(1);
}
