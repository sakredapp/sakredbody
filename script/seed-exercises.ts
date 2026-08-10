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
import { catalogueRows, slug } from "../shared/data/exerciseCatalogue.js";

const rows = catalogueRows();

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (a?: string[]) => (a && a.length ? `ARRAY[${a.map(q).join(", ")}]::text[]` : "NULL");

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
