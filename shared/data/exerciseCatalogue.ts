/**
 * The movement catalogue — the data, in one place.
 *
 * Roughly 470 movements. Catalogue content is cheap relative to the feature and
 * search makes size irrelevant to the member, but an absent movement is a
 * member who cannot log their session at all. The old catalogue was twenty-five
 * barbell lifts, which is a powerlifting app wearing a wellness name.
 *
 * ── Why it is data with rules rather than a .sql file ─────────────────────
 *
 * Every row needs a slug, a pattern, a category, a tracking type, a load flag
 * and sensible defaults. Two hundred hand-written INSERTs guarantee some of
 * them disagree — a stretch marked as taking load, a carry tracked in reps.
 * Here the rules are stated once per category and the rows inherit them. That
 * is also how the equipment bug surfaced: every barbell lift was inheriting the
 * bodyweight fallback, because the category defaults never named one.
 *
 * Consumed twice: script/seed-exercises.ts renders it to a reviewable
 * migration, and POST /api/admin/training/catalogue/sync upserts it directly,
 * so the catalogue can be corrected without a database console.
 */

export type Row = {
  name: string;
  category: string;
  pattern: string;
  equipment: string;
  tracking?: "reps" | "duration" | "distance";
  load?: boolean;
  uni?: boolean;
  /** Fraction of bodyweight the movement carries before added plates. */
  bw?: number;
  /** Worth estimating a one-rep max for. */
  orm?: boolean;
  aliases?: string[];
};

/** `Barbell Bench Press` → `barbell-bench-press`. Stable, readable in a URL. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Defaults by category, so each row only states what is unusual about it.
 * This is the part that stops a foam roll being logged in kilograms.
 */
const DEFAULTS: Record<string, Partial<Row>> = {
  chest: { pattern: "push", equipment: "barbell", tracking: "reps", load: true },
  back: { pattern: "pull", equipment: "barbell", tracking: "reps", load: true },
  shoulders: { pattern: "push", equipment: "barbell", tracking: "reps", load: true },
  arms: { pattern: "pull", equipment: "barbell", tracking: "reps", load: true },
  legs: { pattern: "squat", equipment: "barbell", tracking: "reps", load: true },
  /*
    A whole session, which is what an imported `strength` workout maps to as
    well — so a member recording "Tuesday was a full-body day" and a watch
    reporting Strength Training land on the same category and weigh the same.
  */
  full_body: { pattern: "squat", equipment: "other", tracking: "duration", load: false },
  glutes: { pattern: "hinge", equipment: "barbell", tracking: "reps", load: true },
  calves: { pattern: "push", equipment: "machine", tracking: "reps", load: true },
  core: { pattern: "core", equipment: "bodyweight", tracking: "reps", load: false },
  carry: { pattern: "carry", equipment: "dumbbell", tracking: "distance", load: true },
  kettlebell: { pattern: "hinge", equipment: "kettlebell", tracking: "reps", load: true },
  olympic: { pattern: "hinge", equipment: "barbell", tracking: "reps", load: true },
  landmine: { pattern: "push", equipment: "barbell", tracking: "reps", load: true },
  calisthenics: { pattern: "pull", equipment: "bodyweight", tracking: "reps", load: false },
  rings: { pattern: "pull", equipment: "rings", tracking: "reps", load: false },
  neck_grip: { pattern: "carry", equipment: "other", tracking: "reps", load: true },
  feet: { pattern: "balance", equipment: "bodyweight", tracking: "duration", load: false },
  rotation: { pattern: "rotation", equipment: "cable", tracking: "reps", load: true },
  isometric: { pattern: "isometric", equipment: "bodyweight", tracking: "duration", load: false },
  balance: { pattern: "balance", equipment: "bodyweight", tracking: "duration", load: false },
  agility: { pattern: "locomotion", equipment: "bodyweight", tracking: "duration", load: false },
  plyometric: { pattern: "elastic", equipment: "bodyweight", tracking: "reps", load: false },
  explosive: { pattern: "elastic", equipment: "bodyweight", tracking: "reps", load: false },
  locomotion: { pattern: "locomotion", equipment: "bodyweight", tracking: "distance", load: false },
  cardio: { pattern: "conditioning", equipment: "machine", tracking: "duration", load: false },
  corrective: { pattern: "mobility", equipment: "bodyweight", tracking: "reps", load: false },
  ground: { pattern: "locomotion", equipment: "bodyweight", tracking: "duration", load: false },
  yoga: { pattern: "mobility", equipment: "bodyweight", tracking: "duration", load: false },
  somatic: { pattern: "elastic", equipment: "bodyweight", tracking: "duration", load: false },
  // Everything below is held for time and takes no load. That is the whole
  // reason `takesLoad` exists — a couch stretch with a kilogram box beside it
  // is an app built for something else.
  mobility: { pattern: "mobility", equipment: "bodyweight", tracking: "duration", load: false },
  fascia: { pattern: "elastic", equipment: "bodyweight", tracking: "duration", load: false },
  tissue: { pattern: "tissue", equipment: "other", tracking: "duration", load: false },
  breath: { pattern: "breath", equipment: "bodyweight", tracking: "duration", load: false },
  recovery: { pattern: "recovery", equipment: "bodyweight", tracking: "duration", load: false },
  // Studio work. Resistance here is a spring, a band or the body against a
  // slow tempo — never a plate — so `load` is false throughout and the weight
  // box never appears. Lagree is timed rather than counted because that is how
  // it is actually taught: stay on the carriage until the minute is up.
  pilates: { pattern: "core", equipment: "mat", tracking: "reps", load: false },
  lagree: { pattern: "core", equipment: "megaformer", tracking: "duration", load: false },
  barre: { pattern: "core", equipment: "barre", tracking: "reps", load: false },
  // A session, not a movement. See the note on PRACTICES below.
  practice: { pattern: "flow", equipment: "bodyweight", tracking: "duration", load: false },
  class: { pattern: "flow", equipment: "other", tracking: "duration", load: false },
  sport: { pattern: "sport", equipment: "other", tracking: "duration", load: false },
  endurance: { pattern: "conditioning", equipment: "other", tracking: "duration", load: false },
};

const N = (name: string, extra: Partial<Row> = {}) => ({ name, ...extra });

const CATALOGUE: Record<string, Partial<Row>[]> = {
  chest: [
    N("Barbell Bench Press", { orm: true, aliases: ["bench", "bench press", "bb bench"] }),
    N("Incline Barbell Bench Press", { orm: true, aliases: ["incline bench"] }),
    N("Decline Barbell Bench Press", { orm: true }),
    N("Dumbbell Bench Press", { equipment: "dumbbell", aliases: ["db bench"] }),
    N("Incline Dumbbell Press", { equipment: "dumbbell" }),
    N("Decline Dumbbell Press", { equipment: "dumbbell" }),
    N("Dumbbell Squeeze Press", { equipment: "dumbbell" }),
    N("Machine Chest Press", { equipment: "machine" }),
    N("Incline Machine Chest Press", { equipment: "machine" }),
    N("Plate-Loaded Chest Press", { equipment: "machine" }),
    N("Smith Machine Bench Press", { equipment: "machine" }),
    N("Smith Machine Incline Press", { equipment: "machine" }),
    N("Cable Chest Press", { equipment: "cable" }),
    N("Cable Fly", { equipment: "cable", aliases: ["fly", "flye"] }),
    N("Low-to-High Cable Fly", { equipment: "cable" }),
    N("High-to-Low Cable Fly", { equipment: "cable" }),
    N("Pec Deck", { equipment: "machine", aliases: ["machine fly", "pec dec"] }),
    N("Push-Up", { equipment: "bodyweight", load: false, bw: 0.64, aliases: ["pushup", "press up"] }),
    N("Weighted Push-Up", { equipment: "bodyweight", bw: 0.64 }),
    N("Dip — Chest Emphasis", { equipment: "bodyweight", bw: 1, aliases: ["chest dip"] }),
    /*
      "I trained back for an hour."

      A whole session is a thing people did, and until now the catalogue had no
      word for one — every entry was a single movement. That is fine while you
      are logging as you go and useless the next morning, when what you want to
      record is that Tuesday evening was legs. It is also the vocabulary
      Confirm Activity already asks in (`WORKOUT_FOCUSES`), so the two now
      agree rather than each having their own list.

      Tracked in time and carrying its category's real load, so a session
      recorded this way weighs the same in terrain as one logged set by set.
    */
    N("Chest Session", { tracking: "duration", load: false, aliases: ["chest day"] }),
  ],
  back: [
    N("Conventional Deadlift", { pattern: "hinge", orm: true, aliases: ["deadlift", "dl"] }),
    N("Rack Pull", { pattern: "hinge", orm: true }),
    N("Barbell Row", { aliases: ["bent over row", "bb row"] }),
    N("Pendlay Row", {}),
    N("T-Bar Row", { equipment: "machine" }),
    N("Chest-Supported T-Bar Row", { equipment: "machine" }),
    N("Dumbbell Row", { equipment: "dumbbell", uni: true, aliases: ["db row", "one arm row"] }),
    N("Chest-Supported Dumbbell Row", { equipment: "dumbbell" }),
    N("Meadows Row", { uni: true }),
    N("Seal Row", {}),
    N("Machine Row", { equipment: "machine" }),
    N("Plate-Loaded Row", { equipment: "machine" }),
    N("Iso-Lateral Row", { equipment: "machine", uni: true }),
    N("Seated Cable Row", { equipment: "cable", aliases: ["cable row"] }),
    N("Wide-Grip Cable Row", { equipment: "cable" }),
    N("Single-Arm Cable Row", { equipment: "cable", uni: true }),
    N("Lat Pulldown", { equipment: "cable", aliases: ["pulldown", "lats"] }),
    N("Neutral-Grip Lat Pulldown", { equipment: "cable" }),
    N("Close-Grip Lat Pulldown", { equipment: "cable" }),
    N("Single-Arm Lat Pulldown", { equipment: "cable", uni: true }),
    N("Straight-Arm Pulldown", { equipment: "cable" }),
    N("Machine Pullover", { equipment: "machine" }),
    N("Dumbbell Pullover", { equipment: "dumbbell" }),
    N("Pull-Up", { equipment: "bodyweight", load: false, bw: 1, aliases: ["pullup"] }),
    N("Chin-Up", { equipment: "bodyweight", load: false, bw: 1, aliases: ["chinup"] }),
    N("Assisted Pull-Up", { equipment: "machine", bw: 1 }),
    N("Weighted Pull-Up", { equipment: "bodyweight", bw: 1 }),
    N("Back Session", { tracking: "duration", load: false, aliases: ["back day"] }),
  ],
  shoulders: [
    N("Barbell Overhead Press", { orm: true, aliases: ["ohp", "overhead press", "military press"] }),
    N("Seated Barbell Shoulder Press", {}),
    N("Dumbbell Shoulder Press", { equipment: "dumbbell" }),
    N("Arnold Press", { equipment: "dumbbell" }),
    N("Machine Shoulder Press", { equipment: "machine" }),
    N("Plate-Loaded Shoulder Press", { equipment: "machine" }),
    N("Smith Machine Shoulder Press", { equipment: "machine" }),
    N("Dumbbell Lateral Raise", { equipment: "dumbbell", aliases: ["lat raise", "side raise"] }),
    N("Seated Lateral Raise", { equipment: "dumbbell" }),
    N("Leaning Lateral Raise", { equipment: "dumbbell", uni: true }),
    N("Cable Lateral Raise", { equipment: "cable", uni: true }),
    N("Behind-the-Back Cable Lateral Raise", { equipment: "cable", uni: true }),
    N("Machine Lateral Raise", { equipment: "machine" }),
    N("Dumbbell Front Raise", { equipment: "dumbbell" }),
    N("Cable Front Raise", { equipment: "cable" }),
    N("Rear-Delt Dumbbell Fly", { equipment: "dumbbell", pattern: "pull", aliases: ["rear delt"] }),
    N("Reverse Pec Deck", { equipment: "machine", pattern: "pull" }),
    N("Cable Rear-Delt Fly", { equipment: "cable", pattern: "pull" }),
    N("Face Pull", { equipment: "cable", pattern: "pull" }),
    N("Upright Row", { pattern: "pull" }),
    N("Shoulder Session", { tracking: "duration", load: false, aliases: ["shoulder day"] }),
  ],
  arms: [
    N("Barbell Curl", { aliases: ["bb curl", "curl"] }),
    N("EZ-Bar Curl", {}),
    N("Dumbbell Curl", { equipment: "dumbbell" }),
    N("Alternating Dumbbell Curl", { equipment: "dumbbell", uni: true }),
    N("Incline Dumbbell Curl", { equipment: "dumbbell" }),
    N("Hammer Curl", { equipment: "dumbbell", aliases: ["hammers"] }),
    N("Cross-Body Hammer Curl", { equipment: "dumbbell", uni: true }),
    N("Preacher Curl", {}),
    N("Machine Preacher Curl", { equipment: "machine" }),
    N("Cable Curl", { equipment: "cable" }),
    N("Bayesian Cable Curl", { equipment: "cable", uni: true }),
    N("Spider Curl", { equipment: "dumbbell" }),
    N("Concentration Curl", { equipment: "dumbbell", uni: true }),
    N("Reverse Curl", {}),
    N("Zottman Curl", { equipment: "dumbbell" }),
    N("Wrist Curl", { equipment: "dumbbell" }),
    N("Reverse Wrist Curl", { equipment: "dumbbell" }),
    N("Wrist Roller", { equipment: "other", tracking: "duration" }),
    N("Close-Grip Bench Press", { pattern: "push", orm: true, aliases: ["cgbp"] }),
    N("Skull Crusher", { pattern: "push", aliases: ["lying triceps extension"] }),
    N("EZ-Bar Skull Crusher", { pattern: "push" }),
    N("Dumbbell Skull Crusher", { equipment: "dumbbell", pattern: "push" }),
    N("Cable Pushdown", { equipment: "cable", pattern: "push", aliases: ["pushdown", "tricep pushdown"] }),
    N("Rope Pushdown", { equipment: "cable", pattern: "push" }),
    N("Reverse-Grip Pushdown", { equipment: "cable", pattern: "push" }),
    N("Overhead Cable Extension", { equipment: "cable", pattern: "push" }),
    N("Overhead Rope Extension", { equipment: "cable", pattern: "push" }),
    N("Dumbbell Overhead Extension", { equipment: "dumbbell", pattern: "push" }),
    N("Single-Arm Cable Extension", { equipment: "cable", pattern: "push", uni: true }),
    N("Machine Triceps Extension", { equipment: "machine", pattern: "push" }),
    N("Dip — Triceps Emphasis", { equipment: "bodyweight", pattern: "push", bw: 1, aliases: ["dip"] }),
    N("Arm Session", { tracking: "duration", load: false, aliases: ["arm day"] }),
  ],
  legs: [
    N("Back Squat", { orm: true, aliases: ["squat", "bb squat"] }),
    N("Front Squat", { orm: true }),
    N("High-Bar Squat", { orm: true }),
    N("Low-Bar Squat", { orm: true }),
    N("Goblet Squat", { equipment: "dumbbell" }),
    N("Smith Machine Squat", { equipment: "machine" }),
    N("Hack Squat", { equipment: "machine" }),
    N("Pendulum Squat", { equipment: "machine" }),
    N("Belt Squat", { equipment: "machine" }),
    N("Leg Press", { equipment: "machine", aliases: ["press"] }),
    N("Horizontal Leg Press", { equipment: "machine" }),
    N("Single-Leg Press", { equipment: "machine", uni: true }),
    N("Leg Extension", { equipment: "machine", aliases: ["quad extension"] }),
    N("Single-Leg Extension", { equipment: "machine", uni: true }),
    N("Bulgarian Split Squat", { equipment: "dumbbell", uni: true, aliases: ["bss", "split squat"] }),
    N("Walking Lunge", { equipment: "dumbbell", uni: true }),
    N("Reverse Lunge", { equipment: "dumbbell", uni: true }),
    N("Forward Lunge", { equipment: "dumbbell", uni: true }),
    N("Step-Up", { equipment: "dumbbell", uni: true }),
    N("Romanian Deadlift", { pattern: "hinge", orm: true, aliases: ["rdl"] }),
    N("Dumbbell Romanian Deadlift", { equipment: "dumbbell", pattern: "hinge" }),
    /*
      The loaded single-leg hinge, which the catalogue did not have.

      Searching "rdl" returned Landmine RDL, Romanian Deadlift, and
      **Single-Leg RDL Reach** — a bodyweight balance drill tracked in seconds.
      A member doing 35 lb × 13 per side was offered a movement that takes no
      load and counts no reps, so the only way to log the work was to invent a
      movement, which produced a `full_body`, `equipment: other`, bilateral row
      that will never graph against anything.

      Unilateral, because that is the whole point of it, and it is what makes
      the "per side" label appear on the set row.
    */
    N("Single-Leg Romanian Deadlift", {
      equipment: "dumbbell",
      pattern: "hinge",
      uni: true,
      aliases: ["single leg rdl", "sl rdl", "single-leg rdl", "one leg rdl", "b stance rdl"],
    }),
    N("Stiff-Leg Deadlift", { pattern: "hinge" }),
    N("Good Morning", { pattern: "hinge" }),
    N("Seated Leg Curl", { equipment: "machine", pattern: "hinge" }),
    N("Lying Leg Curl", { equipment: "machine", pattern: "hinge" }),
    N("Standing Leg Curl", { equipment: "machine", pattern: "hinge", uni: true }),
    N("Nordic Hamstring Curl", { equipment: "bodyweight", pattern: "hinge", load: false, bw: 0.6 }),
    N("Leg Session", { tracking: "duration", load: false, aliases: ["leg day"] }),
  ],
  glutes: [
    N("Barbell Hip Thrust", { orm: true, aliases: ["hip thrust"] }),
    N("Machine Hip Thrust", { equipment: "machine" }),
    N("Glute Bridge", { equipment: "bodyweight", load: false }),
    N("Cable Kickback", { equipment: "cable", uni: true }),
    N("Machine Glute Kickback", { equipment: "machine", uni: true }),
    N("Hip Abduction Machine", { equipment: "machine", aliases: ["abduction"] }),
    N("Hip Adduction Machine", { equipment: "machine", aliases: ["adduction"] }),
    N("Glute Session", { tracking: "duration", load: false, aliases: ["glute day"] }),
  ],
  calves: [
    N("Standing Calf Raise", { equipment: "machine", aliases: ["calf raise"] }),
    N("Seated Calf Raise", { equipment: "machine" }),
    N("Leg Press Calf Raise", { equipment: "machine" }),
    N("Hack Squat Calf Raise", { equipment: "machine" }),
    N("Smith Machine Calf Raise", { equipment: "machine" }),
    N("Single-Leg Calf Raise", { equipment: "bodyweight", uni: true, bw: 1 }),
    N("Donkey Calf Raise", { equipment: "machine" }),
    N("Tibialis Raise", { equipment: "bodyweight", load: false }),
    N("Tibialis Machine", { equipment: "machine" }),
  ],
  core: [
    N("Crunch", { equipment: "bodyweight" }),
    N("Cable Crunch", { equipment: "cable", load: true }),
    N("Machine Crunch", { equipment: "machine", load: true }),
    N("Reverse Crunch", { equipment: "bodyweight" }),
    N("Decline Sit-Up", { equipment: "bodyweight" }),
    N("Hanging Knee Raise", { equipment: "bodyweight" }),
    N("Hanging Leg Raise", { equipment: "bodyweight" }),
    N("Captain's Chair Leg Raise", { equipment: "machine" }),
    N("Ab Wheel Rollout", { equipment: "other" }),
    N("Plank", { equipment: "bodyweight", tracking: "duration" }),
    N("Side Plank", { equipment: "bodyweight", tracking: "duration", uni: true }),
    N("Dead Bug", { equipment: "bodyweight" }),
    N("Bird Dog", { equipment: "bodyweight", uni: true }),
    N("Hollow Body Hold", { equipment: "bodyweight", tracking: "duration" }),
    N("Pallof Press", { equipment: "cable", load: true, uni: true }),
    N("Cable Wood Chop", { equipment: "cable", load: true, uni: true }),
    N("Cable Lift", { equipment: "cable", load: true, uni: true }),
    N("Russian Twist", { equipment: "other" }),
    N("Core Session", { tracking: "duration", load: false, aliases: ["core day"] }),
  ],
  full_body: [
    N("Full Body Session", { aliases: ["full body day", "strength session", "workout"] }),
  ],
  carry: [
    N("Farmer's Carry", { equipment: "dumbbell", aliases: ["farmers walk"] }),
    N("Suitcase Carry", { equipment: "dumbbell", uni: true }),
    N("Front Rack Carry", { equipment: "barbell" }),
    N("Overhead Carry", { equipment: "dumbbell" }),
    N("Zercher Carry", { equipment: "barbell" }),
    N("Sled Push", { equipment: "sled" }),
    N("Sled Drag", { equipment: "sled" }),
    N("Backward Sled Drag", { equipment: "sled" }),
    N("Bear Crawl", { equipment: "bodyweight", load: false }),
    N("Crab Walk", { equipment: "bodyweight", load: false }),
  ],
  kettlebell: [
    N("Kettlebell Swing", { equipment: "kettlebell", aliases: ["kb swing", "swing"] }),
    N("Single-Arm Kettlebell Swing", { equipment: "kettlebell", uni: true }),
    N("Kettlebell Clean", { equipment: "kettlebell", uni: true }),
    N("Kettlebell Press", { equipment: "kettlebell", pattern: "push", uni: true }),
    N("Kettlebell Clean & Press", { equipment: "kettlebell", uni: true }),
    N("Kettlebell Snatch", { equipment: "kettlebell", uni: true }),
    N("Turkish Get-Up", { equipment: "kettlebell", uni: true }),
    N("Kettlebell Goblet Squat", { equipment: "kettlebell", pattern: "squat" }),
    N("Kettlebell Deadlift", { equipment: "kettlebell" }),
    N("Kettlebell Windmill", { equipment: "kettlebell", uni: true }),
  ],
  explosive: [
    N("Box Jump", { equipment: "bodyweight" }),
    N("Broad Jump", { equipment: "bodyweight" }),
    N("Squat Jump", { equipment: "bodyweight" }),
    N("Jump Lunge", { equipment: "bodyweight", uni: true }),
    N("Medicine Ball Slam", { equipment: "other" }),
    N("Rotational Medicine Ball Throw", { equipment: "other", uni: true }),
  ],
  cardio: [
    N("Battle Ropes", { equipment: "other" }),
    N("SkiErg", { equipment: "machine" }),
    N("Rowing Ergometer", { equipment: "machine", aliases: ["rower", "erg"] }),
    N("Assault Bike", { equipment: "machine", aliases: ["air bike", "echo bike"] }),
    N("Treadmill Run", { equipment: "machine", tracking: "distance" }),
    N("Outdoor Run", { equipment: "bodyweight", tracking: "distance", aliases: ["run"] }),
    N("Incline Walk", { equipment: "machine", aliases: ["ruck", "walk"] }),
    N("Stair Climber", { equipment: "machine" }),
    N("Jump Rope", { equipment: "other", aliases: ["skipping"] }),
  ],
  mobility: [
    N("Couch Stretch", { uni: true }),
    N("Half-Kneeling Hip Flexor Stretch", { uni: true }),
    N("90/90 Hip Switch"),
    N("90/90 Hip Stretch", { uni: true }),
    N("Pigeon Stretch", { uni: true }),
    N("Figure-Four Stretch", { uni: true }),
    N("Frog Stretch"),
    N("Butterfly Stretch"),
    N("Adductor Rockback"),
    N("Cossack Squat", { tracking: "reps", uni: true }),
    N("Deep Squat Hold"),
    N("World's Greatest Stretch", { uni: true }),
    N("Standing Hamstring Stretch", { uni: true }),
    N("Pancake Stretch"),
    N("Quad Stretch", { uni: true }),
    N("Calf Wall Stretch", { uni: true }),
    N("Ankle Dorsiflexion Mobilisation", { uni: true }),
    N("Knee-to-Wall Ankle Mobilisation", { uni: true }),
    N("Cat-Cow"),
    N("Child's Pose"),
    N("Cobra"),
    N("Thoracic Extension"),
    N("Thoracic Rotation", { uni: true }),
    N("Open Book", { uni: true }),
    N("Thread the Needle", { uni: true }),
    N("Supine Spinal Twist", { uni: true }),
    N("Jefferson Curl", { tracking: "reps", load: true }),
    N("Segmented Spinal Roll"),
    N("Doorway Pec Stretch", { uni: true }),
    N("Lat Stretch", { uni: true }),
    N("Bench Lat Stretch"),
    N("Overhead Triceps Stretch", { uni: true }),
    N("Cross-Body Shoulder Stretch", { uni: true }),
    N("Sleeper Stretch", { uni: true }),
    N("Shoulder CARs", { tracking: "reps", uni: true }),
    N("Scapular CARs", { tracking: "reps" }),
    N("Wall Slides", { tracking: "reps" }),
    N("Scapular Push-Ups", { tracking: "reps" }),
    N("Dead Hang"),
    N("Active Hang"),
  ],
  fascia: [
    N("Rebounding"),
    N("Pogo Hops", { tracking: "reps" }),
    N("Low Pogo Hops", { tracking: "reps" }),
    N("Single-Leg Pogo", { tracking: "reps", uni: true }),
    N("Lateral Pogo", { tracking: "reps", uni: true }),
    N("Rhythm Bounces"),
    N("Heel Bounces"),
    N("Whole-Body Shaking", { aliases: ["shake", "shaking"] }),
    N("Loose Limb Shaking"),
    N("Elastic Arm Swings"),
    N("Cross-Body Arm Swings"),
    N("Pendulum Arm Swings"),
    N("Rotational Bounces"),
    N("Standing Spiral Rotation"),
    N("Walking Spiral"),
    N("Contralateral Walking"),
    N("Crawling"),
    N("Lateral Crawl"),
    N("Loaded Pancake", { load: true }),
    N("Cossack Flow"),
    N("Deep Squat Flow"),
    N("Lunge + Rotation", { uni: true }),
    N("Side Bend Reach", { uni: true }),
    N("Standing Lateral Line Stretch", { uni: true }),
    N("Cross-Body Chain Stretch", { uni: true }),
    N("Spiral Line Stretch", { uni: true }),
    N("Hanging Lateral Stretch", { uni: true }),
    N("Hanging Rotation", { uni: true }),
  ],
  tissue: [
    N("Foam Roll — Calves", { equipment: "other" }),
    N("Foam Roll — Quads", { equipment: "other" }),
    N("Foam Roll — Hamstrings", { equipment: "other" }),
    N("Foam Roll — Glutes", { equipment: "other" }),
    N("Foam Roll — Adductors", { equipment: "other" }),
    N("Foam Roll — IT-Band Region", { equipment: "other" }),
    N("Foam Roll — Thoracic Spine", { equipment: "other" }),
    N("Foam Roll — Lats", { equipment: "other" }),
    N("Lacrosse Ball — Feet", { equipment: "other" }),
    N("Lacrosse Ball — Glutes", { equipment: "other" }),
    N("Lacrosse Ball — Pec", { equipment: "other" }),
    N("Lacrosse Ball — Upper Back", { equipment: "other" }),
    N("Massage Ball — Hip", { equipment: "other" }),
    N("Peanut Ball — Spine", { equipment: "other" }),
    N("Foot Rolling", { equipment: "other" }),
  ],
  breath: [
    N("Crocodile Breathing"),
    N("90/90 Breathing"),
    N("Supine Diaphragmatic Breathing"),
    N("Child's Pose Breathing"),
    N("Deep Squat Breathing"),
    N("Dead Hang Breathing"),
    N("Rib Expansion Breathing"),
    N("Lateral Rib Breathing"),
    N("Cat-Cow + Breath"),
    N("Segmental Breathing"),
    N("Box Breathing"),
    N("Extended-Exhale Breathing"),
    N("Walking Breath Practice"),
  ],
  olympic: [
    N("Power Clean", { orm: true, aliases: ["clean"] }),
    N("Hang Clean"), N("Clean & Jerk"), N("Power Snatch", { aliases: ["snatch"] }),
    N("Hang Snatch"), N("Push Press", { pattern: "push" }), N("Push Jerk", { pattern: "push" }),
    N("High Pull"), N("Clean Pull"), N("Snatch Pull"),
  ],
  landmine: [
    N("Landmine Press", { uni: true }), N("Single-Arm Landmine Press", { uni: true }),
    N("Landmine Row", { pattern: "pull" }), N("Landmine Squat", { pattern: "squat" }),
    N("Landmine RDL", { pattern: "hinge" }),
    N("Landmine Rotation", { pattern: "rotation", uni: true }),
    N("Landmine Lunge", { pattern: "squat", uni: true }),
  ],
  calisthenics: [
    N("Inverted Row", { aliases: ["australian pull-up"] }), N("Pike Push-Up", { pattern: "push" }),
    N("Handstand Push-Up", { pattern: "push", aliases: ["hspu"] }),
    N("Handstand Hold", { pattern: "isometric", tracking: "duration" }),
    N("L-Sit", { pattern: "isometric", tracking: "duration" }),
    N("Muscle-Up"), N("Scapular Pull-Up"),
    N("Reverse Nordic", { pattern: "squat" }), N("Sissy Squat", { pattern: "squat" }),
    N("Shrimp Squat", { pattern: "squat", uni: true }),
    N("Pistol Squat", { pattern: "squat", uni: true }),
  ],
  rings: [
    N("Ring Support Hold", { pattern: "isometric", tracking: "duration" }),
    N("Ring Push-Up", { pattern: "push" }), N("Ring Fly", { pattern: "push" }),
    N("Ring Fallout", { pattern: "core" }), N("Ring Row"), N("Ring Dip", { pattern: "push" }),
    N("Skin the Cat"), N("German Hang", { tracking: "duration" }),
    N("Front-Lever Progression", { tracking: "duration" }),
    N("Back-Lever Progression", { tracking: "duration" }),
  ],
  neck_grip: [
    N("Barbell Shrug", { equipment: "barbell", pattern: "pull", aliases: ["shrug"] }),
    N("Dumbbell Shrug", { equipment: "dumbbell", pattern: "pull" }),
    N("Machine Shrug", { equipment: "machine", pattern: "pull" }),
    N("Cable Shrug", { equipment: "cable", pattern: "pull" }),
    N("Neck Flexion", { tracking: "reps" }), N("Neck Extension", { tracking: "reps" }),
    N("Neck Lateral Flexion", { tracking: "reps", uni: true }),
    N("Plate Pinch", { tracking: "duration" }), N("Towel Hang", { tracking: "duration", load: false }),
    N("Farmer Hold", { tracking: "duration" }), N("Gripper Work", { tracking: "reps" }),
  ],
  feet: [
    N("Short-Foot Exercise"), N("Toe Yoga"), N("Toe Spreading"), N("Big-Toe Extension"),
    N("Foot Doming"), N("Barefoot Balance", { uni: true }),
    N("Soleus Raise", { tracking: "reps" }), N("Calf Isometric", { pattern: "isometric" }),
  ],
  rotation: [
    N("Cable Rotation", { uni: true }), N("Cable Chop", { uni: true }), N("Cable Lift Rotation", { uni: true }),
    N("Rotational Lunge", { equipment: "bodyweight", load: false, uni: true }),
    N("Split-Stance Rotation", { equipment: "bodyweight", load: false, uni: true }),
    N("Cable External Rotation", { uni: true }), N("Cable Internal Rotation", { uni: true }),
    N("Cable Y-Raise"), N("Cable Pull-Through", { pattern: "hinge" }),
    N("Cable Upright Row", { pattern: "pull" }),
  ],
  isometric: [
    N("Wall Sit"), N("Split-Squat Hold", { uni: true }), N("Horse Stance"),
    N("Glute Bridge Hold"), N("Copenhagen Hold", { uni: true }),
    N("Push-Up Hold"), N("Pull-Up Hold"), N("Calf Hold"),
  ],
  balance: [
    N("Single-Leg Balance", { uni: true }), N("Single-Leg Reach", { uni: true }),
    N("Airplane", { uni: true }), N("Balance Board", { equipment: "other" }),
    N("Bosu Balance", { equipment: "other" }), N("Single-Leg RDL Reach", { uni: true }),
  ],
  plyometric: [
    N("Depth Jump"), N("Drop Jump"), N("Lateral Bound", { uni: true }),
    N("Skater Jump", { uni: true }), N("Single-Leg Hop", { uni: true }),
    N("Bounds"), N("Hurdle Hop"),
  ],
  agility: [
    N("Lateral Shuffle"), N("Carioca"), N("Cone Drill"), N("Ladder Drill"),
    N("Shuttle Run", { tracking: "distance" }), N("5-10-5 Drill"), N("T-Drill"),
    N("Deceleration Drill"), N("Backward Running", { tracking: "distance" }),
    N("Footwork Drill"), N("Reaction Drill"),
  ],
  // Drill-level running. Walking, hiking, rucking, cycling and swimming used
  // to sit here too and have moved to `endurance` below, where they are what
  // they actually are — a session with a duration, not a movement with sets.
  locomotion: [
    N("Sprinting", { aliases: ["sprints"] }),
    N("Acceleration Sprint"), N("Flying Sprint"), N("Hill Sprint"),
    N("Resisted Sprint", { equipment: "sled" }),
    N("Stair Climbing"), N("Skipping"),
  ],
  ground: [
    N("Leopard Crawl"), N("Ape"), N("Beast Hold"), N("Beast Reach"),
    N("Frogger"), N("Lizard Crawl"), N("Duck Walk"),
  ],
  yoga: [
    N("Downward Dog"), N("Upward Dog"), N("Low Lunge", { uni: true }),
    N("Warrior I", { uni: true }), N("Warrior II", { uni: true }),
    N("Triangle Pose", { uni: true }), N("Garland Squat"), N("Happy Baby"),
    N("Puppy Pose"), N("Sphinx Pose"), N("Legs-Up-the-Wall"),
  ],
  somatic: [
    N("Pandiculation"), N("Pelvic Rocking"), N("Spinal Waves"), N("Undulation"),
    N("Freeform Movement"), N("Constructive Rest"), N("Elastic Pulsing"),
    N("Oscillatory Squat"), N("Multi-Planar Bouncing"),
  ],
  /**
   * ── Pilates, on the mat and on the apparatus ──────────────────────────
   *
   * Here so a Sakred-programmed sequence can name the actual work — "Short
   * Spine, then Long Stretch, then Knee Stretches" — and a member following
   * one can tick it off. Nobody in a class logs these, and nobody should:
   * that is what `Reformer Pilates — 45 min` in the practices below is for.
   *
   * Reps rather than duration because Pilates is counted in the room ("ten
   * more, five, four…"), and no load at all: the resistance is a spring, and
   * springs are named by colour, not kilograms. A kilogram box on Short Spine
   * would be the same mistake as one on a couch stretch.
   */
  pilates: [
    // Mat — the classical order, which is the order it is taught in.
    N("Pilates Hundred", { aliases: ["hundred"] }),
    N("Roll-Up"), N("Roll-Over"), N("Rolling Like a Ball"),
    N("Single-Leg Stretch", { uni: true }), N("Double-Leg Stretch"),
    N("Single Straight-Leg Stretch", { uni: true, aliases: ["scissors"] }),
    N("Criss-Cross", { aliases: ["bicycle"] }),
    N("Spine Stretch Forward"), N("Open-Leg Rocker"), N("Corkscrew"),
    N("Saw"), N("Swan"), N("Single-Leg Kick", { uni: true }), N("Double-Leg Kick"),
    N("Neck Pull"), N("Shoulder Bridge"), N("Spine Twist"),
    N("Teaser"), N("Pilates Swimming"), N("Leg Pull Front"), N("Leg Pull Back"),
    N("Side-Kick Series", { uni: true }), N("Pilates Leg Circles", { uni: true }),
    N("Mermaid", { uni: true }), N("Boomerang"), N("Seal"),
    N("Pilates Push-Up"), N("Pilates Plank Series", { tracking: "duration" }),
    N("Pilates Ring Squeeze", { equipment: "pilates_ring", aliases: ["magic circle"] }),
    N("Pilates Ring Arm Press", { equipment: "pilates_ring" }),

    // Reformer.
    N("Reformer Footwork", { equipment: "reformer", aliases: ["footwork"] }),
    N("Reformer Hundred", { equipment: "reformer" }),
    N("Reformer Leg Circles", { equipment: "reformer" }),
    N("Reformer Frog", { equipment: "reformer" }),
    N("Reformer Short Spine", { equipment: "reformer" }),
    N("Reformer Long Spine", { equipment: "reformer" }),
    N("Reformer Coordination", { equipment: "reformer" }),
    N("Reformer Rowing", { equipment: "reformer" }),
    N("Reformer Arm Series", { equipment: "reformer" }),
    N("Reformer Pulling Straps", { equipment: "reformer" }),
    N("Reformer Long Box Backstroke", { equipment: "reformer" }),
    N("Reformer Short Box Series", { equipment: "reformer" }),
    N("Reformer Stomach Massage", { equipment: "reformer" }),
    N("Reformer Long Stretch", { equipment: "reformer" }),
    N("Reformer Down Stretch", { equipment: "reformer" }),
    N("Reformer Up Stretch", { equipment: "reformer" }),
    N("Reformer Elephant", { equipment: "reformer" }),
    N("Reformer Knee Stretches", { equipment: "reformer" }),
    N("Reformer Scooter", { equipment: "reformer", uni: true }),
    N("Reformer Lunge", { equipment: "reformer", uni: true, aliases: ["reformer lunges"] }),
    N("Reformer Side Splits", { equipment: "reformer" }),
    N("Reformer Front Splits", { equipment: "reformer", uni: true }),
    N("Reformer Mermaid", { equipment: "reformer", uni: true }),
    N("Reformer Semi-Circle", { equipment: "reformer" }),
    N("Reformer Tendon Stretch", { equipment: "reformer" }),
    N("Reformer Snake & Twist", { equipment: "reformer" }),

    // Cadillac / Trapeze, Chair, Spine Corrector, Barrel.
    N("Cadillac Roll-Down", { equipment: "cadillac", aliases: ["trapeze table"] }),
    N("Cadillac Leg Springs", { equipment: "cadillac" }),
    N("Cadillac Arm Springs", { equipment: "cadillac" }),
    N("Cadillac Push-Through Bar", { equipment: "cadillac" }),
    N("Cadillac Hanging Series", { equipment: "cadillac", tracking: "duration" }),
    N("Chair Pumping", { equipment: "chair", aliases: ["wunda chair"] }),
    N("Chair Push-Down", { equipment: "chair" }),
    N("Chair Step-Up", { equipment: "chair", uni: true }),
    N("Chair Mountain Climber", { equipment: "chair", uni: true }),
    N("Chair Teaser", { equipment: "chair" }),
    N("Spine Corrector Arc", { equipment: "spine_corrector" }),
    N("Ladder Barrel Swan", { equipment: "barrel" }),
  ],

  /**
   * Lagree. Timed, not counted — the whole method is slow tempo under constant
   * tension, and a rep count would describe none of what makes it hard.
   */
  lagree: [
    N("Lagree Bear", { aliases: ["bear"] }),
    N("Lagree Wheelbarrow"), N("Lagree Pike"), N("Lagree Plank"),
    N("Lagree Saw"), N("Lagree French Twist"), N("Lagree Catfish"),
    N("Lagree Elevator Lunge", { uni: true }),
    N("Lagree Giant Reverse Lunge", { uni: true }),
    N("Lagree Super Lunge", { uni: true }),
    N("Lagree Escalator", { uni: true }),
    N("Lagree Skating"), N("Lagree Carriage Kick", { uni: true }),
    N("Lagree Cobra"), N("Lagree Mermaid", { uni: true }),
    N("Lagree Scrambled Eggs"), N("Lagree Spoon"),
    N("Lagree Teaser"), N("Lagree Kneeling Kickback", { uni: true }),
    N("Lagree Wheel Barrow to Bear"), N("Lagree Serve the Platter"),
    N("Lagree Arm Series"), N("Lagree Oblique Series", { uni: true }),
  ],

  barre: [
    N("Barre Plié Series"), N("Barre Relevé"), N("Barre Curtsy Pulse", { uni: true }),
    N("Barre Attitude Lift", { uni: true }), N("Barre Arabesque Lift", { uni: true }),
    N("Barre Grand Battement", { uni: true }), N("Barre Passé Balance", { uni: true, tracking: "duration" }),
    N("Barre Chair Pose Pulse", { tracking: "duration" }),
    N("Barre Thigh Dancing", { tracking: "duration" }),
    N("Barre Seat Work"), N("Barre Ab Series"), N("Barre Port de Bras"),
    N("Barre Fold-Over", { uni: true }), N("Barre Clamshell", { uni: true }),
  ],

  corrective: [
    N("Chin Tuck"), N("Wall Angel"), N("Serratus Wall Slide"),
    N("Scapular Retraction"), N("Y-T-W Raises", { equipment: "dumbbell", load: true }),
    N("Hip Airplane", { uni: true }), N("Pelvic Tilt"), N("Pelvic Clock"),
    N("Bear Hold", { tracking: "duration" }), N("Copenhagen Plank", { tracking: "duration", uni: true }),
  ],
  recovery: [
    N("Easy Walk"), N("Recovery Bike", { equipment: "machine" }),
    N("Gentle Rebounding"), N("Passive Hang"), N("Supported Deep Squat"),
    N("Massage Gun", { equipment: "other" }), N("Mobility Stick", { equipment: "other" }),
  ],
  /**
   * ── Session-level, not movement-level ─────────────────────────────────
   *
   * Everything from here down is one row and one number: minutes. See the
   * note beside `isPracticeCategory` in the training model for why they share
   * a table with the movements rather than living somewhere of their own.
   *
   * The test for whether something belongs here is not how hard it is or how
   * structured it is — it is whether a person doing it has a free hand and a
   * reason to reach for their phone between efforts. In a class, on a court,
   * or forty minutes into a ride, they do not.
   */
  practice: [
    N("Yoga Flow"), N("Mobility Flow"), N("Fascial Flow"), N("Animal Flow"),
    N("Somatic Movement"), N("Dynamic Warm-Up"), N("Full-Body Stretch"),
    N("Upper-Body Mobility"), N("Lower-Body Mobility"), N("Hip Mobility"),
    N("Shoulder Mobility"), N("Spinal Mobility"), N("Recovery Session"),
    N("Breathwork Session"), N("Rebounding Session"), N("Sauna"),
    N("Cold Plunge"), N("Cooldown"), N("Custom Activity"),
  ],

  /**
   * Taught in a room by somebody else, on somebody else's clock.
   *
   * `Reformer Pilates` sits here while `Reformer Short Spine` sits up in the
   * studio movements, and that pair is the whole argument: the member who took
   * the class logs one line, the member following a Sakred sequence logs the
   * work. Neither is the more legitimate record of what happened.
   */
  class: [
    N("Mat Pilates", { aliases: ["pilates class"] }),
    N("Reformer Pilates", { equipment: "reformer", aliases: ["pilates reformer"] }),
    N("Cadillac Session", { equipment: "cadillac" }),
    N("Chair Session", { equipment: "chair" }),
    N("Lagree", { equipment: "megaformer", aliases: ["megaformer", "lagree class"] }),
    N("Barre Class", { equipment: "barre", aliases: ["barre"] }),
    N("Yoga Class", { aliases: ["yoga"] }),
    N("Vinyasa"), N("Hot Yoga", { aliases: ["bikram"] }), N("Yin Yoga"),
    N("Hatha Yoga"), N("Power Yoga"), N("Ashtanga"), N("Restorative Yoga"),
    N("Spin Class", { equipment: "machine", aliases: ["spin", "indoor cycling"] }),
    N("HIIT Class"), N("Bootcamp"), N("CrossFit Class", { aliases: ["wod", "crossfit"] }),
    N("Group Strength Class"), N("Aqua Fitness"),
    N("Dance Class"), N("Ballet Class", { aliases: ["ballet"] }),
    N("Contemporary Dance"), N("Reformer Sculpt"),
  ],

  /**
   * Played, not performed. Basketball is Basketball and ninety minutes, and
   * `Basketball Skills` exists for the member who genuinely wants to separate
   * a shooting session from a scrimmage — most will not, and are not asked to.
   */
  sport: [
    N("Basketball", { aliases: ["hoops", "ball"] }),
    N("Basketball Skills"), N("Soccer", { aliases: ["football"] }),
    N("Tennis"), N("Padel"), N("Pickleball"), N("Squash"), N("Badminton"),
    N("Table Tennis"), N("Golf"), N("Volleyball"), N("Beach Volleyball"),
    N("Baseball"), N("Softball"), N("American Football"), N("Rugby"),
    N("Ice Hockey"), N("Field Hockey"), N("Lacrosse"), N("Cricket"),
    N("Handball"), N("Ultimate Frisbee"), N("Water Polo"),
    N("Boxing", { aliases: ["boxing training"] }), N("Kickboxing"),
    N("Muay Thai"), N("Brazilian Jiu-Jitsu", { aliases: ["bjj", "jiu jitsu"] }),
    N("Judo"), N("Wrestling"), N("Karate"), N("Taekwondo"),
    N("Martial Arts"), N("MMA Training"), N("Fencing"),
    N("Rock Climbing", { aliases: ["climbing"] }), N("Bouldering"),
    N("Surfing"), N("Skateboarding"), N("Snowboarding"), N("Skiing"),
    N("Cross-Country Skiing"), N("Mountain Biking"), N("Kayaking"),
    N("Paddleboarding"), N("Sailing"), N("Horse Riding"),
    N("Parkour"), N("Gymnastics Practice"), N("Track & Field"),
    N("Sports Practice"), N("Pickup Game"),
  ],

  /**
   * Distance is optional and duration is not, because the one number everybody
   * has after a ride is how long they were out. A member who knows the miles
   * can add them; nobody is stopped from logging a walk for want of a GPS.
   */
  endurance: [
    N("Easy Run"), N("Long Run"), N("Tempo Run"), N("Interval Run"),
    N("Trail Run"), N("Bike Ride", { aliases: ["cycling", "bike"] }),
    N("Zone 2 Bike"), N("Long Ride"), N("Swim Session", { aliases: ["swim"] }),
    N("Open-Water Swim"), N("Row Session", { equipment: "machine", aliases: ["erg"] }),
    N("Hike", { aliases: ["hiking"] }), N("Ruck", { equipment: "other", aliases: ["rucking"] }),
    N("Walk", { aliases: ["walking"] }), N("Conditioning Session"),
    N("Zone 2 Session"), N("Sprint Session"),
  ],
};


/** Every catalogue row, with its category defaults applied. */
export function catalogueRows(): Row[] {
  const rows: Row[] = [];
  for (const [category, entries] of Object.entries(CATALOGUE)) {
    const base = DEFAULTS[category] ?? {};
    for (const e of entries) {
      rows.push({ equipment: "bodyweight", ...base, ...e, category } as Row);
    }
  }

  // A duplicate slug silently overwrites a different movement, and the pair
  // that collides is always two near-identical names — exactly the one nobody
  // would notice had gone missing.
  const seen = new Map<string, string>();
  for (const r of rows) {
    const id = slug(r.name);
    if (seen.has(id)) throw new Error(`Duplicate slug ${id}: "${seen.get(id)}" and "${r.name}"`);
    seen.set(id, r.name);
  }
  return rows;
}

/**
 * A `text[]` as one value rather than a list of them.
 *
 * Interpolating a JavaScript array into drizzle's `sql` template does not
 * produce an array — it expands into a comma-separated list, which Postgres
 * reads as a record: *column "aliases" is of type text[] but expression is of
 * type record*. The catalogue sync endpoint failed on exactly that for its
 * entire life, silently, because nothing had ever called it.
 *
 * Both consumers of this module render aliases, so the escaping rule lives
 * here rather than twice. It is the only interesting part: a backslash and a
 * double quote both have meaning inside `{...}`, and an alias containing
 * either would otherwise end its element early.
 */
export function arrayLiteral(values: string[] | undefined | null): string | null {
  if (!values?.length) return null;
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

export { slug };
