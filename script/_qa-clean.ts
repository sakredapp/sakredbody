import pg from "pg";
const c = new pg.Client({ connectionString: process.env.SAKREDBODY_QA_DATABASE_URL });
await c.connect();
const { rows: [me] } = await c.query<{ id: string }>("select id from users where email = $1", ["qa.member@sakred.local"]);
const open = await c.query("select id from workout_sessions where user_id = $1 and finished_at is null", [me.id]);
for (const s of open.rows as { id: string }[]) {
  await c.query("delete from workout_sets where session_id = $1", [s.id]);
  await c.query("delete from session_exercises where session_id = $1", [s.id]);
  await c.query("delete from workout_sessions where id = $1", [s.id]);
}
console.log(`  cleared ${open.rowCount} open session(s)`);
await c.end();
