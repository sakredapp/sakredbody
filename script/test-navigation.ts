/**
 * What the bar promises, and where a role actually lives.
 *
 * ── Two changes this pins ─────────────────────────────────────────────────
 *
 * The Body took the fifth primary slot from Wins, and the role workspaces —
 * Coach, Admin — moved out of hardcoded pills in the dashboard header into one
 * generic list rendered under My Roles.
 *
 * Both are the kind of change that reverts by accident. A destination is three
 * lines of data, so restoring Wins to the bar, or adding the next role as a
 * fourth header pill because that is where the last two were, is a small and
 * plausible edit that no type error would catch. What makes them checkable is
 * that the navigation is data: the lists can be read and held to the shape the
 * product decided on.
 *
 * ── Why the lists are parsed and not imported ─────────────────────────────
 *
 * Importing MemberNav pulls the client's module graph in behind it, and that
 * graph reaches `import.meta.env` — which exists under Vite and is `undefined`
 * under tsx, so the import throws before a single assertion runs. The rest of
 * the client is tested the same way for the same reason.
 *
 * So the destination lists are read out of the source as data. That is a
 * weaker guarantee than importing them and it is stated plainly here rather
 * than glossed: this proves what the file *says*, and the parser below fails
 * loudly if a list stops being readable in the shape it expects, rather than
 * quietly finding nothing and passing.
 */

import { readFileSync } from "node:fs";
import { ROLE_RANKS, atLeast } from "../shared/models/access.js";

type Parsed = { id: string; section?: string; href?: string; capability?: string };

/**
 * The entries of one exported destination list.
 *
 * Split on `id:` rather than on braces, because every entry here carries a
 * block comment and several contain braces inside them.
 */
function parseList(source: string, name: string): Parsed[] {
  const open = source.indexOf(`export const ${name}: Destination[] = [`);
  if (open === -1) throw new Error(`${name} is no longer an exported Destination[]`);
  const close = source.indexOf("\n];", open);
  if (close === -1) throw new Error(`${name} has no terminator`);
  const block = source.slice(open, close);

  const chunks = block.split(/\bid:\s*"/).slice(1);
  if (chunks.length === 0) throw new Error(`${name} parsed to zero destinations`);

  return chunks.map((chunk) => {
    const id = chunk.slice(0, chunk.indexOf('"'));
    const field = (key: string) => chunk.match(new RegExp(`\\b${key}:\\s*"([^"]+)"`))?.[1];
    return { id, section: field("section"), href: field("href"), capability: field("capability") };
  });
}

const destinationIsValid = (d: Parsed) => (d.section === undefined) !== (d.href === undefined);

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const nav = readFileSync("client/src/components/MemberNav.tsx", "utf8");
const dashboard = readFileSync("client/src/pages/MemberDashboard.tsx", "utf8");

const PRIMARY = parseList(nav, "PRIMARY");
const SECONDARY = parseList(nav, "SECONDARY");
const ROLE_DESTINATIONS = parseList(nav, "ROLE_DESTINATIONS");

// ─── The five ────────────────────────────────────────────────────────────

check(
  "the bar holds exactly five destinations",
  PRIMARY.length === 5,
  `${PRIMARY.length}: ${PRIMARY.map((d) => d.id).join(", ")}`,
);

check(
  "in the order the product decided",
  PRIMARY.map((d) => d.id).join(",") === "home,restore,build,community,body",
  PRIMARY.map((d) => d.id).join(","),
);

check(
  "Body is primary and reaches the existing section",
  PRIMARY.some((d) => d.id === "body" && d.section === "body"),
);

check(
  "Wins is not in the bar",
  !PRIMARY.some((d) => d.id === "wins"),
);

/*
  The point of the swap. Wins keeps its screen; it loses the seat. A change
  that removed the destination outright would strand the member's own history,
  which is a different decision from the one that was made.
*/
check(
  "but Wins is still reachable, with its section intact",
  SECONDARY.some((d) => d.id === "wins" && d.section === "wins"),
);

check(
  "and the Body is not also listed under More",
  !SECONDARY.some((d) => d.id === "body"),
  "the same room reached two ways",
);

// ─── One address each ────────────────────────────────────────────────────

for (const [name, list] of [
  ["primary", PRIMARY],
  ["secondary", SECONDARY],
  ["roles", ROLE_DESTINATIONS],
] as const) {
  const bad = list.filter((d) => !destinationIsValid(d));
  check(
    `every ${name} destination has exactly one address`,
    bad.length === 0,
    bad.map((d) => d.id).join(", "),
  );
}

check(
  "every role workspace is a route, never a section",
  ROLE_DESTINATIONS.every((d) => !!d.href && d.section === undefined),
);

// ─── Who sees a role ─────────────────────────────────────────────────────

const coach = ROLE_DESTINATIONS.find((d) => d.id === "coach")!;
const admin = ROLE_DESTINATIONS.find((d) => d.id === "admin")!;

check("Coach opens /coach", coach?.href === "/coach");
check("Admin opens /admin", admin?.href === "/admin");

check(
  "every role destination states the rank it needs",
  ROLE_DESTINATIONS.every((d) => !!d.capability && d.capability in ROLE_RANKS),
);

/*
  The filter the sheet applies, run against each rank on the ladder. A plain
  member seeing no My Roles heading at all is the whole point of the section
  being conditional.
*/
const visibleTo = (role: string) =>
  ROLE_DESTINATIONS.filter((d) => !d.capability || atLeast(role, d.capability)).map((d) => d.id);

check("a member holds no role workspace", visibleTo("member").length === 0, visibleTo("member").join(","));
check("a coach holds Coach and not Admin", visibleTo("coach").join(",") === "coach", visibleTo("coach").join(","));
check("an admin holds both", visibleTo("admin").join(",") === "coach,admin", visibleTo("admin").join(","));
check("an owner holds both", visibleTo("owner").join(",") === "coach,admin", visibleTo("owner").join(","));

/*
  Admin promises exactly what AdminPortal admits. It was gated on `isStaff` —
  rank moderator — one below what the page itself allows, so a moderator was
  shown a door that answered with Access Denied.
*/
check(
  "a moderator is not offered a back office that would refuse them",
  !visibleTo("moderator").includes("admin"),
  visibleTo("moderator").join(","),
);

// ─── Where roles are rendered ────────────────────────────────────────────

check(
  "the dashboard header has no Coach pill",
  !dashboard.includes('data-testid="link-coach"'),
  "a role belongs in the roles list, not as a bespoke control",
);

check(
  "and no Admin pill",
  !dashboard.includes('data-testid="link-admin"'),
);

check(
  "the More sheet renders roles under a heading",
  /My roles/i.test(nav) && /roles\.length > 0/.test(nav),
);

check(
  "routed destinations navigate with Link rather than onChange",
  /<Link[\s\S]{0,120}href=\{d\.href!\}/.test(nav),
);

check(
  "and still close the sheet behind them",
  /<SheetClose asChild key=\{d\.id\}>[\s\S]{0,900}<Link/.test(nav),
  "Radix does not close on an arbitrary click inside",
);

check(
  "section destinations still switch in place",
  /onClick=\{\(\) => onChange\(d\.section!\)\}/.test(nav),
);

check(
  "the desktop nav offers the same roles rather than a special shortcut",
  /member-role-\$\{id\}|member-role-/.test(nav) && /roles\.map/.test(nav),
);

/*
  Moving Coach into a drawer is only honest if the drawer can say it holds
  something. Without this the change quietly costs a coach their notifications.
*/
check(
  "More can show that something inside wants attention",
  /rolesNeedAttention/.test(nav) && /nav-more-dot/.test(nav),
);

check(
  "the dot sits on the glyph so the bar cannot shift when it appears",
  /<span className="relative">[\s\S]{0,500}nav-more-dot/.test(nav),
);

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ navigation\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} navigation assertions passed`);
