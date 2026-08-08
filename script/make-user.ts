/**
 * Mint a user, or reset one's password.
 *
 * Emits SQL rather than connecting. The database URL is a Sensitive variable
 * on Vercel and is deliberately not in `.env`, so nothing local can reach
 * Postgres — and a seeding script that quietly needs production credentials
 * on a laptop is a worse idea than one that prints a statement you can read
 * before you run it.
 *
 * The hash is produced by the app's own `hashPassword` and then checked with
 * the app's own `verifyPassword` before anything is printed. That matters
 * more than it sounds: a hand-written hash in the wrong format used to crash
 * the entire server on the first login attempt rather than simply failing
 * (see docs/AUDIT-2026-08-08.md §10). The verifier is now defensive, but the
 * right fix is still to never write a row it would have to defend against.
 *
 * Usage:
 *   tsx script/make-user.ts <email> <password> [tier] [first] [last]
 *
 * Tier is a `membership_tiers.id` — free, member, inner, executive.
 * Defaults to `member`, which is rank 10 and the lowest tier that can
 * actually see a room; `free` is rank 0 and sees nothing.
 */

import { hashPassword, verifyPassword } from "../server/auth/password.js";

function quote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

async function main() {
  const [email, password, tier = "member", first = "Demo", last = "Member"] =
    process.argv.slice(2);

  if (!email || !password) {
    console.error(
      "Usage: tsx script/make-user.ts <email> <password> [tier] [first] [last]",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters — same rule as /api/register.");
    process.exit(1);
  }

  const hash = await hashPassword(password);

  // Round-trip through the real verifier before emitting anything.
  if (!(await verifyPassword(password, hash))) {
    console.error("The generated hash did not verify. Refusing to emit SQL.");
    process.exit(1);
  }
  if (await verifyPassword(password + "x", hash)) {
    console.error("The verifier accepted a wrong password. Refusing to emit SQL.");
    process.exit(1);
  }

  const lower = email.toLowerCase();

  // ON CONFLICT so this doubles as a password reset. It deliberately does not
  // touch is_admin: nothing about creating a demo account should be able to
  // grant or revoke admin, even by accident.
  console.log(`
-- ${lower} — tier ${tier}
insert into users (id, email, first_name, last_name, password, membership_tier, is_admin, created_at, updated_at)
values (gen_random_uuid()::text, ${quote(lower)}, ${quote(first)}, ${quote(last)}, ${quote(hash)}, ${quote(tier)}, 'false', now(), now())
on conflict (email) do update set
  password = excluded.password,
  membership_tier = excluded.membership_tier,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  updated_at = now();

select email, membership_tier, is_admin,
       (password ~ '^[0-9a-f]{32}:[0-9a-f]{128}$') as hash_well_formed
from users where email = ${quote(lower)};
`.trim());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
