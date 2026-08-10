-- Health data from the phone — Apple Health and Health Connect.
--
-- See shared/models/health.ts for why this is long and narrow rather than a
-- wide health_days(steps, hrv, sleep_minutes, ...): the metric vocabulary is
-- the platforms' and it grows, and a new metric should be a string rather than
-- a migration that gets skipped.
--
-- The three unique indexes are the load-bearing part. Every sync re-reads a
-- trailing window, so the same day and the same workout arrive repeatedly;
-- without them a re-sync doubles a step count instead of updating it.

create table if not exists health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id varchar not null,
  platform text not null,
  granted_metrics text[],
  synced_through timestamp,
  last_sync_at timestamp,
  last_sync_count integer not null default 0,
  last_error text,
  device_model text,
  os_version text,
  revoked_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create unique index if not exists uq_health_connections
  on health_connections (user_id, platform);
create index if not exists idx_health_connections_user
  on health_connections (user_id);

create table if not exists health_days (
  id uuid primary key default gen_random_uuid(),
  user_id varchar not null,
  on_date date not null,
  metric text not null,
  value double precision not null,
  unit text not null,
  source text not null,
  source_app text,
  synced_at timestamp default now()
);

-- The idempotency key for a daily value.
create unique index if not exists uq_health_days
  on health_days (user_id, on_date, metric);
-- The read path: one member, one metric, over a date range.
create index if not exists idx_health_days_user_metric
  on health_days (user_id, metric, on_date);

create table if not exists health_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id varchar not null,
  external_id text not null,
  workout_type text,
  start_at timestamp not null,
  end_at timestamp,
  on_date date not null,
  duration_seconds integer,
  active_calories double precision,
  distance_meters double precision,
  avg_heart_rate double precision,
  max_heart_rate double precision,
  source text not null,
  source_app text,
  raw jsonb,
  synced_at timestamp default now()
);

-- The idempotency key for a session: the platform's own id for it.
create unique index if not exists uq_health_workouts
  on health_workouts (user_id, external_id);
create index if not exists idx_health_workouts_user_date
  on health_workouts (user_id, on_date);
