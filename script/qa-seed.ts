/**
 * The QA world: four people, one week of practice, and nothing invented twice.
 *
 * ── What this is for ──────────────────────────────────────────────────────
 *
 * The walkthrough QA needs a member who has already done things — LAST TIME
 * has to have a last time, Terrain has to have a shape, Room has to have
 * somebody in it, and the coach workspace has to have a client. A freshly
 * rebuilt database has none of that, and a walkthrough rehearsed against empty
 * screens rehearses the wrong product.
 *
 * ── Idempotent by deletion, not by upsert ─────────────────────────────────
 *
 * Every row here is owned by one of four `@sakred.local` accounts, and the
 * first thing this does is delete everything those accounts own. Re-running is
 * then exactly a re-seed rather than a second helping — no `on conflict`
 * clause per table to get subtly wrong, and no possibility of a member ending
 * up with fourteen workouts because somebody ran it twice.
 *
 * The catalogue, tiers, routines and channels are shared rather than owned, so
 * those are upserted by their natural key.
 *
 * ── Determinism ───────────────────────────────────────────────────────────
 *
 * Every id is a hash of a name, so `qa-session-upper` is the same uuid on
 * every machine and a screenshot diff is about pixels rather than about which
 * uuid sorted first. Dates are offsets from the day it runs, because a Terrain
 * check-in dated eight months ago is not the screen anybody needs to see.
 *
 * Passwords are hashed with the application's own scrypt, so these accounts
 * log in through the real form — there is no QA authentication path.
 */
import crypto from "node:crypto";
import pg from "pg";
import { catalogueRows, slug } from "../shared/data/exerciseCatalogue.js";
import { looksLikeRealMembers, QA_EMAIL_DOMAIN, requireQaTarget } from "./qa-target.js";

const url = requireQaTarget(process.env);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

/** A stable uuid from a name, so nothing here depends on when it ran. */
const uid = (name: string): string => {
  const h = crypto.createHash("sha256").update(`sakred-qa:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/**
 * The application's hash format, with a salt derived from the address.
 *
 * `hashPassword` uses a random salt, which would make every re-seed produce a
 * different `users.password` and turn "did the seed change" into noise. The
 * derivation is the same scrypt with the same parameters, so
 * `verifyPassword` cannot tell the difference — which is the point.
 */
const hash = (email: string, password: string): string => {
  const salt = crypto.createHash("sha256").update(`sakred-qa-salt:${email}`).digest("hex").slice(0, 32);
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};

const day = (offset: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;

// ─── Guard: this is the same refusal qa-reset makes ──────────────────────

const existing = (await q("select email from public.users where email is not null")).map(
  (r) => r.email as string,
);
if (looksLikeRealMembers(existing)) {
  console.error(
    `\n✗ refusing to seed — public.users holds an address outside ${QA_EMAIL_DOMAIN}\n`,
  );
  await client.end();
  process.exit(1);
}

// ─── The people ──────────────────────────────────────────────────────────

const PASSWORD = "SakredQA!2026";

const PEOPLE = [
  {
    id: "qa-member",
    email: `qa.member${QA_EMAIL_DOMAIN}`,
    first: "Mara",
    last: "Quinn",
    role: "member",
    admin: "false",
    tier: "inner",
    /** The one the walkthrough is rehearsed against second — she has history. */
    seeded: true,
  },
  {
    id: "qa-fresh",
    email: `qa.fresh${QA_EMAIL_DOMAIN}`,
    first: "Tobin",
    last: "Reyes",
    role: "member",
    admin: "false",
    tier: "inner",
    /** Signed up, completed nothing. This is who the first run is really for. */
    seeded: false,
  },
  {
    id: "qa-coach",
    email: `qa.coach${QA_EMAIL_DOMAIN}`,
    first: "Idris",
    last: "Bell",
    role: "coach",
    admin: "false",
    tier: "guide",
    seeded: false,
  },
  {
    id: "qa-admin",
    email: `qa.admin${QA_EMAIL_DOMAIN}`,
    first: "Sena",
    last: "Ward",
    role: "admin",
    admin: "true",
    tier: "guide",
    seeded: false,
  },
] as const;

const OWNERS = PEOPLE.map((p) => p.id);

// ─── Wipe what these four own ────────────────────────────────────────────

/*
  Ordered so that nothing is deleted out from under a foreign key that lacks a
  cascade. Sessions cascade to their sets, composition and observations; the
  rest are named explicitly rather than trusted to.
*/
console.log("\n  · clearing");
await q("begin");
for (const sql of [
  "delete from public.community_messages where user_id = any($1)",
  "delete from public.notifications where user_id = any($1) or actor_user_id = any($1)",
  "delete from public.wins where user_id = any($1)",
  "delete from public.training_observations where user_id = any($1)",
  "delete from public.workout_sessions where user_id = any($1)",
  "delete from public.terrain_checkins where user_id = any($1)",
  "delete from public.health_days where user_id = any($1)",
  "delete from public.health_connections where user_id = any($1)",
  "delete from public.tracked_habit_phases where user_id = any($1)",
  "delete from public.tracked_habits where user_id = any($1)",
  "delete from public.coaching_checkin_requests where member_user_id = any($1) or coach_user_id = any($1)",
  "delete from public.coaching_plans where member_user_id = any($1) or coach_user_id = any($1)",
  "delete from public.coaching_messages where user_id = any($1)",
  "delete from public.coach_relationships where member_user_id = any($1) or coach_user_id = any($1)",
  "delete from public.users where id = any($1)",
]) {
  await q(sql, [OWNERS]);
}

// ─── Shared scaffolding: tiers, catalogue, one routine, one channel ──────

for (const [id, name, rank] of [
  ["inner", "Inner Circle", 1],
  ["guide", "Guide", 2],
] as const) {
  await q(
    `insert into public.membership_tiers (id, name, rank, is_active)
     values ($1, $2, $3, true)
     on conflict (id) do update set name = excluded.name, rank = excluded.rank`,
    [id, name, rank],
  );
}

const rows = catalogueRows();
for (const r of rows) {
  await q(
    `insert into public.exercises
       (id, name, pattern, equipment, category, takes_load, unilateral, tracking_type,
        bodyweight_factor, aliases, tracks_one_rep_max, is_active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
     on conflict (id) do update set name = excluded.name, category = excluded.category`,
    [
      slug(r.name), r.name, r.pattern, r.equipment, r.category,
      r.load ?? false, r.uni ?? false, r.tracking ?? "reps",
      /* NOT NULL with no default: a movement carrying no bodyweight is 0, not unknown. */
      r.bw ?? 0, r.aliases ?? null, r.orm ?? false,
    ],
  );
}

await q(
  `insert into public.wellness_routines (id, name, description, category, routine_type)
   values ('qa-restore', 'Restoration', 'The QA routine — restorative practice.', 'restore', 'restore')
   on conflict (id) do update set name = excluded.name`,
);

const RESTORE_HABITS = [
  { id: uid("habit-breath"), title: "Morning breath", minutes: 8, emphasis: "yin" },
  { id: uid("habit-mobility"), title: "Hip and thoracic mobility", minutes: 12, emphasis: "yang" },
  { id: uid("habit-walk"), title: "Evening walk", minutes: 25, emphasis: "yin" },
];
for (const [i, h] of RESTORE_HABITS.entries()) {
  await q(
    `insert into public.routine_habits (id, routine_id, title, short_description, cadence,
       duration_minutes, order_index, emphasis, tracking_type, published)
     values ($1, 'qa-restore', $2, $3, 'daily', $4, $5, $6, 'boolean', true)
     on conflict (id) do update set title = excluded.title`,
    [h.id, h.title, `${h.minutes} minutes. Part of the QA restore routine.`, h.minutes, i, h.emphasis],
  );
}

const ROOM = uid("channel-room");
await q(
  `insert into public.channels (id, slug, name, description, min_tier_rank, is_active, sort_order)
   values ($1, 'qa-room', 'The Room', 'Shared practice, in QA.', 0, true, 0)
   on conflict (slug) do update set name = excluded.name`,
  [ROOM],
);
const roomId = (await q("select id from public.channels where slug = 'qa-room'"))[0].id as string;

// ─── People ──────────────────────────────────────────────────────────────

for (const p of PEOPLE) {
  await q(
    `insert into public.users (id, email, password, first_name, last_name, is_admin, role,
       membership_tier, timezone, weight_unit, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'America/Los_Angeles','lb', now(), now())`,
    [p.id, p.email, hash(p.email, PASSWORD), p.first, p.last, p.admin, p.role, p.tier],
  );
}

const MEMBER = "qa-member";
const COACH = "qa-coach";

// ─── Terrain: six days, so the graph has a direction ─────────────────────

const TERRAIN: [number, number, number, number, number, number, number, number][] = [
  // offset, energy, recovery, nervous_system, digestion, body_tension, mental_clarity, drive
  [-5, 3, 3, 2, 4, 2, 3, 3],
  [-4, 3, 4, 3, 4, 3, 3, 3],
  [-3, 4, 4, 3, 4, 3, 4, 4],
  [-2, 2, 2, 2, 3, 2, 2, 2],
  [-1, 3, 3, 3, 4, 3, 4, 3],
  [0, 4, 4, 4, 4, 4, 4, 4],
];
for (const [off, energy, recovery, ns, dig, tension, clarity, drive] of TERRAIN) {
  await q(
    `insert into public.terrain_checkins
       (id, user_id, on_date, energy, recovery, nervous_system, digestion, body_tension,
        mental_clarity, drive, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      uid(`terrain-${off}`), MEMBER, day(off), energy, recovery, ns, dig, tension, clarity, drive,
      off === -2 ? "Slept badly. Kept it light." : null,
    ],
  );
}

// ─── Health: connected, with a week of days behind it ────────────────────

await q(
  `insert into public.health_connections
     (id, user_id, platform, granted_metrics, synced_through, last_sync_at, last_sync_count,
      device_model, os_version, created_at, updated_at)
   values ($1,$2,'ios',$3, now(), now(), 41, 'iPhone 16 Pro', '29.1', now(), now())`,
  [uid("health-conn"), MEMBER, ["steps", "sleep_hours", "resting_heart_rate", "hrv"]],
);

const HEALTH: [string, number[], string, string][] = [
  ["steps", [8210, 11040, 6390, 12780, 5120, 9430], "count", "Apple Health"],
  ["sleep_hours", [7.1, 6.4, 7.8, 5.9, 7.4, 7.6], "h", "Apple Health"],
  ["resting_heart_rate", [54, 55, 53, 58, 55, 53], "bpm", "Apple Health"],
  ["hrv", [61, 58, 66, 44, 59, 64], "ms", "Apple Health"],
];
for (const [metric, values, unit, app] of HEALTH) {
  for (const [i, value] of values.entries()) {
    const off = i - 5;
    await q(
      `insert into public.health_days (id, user_id, on_date, metric, value, unit, source, source_app, synced_at)
       values ($1,$2,$3,$4,$5,$6,'healthkit',$7, now())`,
      [uid(`health-${metric}-${off}`), MEMBER, day(off), metric, value, unit, app],
    );
  }
}

// ─── Build: two prior sessions, so LAST TIME is real ─────────────────────

/*
  The set shapes matter more than the numbers. Between them these cover every
  distinction the workout screen can draw — a warm-up, a normal working set, a
  back-off, a drop set, a set taken to failure, and one logged without RPE
  because the member did not say. The last is the one the walkthrough teaches:
  absent effort is unknown, not easy.
*/
const PRESS = slug("Incline Dumbbell Press");
const ROW = slug("Chest-Supported Dumbbell Row");
const SQUAT = slug("Back Squat");

const SESSIONS = [
  {
    off: -8,
    title: "Upper",
    id: uid("session-upper-1"),
    sets: [
      { ex: PRESS, i: 0, reps: 10, kg: 20, warm: true, style: "warmup", rpe: null, fail: false },
      { ex: PRESS, i: 1, reps: 8, kg: 32.5, warm: false, style: "normal", rpe: 7, fail: false },
      { ex: PRESS, i: 2, reps: 7, kg: 32.5, warm: false, style: "normal", rpe: 8, fail: false },
      { ex: PRESS, i: 3, reps: 10, kg: 27.5, warm: false, style: "backoff", rpe: 8.5, fail: false },
      { ex: ROW, i: 0, reps: 12, kg: 40, warm: false, style: "normal", rpe: 7, fail: false },
      { ex: ROW, i: 1, reps: 11, kg: 40, warm: false, style: "normal", rpe: null, fail: false },
    ],
    note: "Shoulder felt fine on the incline for the first time in a while.",
  },
  {
    off: -3,
    title: "Lower",
    id: uid("session-lower-1"),
    sets: [
      { ex: SQUAT, i: 0, reps: 8, kg: 60, warm: true, style: "warmup", rpe: null, fail: false },
      { ex: SQUAT, i: 1, reps: 5, kg: 100, warm: false, style: "normal", rpe: 8, fail: false },
      { ex: SQUAT, i: 2, reps: 5, kg: 100, warm: false, style: "normal", rpe: 9, fail: false },
      { ex: SQUAT, i: 3, reps: 4, kg: 100, warm: false, style: "normal", rpe: 10, fail: true },
      { ex: SQUAT, i: 4, reps: 8, kg: 80, warm: false, style: "dropset", rpe: 9, fail: false },
    ],
    note: null,
  },
] as const;

for (const s of SESSIONS) {
  await q(
    `insert into public.workout_sessions (id, user_id, on_date, title, note, duration_minutes, finished_at, created_at)
     values ($1,$2,$3,$4,$5,$6, ($3::date + time '18:40') at time zone 'UTC', ($3::date + time '17:45') at time zone 'UTC')`,
    [s.id, MEMBER, day(s.off), s.title, s.note, s.title === "Upper" ? 52 : 47],
  );
  const movements = [...new Set(s.sets.map((x) => x.ex))];
  for (const [pos, ex] of movements.entries()) {
    await q(
      `insert into public.session_exercises (id, session_id, exercise_id, position)
       values ($1,$2,$3,$4)`,
      [uid(`se-${s.id}-${ex}`), s.id, ex, pos],
    );
  }
  for (const x of s.sets) {
    await q(
      `insert into public.workout_sets
         (id, session_id, exercise_id, set_index, reps, weight_kg, is_warmup, set_style, to_failure, rpe)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [uid(`set-${s.id}-${x.ex}-${x.i}`), s.id, x.ex, x.i, x.reps, x.kg, x.warm, x.style, x.fail, x.rpe],
    );
  }
}

/* Training Memory: what the member noticed, which no number carries. */
await q(
  `insert into public.training_observations (id, user_id, session_id, exercise_id, on_date, note, quality, side)
   values ($1,$2,$3,$4,$5,$6,'good',null), ($7,$2,$8,$9,$10,$11,'tight','left')`,
  [
    uid("obs-1"), MEMBER, SESSIONS[0].id, PRESS, day(-8),
    "Left shoulder quiet all the way through. First time since spring.",
    uid("obs-2"), SESSIONS[1].id, SQUAT, day(-3),
    "Left hip tight coming out of the hole on the last two.",
  ],
);

// ─── Restore: three habits, one with a closed phase behind it ────────────

for (const [i, h] of RESTORE_HABITS.entries()) {
  const th = uid(`tracked-${h.title}`);
  await q(
    `insert into public.tracked_habits
       (id, user_id, routine_habit_id, emphasis, status, first_added_by, order_index, created_at, updated_at)
     values ($1,$2,$3,$4,'active','member',$5, now(), now())`,
    [th, MEMBER, h.id, h.emphasis, i],
  );
  await q(
    `insert into public.tracked_habit_phases
       (id, tracked_habit_id, user_id, routine_habit_id, status, phase_type, starts_on,
        schedule_kind, schedule_count, source, member_reason)
     values ($1,$2,$3,$4,'active','ongoing',$5,$6,$7,'member',$8)`,
    /*
      `times_per_week` carries a count and no day list; `daily` carries neither.
      The database holds both halves of that rule, and a phase that names a
      count while claiming to be daily is refused — which is how the walk is
      supposed to work.
    */
    [uid(`phase-${h.title}`), th, MEMBER, h.id, day(-21),
     i === 2 ? "times_per_week" : "daily", i === 2 ? 4 : null,
     i === 0 ? "Mornings were getting away from me." : null],
  );
}

// ─── Coaching: a relationship, a plan, a check-in, a conversation ────────

const REL = uid("relationship");
await q(
  `insert into public.coach_relationships (id, coach_user_id, member_user_id, status, started_at, assigned_by, created_at, updated_at)
   values ($1,$2,$3,'active', now() - interval '60 days', 'qa-admin', now(), now())`,
  [REL, COACH, MEMBER],
);

await q(
  `insert into public.coaching_plans
     (id, member_user_id, coach_user_id, relationship_id, title, focus, member_visible_note,
      internal_note, status, starts_on, created_by_user_id, activated_by_user_id, activated_at, created_at, updated_at)
   values ($1,$2,$3,$4,'Rebuild the base','Tissue tolerance before load',
     'Two lifting days, three restore days. We are not chasing numbers this month.',
     'Left shoulder history — keep incline work sub-maximal for another fortnight.',
     'active',$5,$3,$3, now(), now(), now())`,
  [uid("plan"), MEMBER, COACH, REL, day(-21)],
);

await q(
  `insert into public.coaching_checkin_requests
     (id, member_user_id, coach_user_id, relationship_id, requested_by_user_id, kind, status,
      coach_prompt, requested_at, due_on, created_at, updated_at)
   values ($1,$2,$3,$4,$3,'reflection','open',
     'How did the hip feel the day after squats? Anything you would change about the warm-up?',
     now() - interval '1 day', $5, now(), now())`,
  [uid("checkin"), MEMBER, COACH, REL, day(2)],
);

const CONVERSATION: [string, string, number][] = [
  ["coach", "Saw the squat session — the last set to failure was not the plan, but the notes tell me why. How is the hip today?", -3],
  ["member", "Tight the next morning, fine by the evening. I think I rushed the warm-up.", -2],
  ["coach", "That matches what the numbers say. Give it the full ten minutes this week and let's compare.", -2],
];
for (const [i, [role, content, off]] of CONVERSATION.entries()) {
  await q(
    `insert into public.coaching_messages (id, user_id, sender_role, sender_user_id, message_type, content, created_at)
     values ($1,$2,$3,$4,'text',$5, now() - ($6 || ' days')::interval)`,
    [uid(`msg-${i}`), MEMBER, role, role === "coach" ? COACH : MEMBER, content, Math.abs(off)],
  );
}

// ─── Room: something to walk into ────────────────────────────────────────

const POSTS: [string, string, number][] = [
  [COACH, "Reminder that the restore days are the training. The lifting is what you can afford because of them.", -4],
  [MEMBER, "Third week of the morning breath practice. I did not expect it to be the one that stuck.", -2],
];
for (const [i, [user, body, off]] of POSTS.entries()) {
  await q(
    `insert into public.community_messages (id, channel_id, user_id, body, depth, created_at)
     values ($1,$2,$3,$4,0, now() - ($5 || ' days')::interval)`,
    [uid(`post-${i}`), roomId, user, body, Math.abs(off)],
  );
}
await q(
  `insert into public.community_messages (id, channel_id, user_id, parent_id, root_id, body, depth, created_at)
   values ($1,$2,$3,$4,$4,$5,1, now() - interval '1 day')`,
  [uid("reply-0"), roomId, COACH, uid("post-1"), "That is usually the one. Small and every day beats large and occasional."],
);

// ─── Progress & Wins, and one unread notification ────────────────────────

await q(
  `insert into public.wins (id, user_id, kind, title, subtitle, on_date, earned_at)
   values ($1,$2,'streak','Seven days of Restore','Morning breath, every day this week',$3, now() - interval '1 day'),
          ($4,$2,'perfect_week','A full week held','Every restore day and both lifting days',$5, now() - interval '3 days')`,
  [uid("win-1"), MEMBER, day(-1), uid("win-2"), day(-3)],
);

await q(
  `insert into public.notifications (id, user_id, type, actor_user_id, resource_type, resource_id, title, body, dedupe_key, created_at)
   values ($1,$2,'checkin_requested',$3,'coaching_checkin_request',$4,'Idris asked for a reflection',
     'How did the hip feel the day after squats?', $5, now() - interval '1 day')`,
  [uid("notif-1"), MEMBER, COACH, uid("checkin"), "qa-checkin-1"],
);

await q("commit");

// ─── Report what exists ──────────────────────────────────────────────────

const counts = await q(
  `select
     (select count(*) from public.users where email like '%' || $2) users,
     (select count(*) from public.exercises) exercises,
     (select count(*) from public.terrain_checkins where user_id = any($1)) terrain,
     (select count(*) from public.health_days where user_id = any($1)) health_days,
     (select count(*) from public.workout_sessions where user_id = any($1)) sessions,
     (select count(*) from public.workout_sets ws join public.workout_sessions s on s.id = ws.session_id where s.user_id = any($1)) sets,
     (select count(*) from public.training_observations where user_id = any($1)) observations,
     (select count(*) from public.tracked_habits where user_id = any($1)) habits,
     (select count(*) from public.coaching_messages where user_id = any($1)) coach_messages,
     (select count(*) from public.community_messages where user_id = any($1)) room,
     (select count(*) from public.wins where user_id = any($1)) wins,
     (select count(*) from public.notifications where user_id = any($1)) notifications`,
  [OWNERS, QA_EMAIL_DOMAIN],
);

await client.end();

console.log("  · seeded\n");
for (const [k, v] of Object.entries(counts[0])) console.log(`      ${k.padEnd(15)} ${v}`);
console.log(`\n  ${PEOPLE.map((p) => p.email).join("\n  ")}\n  password: ${PASSWORD}\n`);
console.log("✓ QA world seeded\n");
