-- ═══════════════════════════════════════════════════════════════════════════
-- A starting catalogue
--
-- Universal movements, not Sakred Body content — "Back Squat" is not a brand
-- decision. The protocols, the sessions and what gets prescribed are yours;
-- this is just so the picker isn't empty on day one.
--
-- Weighted deliberately toward the heavy compounds, because that is what a
-- 2–8 rep programme is built from. Idempotent: re-running updates in place.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.exercises
  (id, name, pattern, equipment, tracking_type, bodyweight_factor, muscle_groups, aliases, tracks_one_rep_max, sort_order)
values
  -- Squat
  ('back-squat','Back Squat','squat','barbell','reps',0,array['Quads','Glutes'],array['squat','bb squat'],true,10),
  ('front-squat','Front Squat','squat','barbell','reps',0,array['Quads','Core'],array['fsq'],true,20),
  ('goblet-squat','Goblet Squat','squat','dumbbell','reps',0,array['Quads','Glutes'],array['goblet'],true,30),
  ('bulgarian-split-squat','Bulgarian Split Squat','squat','dumbbell','reps',0.6,array['Quads','Glutes'],array['bss','split squat'],true,40),

  -- Hinge
  ('deadlift','Deadlift','hinge','barbell','reps',0,array['Hamstrings','Back','Glutes'],array['dl','conventional deadlift'],true,50),
  ('trap-bar-deadlift','Trap Bar Deadlift','hinge','barbell','reps',0,array['Quads','Glutes','Back'],array['hex bar','trap bar'],true,60),
  ('romanian-deadlift','Romanian Deadlift','hinge','barbell','reps',0,array['Hamstrings','Glutes'],array['rdl'],true,70),
  ('hip-thrust','Hip Thrust','hinge','barbell','reps',0,array['Glutes'],array['thrust'],true,80),
  ('kettlebell-swing','Kettlebell Swing','hinge','kettlebell','reps',0,array['Glutes','Hamstrings'],array['kb swing','swing'],false,90),

  -- Push
  ('bench-press','Bench Press','push','barbell','reps',0,array['Chest','Triceps','Shoulders'],array['bench','bb bench','flat bench'],true,100),
  ('incline-bench-press','Incline Bench Press','push','barbell','reps',0,array['Chest','Shoulders'],array['incline'],true,110),
  ('overhead-press','Overhead Press','push','barbell','reps',0,array['Shoulders','Triceps'],array['ohp','press','strict press','military press'],true,120),
  ('dumbbell-bench-press','Dumbbell Bench Press','push','dumbbell','reps',0,array['Chest','Triceps'],array['db bench'],true,130),
  ('dip','Dip','push','bodyweight','reps',1.0,array['Chest','Triceps'],array['dips'],true,140),
  ('push-up','Push-Up','push','bodyweight','reps',0.64,array['Chest','Triceps'],array['pushup','press up'],false,150),

  -- Pull
  ('pull-up','Pull-Up','pull','bodyweight','reps',1.0,array['Back','Biceps'],array['pullup','chin up','chinup'],true,160),
  ('barbell-row','Barbell Row','pull','barbell','reps',0,array['Back','Biceps'],array['bb row','pendlay row','bent over row'],true,170),
  ('dumbbell-row','Dumbbell Row','pull','dumbbell','reps',0,array['Back','Biceps'],array['db row','single arm row'],true,180),
  ('lat-pulldown','Lat Pulldown','pull','cable','reps',0,array['Back','Biceps'],array['pulldown'],true,190),
  ('face-pull','Face Pull','pull','cable','reps',0,array['Shoulders','Back'],array['facepull'],false,200),

  -- Carry, core, conditioning — the ones that prove tracking_type matters
  ('farmer-carry','Farmer Carry','carry','dumbbell','distance',0,array['Forearms','Core'],array['farmers walk','farmers carry'],false,210),
  ('plank','Plank','core','bodyweight','duration',0.6,array['Core'],array['front plank'],false,220),
  ('hanging-leg-raise','Hanging Leg Raise','core','bodyweight','reps',0.5,array['Core'],array['hlr','leg raise'],false,230),
  ('ruck','Ruck','conditioning','other','distance',0,array['Cardio'],array['rucking','loaded carry walk'],false,240),
  ('row-erg','Rowing Machine','conditioning','machine','distance',0,array['Cardio','Back'],array['erg','concept2','rower'],false,250)
on conflict (id) do update set
  name              = excluded.name,
  pattern           = excluded.pattern,
  equipment         = excluded.equipment,
  tracking_type     = excluded.tracking_type,
  bodyweight_factor = excluded.bodyweight_factor,
  muscle_groups     = excluded.muscle_groups,
  aliases           = excluded.aliases,
  tracks_one_rep_max= excluded.tracks_one_rep_max,
  sort_order        = excluded.sort_order;
