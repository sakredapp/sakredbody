/**
 * Coaching — who may act, and for whom.
 *
 * ── Why these are separate questions ──────────────────────────────────────
 *
 * The role ladder is hierarchical: `coach` is rank 10, so `atLeast(role,
 * "coach")` is true for every moderator, admin and owner in the database. That
 * is the right answer to "may this account perform coach-shaped actions" and a
 * catastrophic answer to "for which member" — used alone it would make every
 * admin the assigned coach of everybody.
 *
 * So the boundary is two checks, and these assertions pin both of them plus the
 * shapes the database itself refuses.
 *
 * Pure functions and SQL semantics only — no server, no database. The live
 * behaviour of the same statements is verified separately against Postgres.
 *
 * Run: tsx script/test-coaching-access.ts
 */

import { atLeast, can, effectiveRole, ROLES } from "../shared/models/access.js";
import { assignCoachSchema } from "../shared/models/coaching.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nCapability: what kind of thing may this account do\n");

check("a member is not a coach", !atLeast("member", "coach"));
check("a coach is a coach", atLeast("coach", "coach"));
check("an admin has coach-level capability", atLeast("admin", "coach"));
check("an owner does too", atLeast("owner", "coach"));
/**
 * The trap this whole design exists to avoid. Rank answers "may they do
 * coach-shaped things"; it must never be read as "they are this member's
 * coach", or every admin is everybody's coach.
 */
check("but a moderator is also above coach rank", atLeast("moderator", "coach"));
check(
  "which is exactly why rank cannot be the relationship",
  ROLES.filter((r) => atLeast(r, "coach")).length > 1,
);

/** The admin bypass is a named capability, not a side effect of being senior. */
check("an admin may act on any member operationally", can("admin", "manageMembers"));
check("a coach may not", !can("coach", "manageMembers"));
check("nor a moderator", !can("moderator", "manageMembers"));

console.log("\nThe legacy flag and the role cannot disagree\n");

/**
 * `effectiveRole` takes the higher of the two, so a half-applied change can
 * never quietly cost somebody access they still have. The admin endpoint writes
 * both from one value for the same reason.
 */
check("role wins when it is higher", effectiveRole({ role: "admin", isAdmin: "false" }) === "admin");
check("the legacy flag wins when it is higher", effectiveRole({ role: "member", isAdmin: "true" }) === "admin");
check("a coach with no legacy flag is a coach", effectiveRole({ role: "coach", isAdmin: "false" }) === "coach");
check("an unknown role floors to member", effectiveRole({ role: "wizard", isAdmin: "false" }) === "member");
check("nothing at all is a member", effectiveRole({}) === "member");

console.log("\nWhat the assignment endpoint accepts\n");

check("a coach id is accepted", assignCoachSchema.safeParse({ coachUserId: "abc" }).success);
check("an empty id is refused", !assignCoachSchema.safeParse({ coachUserId: "" }).success);
check("a missing id is refused", !assignCoachSchema.safeParse({}).success);
/** Nothing else about the relationship is client-settable: status, dates and
 *  who assigned it are the server's to decide. */
{
  const parsed = assignCoachSchema.safeParse({
    coachUserId: "abc",
    status: "ended",
    startedAt: "2020-01-01",
    assignedBy: "someone-else",
  });
  check("status is not client-settable", parsed.success && !("status" in parsed.data));
  check("startedAt is not client-settable", parsed.success && !("startedAt" in parsed.data));
  check("assignedBy is not client-settable", parsed.success && !("assignedBy" in parsed.data));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
