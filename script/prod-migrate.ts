/**
 * Apply a migration to production, and then look at production.
 *
 *   npx tsx script/prod-migrate.ts --read "select …"
 *   npx tsx script/prod-migrate.ts --apply supabase/<file>.sql --yes-production
 *
 * ── Why this exists, given script/qa-migrate.ts ───────────────────────────
 *
 * Because production has no connection string here and never will: the
 * database vars are Vercel Sensitive and `vercel env pull` returns them empty
 * by design. The only door is the Management API, which takes a personal
 * access token and runs a statement against a project by ref.
 *
 * That door is wide. So this is deliberately narrow:
 *
 *   · The project ref is a constant, not an argument. There is no way to
 *     point this at another project by mistyping one.
 *   · `--apply` requires `--yes-production` as a separate word, so a
 *     migration cannot be applied by a command that reads like a query.
 *   · A file that opens or closes its own transaction is refused, for the
 *     reason spelled out in script/qa-migrate.ts: its COMMIT would end the
 *     transaction around it, and the verification after that point would run
 *     already committed.
 *   · Nothing is inferred from the response. Every apply is followed by a
 *     read, and the read is what is believed — which is CLAUDE.md's rule and
 *     the reason RLS-on-with-zero-policies was ever found.
 *
 * The Management API runs a statement in one implicit transaction, so a file
 * that raises anywhere leaves nothing behind.
 */
import { readFileSync } from "node:fs";

const REF = "zcvanbozvtojmnyuzsjh";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("\n✗ SUPABASE_ACCESS_TOKEN is not set — there is no door to production without it\n");
  process.exit(1);
}

async function run(sql: string): Promise<unknown> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 800)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const args = process.argv.slice(2);
const mode = args[0];

if (mode === "--read") {
  const sql = args[1];
  if (!sql) {
    console.error('usage: prod-migrate.ts --read "select …"');
    process.exit(1);
  }
  console.log(JSON.stringify(await run(sql), null, 2));
  process.exit(0);
}

if (mode !== "--apply") {
  console.error('usage: prod-migrate.ts --read "select …" | --apply <file.sql> --yes-production');
  process.exit(1);
}

const file = args[1];
if (!file) {
  console.error("usage: prod-migrate.ts --apply <file.sql> --yes-production");
  process.exit(1);
}
if (!args.includes("--yes-production")) {
  console.error(`\n✗ refusing to apply ${file} to production without --yes-production\n`);
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)) {
  console.error(`
✗ ${file} opens or closes its own transaction

    Its COMMIT would end the transaction the API runs it in, and the
    verification after that point could not roll anything back.
`);
  process.exit(1);
}

console.log(`\napplying ${file} to production (${REF})\n`);
try {
  const out = await run(sql);
  console.log(`  applied — ${JSON.stringify(out).slice(0, 300)}`);
} catch (err) {
  console.error(`\n✗ ${file} did NOT apply\n\n    ${(err as Error).message}\n`);
  process.exit(1);
}
