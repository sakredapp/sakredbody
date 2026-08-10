/**
 * Render the movement catalogue to a reviewable migration.
 *
 * The data itself lives in shared/data/exerciseCatalogue.ts — edit that. This
 * only turns it into SQL, so a change to two hundred rows shows up as a diff
 * somebody can actually read rather than as a script that silently upserts.
 *
 * The same data is also applied at runtime by
 * POST /api/admin/training/catalogue/sync, which is how it reaches production:
 * the database URL is a Vercel Sensitive variable and deliberately absent
 * locally, so there is no psql to pipe this into.
 *
 *   npx tsx script/seed-exercises.ts
 */

import { writeFileSync } from "fs";
import { catalogueRows, slug, arrayLiteral } from "../shared/data/exerciseCatalogue.js";
import { MOVEMENT_PATTERNS, EQUIPMENT } from "../shared/models/training.js";

const rows = catalogueRows();

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
// The same rendering the sync endpoint binds, so a file reviewed here and a
// row written by the API cannot disagree about what an alias list is.
const arr = (a?: string[]) => {
  const literal = arrayLiteral(a);
  return literal === null ? "NULL" : `${q(literal)}::text[]`;
};

let order = 0;
const values = rows.map((r) => {
  order += 10;
  return `  (${q(slug(r.name))}, ${q(r.name)}, ${q(r.category)}, ${q(r.pattern)}, ${q(
    r.equipment,
  )}, ${q(r.tracking ?? "reps")}, ${r.load ?? true}, ${r.uni ?? false}, ${r.bw ?? 0}, ${
    r.orm ?? false
  }, ${arr(r.aliases)}, ${order})`;
});

const categories = new Set(rows.map((r) => r.category));

writeFileSync(
  "supabase/exercise-catalogue.sql",
  `-- ═══════════════════════════════════════════════════════════════════════════
-- The movement catalogue — ${rows.length} movements, ${categories.size} categories
-- ═══════════════════════════════════════════════════════════════════════════
--
-- GENERATED from shared/data/exerciseCatalogue.ts by script/seed-exercises.ts.
-- Edit the data module, not this file — the rules about which categories take
-- load and how each is tracked live there, and hand-editing here is how a foam
-- roll ends up logged in kilograms.
--
-- Idempotent. \`owner_user_id\` is deliberately never touched, so re-running
-- cannot disturb a movement a member added for themselves.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO exercises
  (id, name, category, pattern, equipment, tracking_type, takes_load, unilateral,
   bodyweight_factor, tracks_one_rep_max, aliases, sort_order)
VALUES
${values.join(",\n")}
ON CONFLICT (id) DO UPDATE SET
  name               = excluded.name,
  category           = excluded.category,
  pattern            = excluded.pattern,
  equipment          = excluded.equipment,
  tracking_type      = excluded.tracking_type,
  takes_load         = excluded.takes_load,
  unilateral         = excluded.unilateral,
  bodyweight_factor  = excluded.bodyweight_factor,
  tracks_one_rep_max = excluded.tracks_one_rep_max,
  aliases            = COALESCE(excluded.aliases, exercises.aliases),
  sort_order         = excluded.sort_order,
  is_active          = true;
`,
);

console.log(`generated supabase/exercise-catalogue.sql — ${rows.length} movements, ${categories.size} categories`);

/**
 * ── And the constraints that decide whether any of it is allowed in ───────
 *
 * `pattern` and `equipment` each have a CHECK constraint in Postgres, written
 * when Build meant barbells. The catalogue has since grown rings, sleds,
 * reformers, megaformers and barres, and patterns the original eight never
 * covered — and nothing complained, because nothing compared them. It surfaced
 * only when the sync endpoint first ran and Postgres rejected a sled push on a
 * constraint that predates sleds.
 *
 * So this file emits both alongside the rows. Regenerating the catalogue
 * regenerates its vocabulary, and the two cannot drift apart again without
 * somebody deliberately editing one of them by hand.
 */
const list = (a: readonly string[]) => a.map((v) => q(v)).join(", ");

writeFileSync(
  "supabase/exercise-vocabulary.sql",
  `-- ═══════════════════════════════════════════════════════════════════════════
-- The movement vocabulary — ${MOVEMENT_PATTERNS.length} patterns, ${EQUIPMENT.length} kinds of equipment
-- ═══════════════════════════════════════════════════════════════════════════
--
-- GENERATED from MOVEMENT_PATTERNS and EQUIPMENT in shared/models/training.ts
-- by script/seed-exercises.ts. Those arrays are also what the zod enums and the
-- catalogue test read, so this file is the fourth reader of one list rather
-- than a fourth copy of it.
--
-- Run this BEFORE the catalogue: a row using a word the constraint has not
-- heard of is rejected outright, and the whole transactional file rolls back.

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_pattern_chk;
ALTER TABLE exercises ADD CONSTRAINT exercises_pattern_chk
  CHECK (pattern IN (${list(MOVEMENT_PATTERNS)}));

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_equipment_chk;
ALTER TABLE exercises ADD CONSTRAINT exercises_equipment_chk
  CHECK (equipment IN (${list(EQUIPMENT)}));
`,
);

console.log(
  `generated supabase/exercise-vocabulary.sql — ${MOVEMENT_PATTERNS.length} patterns, ${EQUIPMENT.length} equipment`,
);
