-- ─── Sakred Body — schema baseline ────────────────────────────────────────
--
-- The state of `public` as of 16 Aug 2026, and the point every environment
-- starts from.
--
-- ── Why this file exists ──────────────────────────────────────────────────
--
-- It did not, and the absence was invisible until an audit went looking for a
-- QA environment. Production had 93 tables; the 32 tracked migrations could
-- create 32 of them. `users`, `workout_sessions`, `workout_sets`, `exercises`,
-- `habits` and `retreats` had no creating statement anywhere in the repository.
-- They were built by `drizzle-kit push`, which diffs against a live database
-- and applies — leaving the truth in production and the history nowhere.
--
-- So: the database could not be rebuilt from the repository. Not for a test
-- environment, and not after losing it.
--
-- ── The cutoff rule ───────────────────────────────────────────────────────
--
-- This baseline is the CURRENT schema, not a historical one. Everything in
-- `supabase_migrations.schema_migrations` dated on or before 20260815212610 is
-- PRE-BASELINE HISTORY: already contained here, and never replayed on top.
-- Replaying them would fail on tables this file has already created.
--
--     new environment  =  this baseline
--                      +  migrations AFTER the cutoff, in order
--                      +  the QA seed, if it is a QA environment
--
-- A migration added from now on is post-baseline and does replay. When this
-- file is next regenerated, move the cutoff with it and say so here.
--
-- ── How it is built ───────────────────────────────────────────────────────
--
--   01  tables, constraints and indexes for everything `shared/schema.ts`
--       defines — emitted by `drizzle-kit generate`, which reads the schema
--       files and writes SQL without touching a database. Regenerate with
--       `npm run db:baseline`.
--   02  four tables that exist in production and in migrations but were never
--       added to the Drizzle schema, so `generate` cannot see them. Introspected.
--   03  row-level security: enablement and every policy. Drizzle does not
--       model these at all, which is the other half of why push left no history.
--
-- Schema only. No rows, no member data, no PII.


CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"goals" text NOT NULL,
	"stress_level" text NOT NULL,
	"willingness" text NOT NULL,
	"constraints" text NOT NULL,
	"why_now" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"retreat_id" integer,
	"property_id" integer,
	"retreat_type" text DEFAULT 'shared' NOT NULL,
	"preferred_start_date" text,
	"preferred_end_date" text,
	"duration" integer DEFAULT 3,
	"housing_tier" text DEFAULT 'essential',
	"status" text DEFAULT 'requested' NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"special_requests" text,
	"concierge_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partner_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"price" integer,
	"price_unit" text DEFAULT 'per session',
	"duration" text,
	"image_url" text,
	"amenities" text[],
	"max_capacity" integer,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"website" text,
	"image_url" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"retreat_id" integer NOT NULL,
	"name" text NOT NULL,
	"tier" text NOT NULL,
	"description" text NOT NULL,
	"bedrooms" integer DEFAULT 1 NOT NULL,
	"bathrooms" integer DEFAULT 1 NOT NULL,
	"max_guests" integer DEFAULT 2 NOT NULL,
	"price_per_night" integer NOT NULL,
	"image_url" text,
	"amenities" text[],
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retreats" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"description" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"capacity" integer DEFAULT 12 NOT NULL,
	"emphasis" text,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" varchar NOT NULL,
	"platform" varchar,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"platform" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"is_admin" varchar DEFAULT 'false',
	"role" varchar DEFAULT 'member' NOT NULL,
	"sex" varchar,
	"relationship_status" varchar,
	"timezone" varchar DEFAULT 'UTC',
	"weight_unit" varchar DEFAULT 'lb' NOT NULL,
	"active_routine_id" varchar,
	"routine_intensity" varchar DEFAULT 'lite',
	"sakred_coins" integer DEFAULT 0,
	"current_streak" integer DEFAULT 0,
	"longest_streak" integer DEFAULT 0,
	"membership_tier" varchar DEFAULT 'free',
	"age_verified_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "coach_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_user_id" varchar NOT NULL,
	"member_user_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"assigned_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"user_id" varchar NOT NULL,
	"uploaded_by_user_id" varchar NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"original_filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"sender_role" text DEFAULT 'member' NOT NULL,
	"sender_user_id" varchar,
	"message_type" text DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"metadata" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "habit_routine_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"routine_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"user_routine_id" uuid,
	"routine_habit_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"scheduled_date" date NOT NULL,
	"day_number" integer,
	"is_from_routine" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"habit_id" uuid,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "routine_habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" text,
	"title" text NOT NULL,
	"short_description" text,
	"detailed_description" text,
	"description" text,
	"instructions" text,
	"science_explanation" text,
	"tips" text,
	"expect_to_notice" text,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"recommended_time" text,
	"duration_minutes" integer,
	"day_start" integer DEFAULT 1,
	"day_end" integer,
	"order_index" integer DEFAULT 0 NOT NULL,
	"intensity" text DEFAULT 'lite' NOT NULL,
	"icon" text,
	"emphasis" text,
	"tracking_type" text DEFAULT 'boolean' NOT NULL,
	"default_target" double precision,
	"health_metric" text,
	"polarity_strength" text DEFAULT 'strong' NOT NULL,
	"terrain_tags" text[],
	"search_keywords" text[],
	"is_free" boolean DEFAULT true NOT NULL,
	"copy_block_id" text,
	"habit_key" text,
	"load_class" text,
	"load_tags" text[],
	"priority_level" text,
	"max_per_week" integer,
	"terrain_fit" text,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_assigned_habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"routine_habit_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"recommended_time" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_removed_habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"user_routine_id" uuid,
	"routine_habit_id" uuid,
	"title" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"routine_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"intensity" text DEFAULT 'lite' NOT NULL,
	"paused_at" date,
	"client_request_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wellness_routines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"cover_image_url" text,
	"goal" text,
	"goal_description" text,
	"duration_days" integer DEFAULT 14 NOT NULL,
	"icon" text,
	"color" text,
	"tier" text DEFAULT 'free' NOT NULL,
	"category" text NOT NULL,
	"terrain_tags" text[],
	"search_keywords" text[],
	"who_is_this_for" text,
	"what_to_expect" text,
	"expected_results" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"routine_type" text,
	"copy_block_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "masterclass_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_image_url" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "masterclass_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "masterclass_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"thumbnail_url" text,
	"video_url" text NOT NULL,
	"duration" text,
	"instructor" text,
	"tags" text[],
	"search_keywords" text[],
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_category_subs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "executive_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"location" text,
	"occupation" text,
	"role" text,
	"answers" jsonb NOT NULL,
	"fit_score" integer DEFAULT 0 NOT NULL,
	"route" text DEFAULT 'nurture' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "habit_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"note" text,
	"is_essential" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"vendor" text,
	"price_cents" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"category" text NOT NULL,
	"description" text,
	"why_this_one" text,
	"sourcing_notes" text,
	"image_url" text,
	"price_cents" integer,
	"price_note" text,
	"terrain_tags" text[],
	"search_keywords" text[],
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "routine_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"phase" text DEFAULT 'prepare' NOT NULL,
	"note" text,
	"is_essential" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_shop_checkoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"product_id" uuid NOT NULL,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ebook_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"ebook_id" uuid NOT NULL,
	"source" text DEFAULT 'membership' NOT NULL,
	"granted_by" varchar,
	"granted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ebook_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"ebook_id" uuid NOT NULL,
	"section_id" uuid,
	"scroll_fraction" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ebook_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ebook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"audio_url" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"author" text,
	"description" text,
	"cover_url" text,
	"slug" text,
	"file_url" text,
	"promo_video_url" text,
	"category" text,
	"published_at" date,
	"unlocks_community" boolean DEFAULT false NOT NULL,
	"routine_id" text,
	"price_cents" integer,
	"access_mode" text DEFAULT 'membership' NOT NULL,
	"reading_minutes" integer,
	"audio_url" text,
	"search_keywords" text[],
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "centre_habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" text NOT NULL,
	"habit_id" uuid NOT NULL,
	"action" text DEFAULT 'moves' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "centre_routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" text NOT NULL,
	"routine_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "energy_centres" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aspect" text,
	"body_region" text,
	"element" text,
	"color_hex" text,
	"description" text,
	"when_blocked" text,
	"when_flowing" text,
	"axis_position" integer DEFAULT 50 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_centre_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"centre_id" text NOT NULL,
	"state" text NOT NULL,
	"note" text,
	"recorded_by" text DEFAULT 'member' NOT NULL,
	"recorded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_cosmology" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"birth_date" date,
	"birth_time" text,
	"birth_place" text,
	"birth_name" text,
	"y_overrides" jsonb,
	"polarity" text,
	"sun_sign" text,
	"moon_sign" text,
	"rising_sign" text,
	"life_path_number" integer,
	"expression_number" integer,
	"soul_urge_number" integer,
	"personality_number" integer,
	"disposition" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"bio" text,
	"avatar_url" text,
	"credentials" text[],
	"website" text,
	"instagram" text,
	"user_id" varchar,
	"kind" text DEFAULT 'internal' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "hosts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "offering_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"role" text DEFAULT 'lead' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offering_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"note" text,
	"review_note" text,
	"applied_at" timestamp with time zone DEFAULT now(),
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "offering_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"title" text NOT NULL,
	"agenda" text,
	"starts_at" timestamp with time zone,
	"duration_minutes" integer,
	"location" text,
	"meeting_url" text,
	"replay_url" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'mastermind' NOT NULL,
	"summary" text,
	"description" text,
	"cover_url" text,
	"start_date" date,
	"end_date" date,
	"format" text DEFAULT 'hybrid' NOT NULL,
	"location" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"registration_mode" text DEFAULT 'application' NOT NULL,
	"capacity" integer,
	"price_cents" integer,
	"price_note" text,
	"min_tier_rank" integer DEFAULT 0 NOT NULL,
	"meeting_url" text,
	"replay_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "offerings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"present" boolean DEFAULT true NOT NULL,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"surface" text,
	"subject_id" text,
	"props" jsonb DEFAULT '{}'::jsonb,
	"on_date" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"subject_id" text,
	"props" jsonb DEFAULT '{}'::jsonb,
	"earned_at" timestamp with time zone DEFAULT now(),
	"on_date" text,
	"shared_at" timestamp with time zone,
	"shared_message_id" uuid
);
--> statement-breakpoint
CREATE TABLE "daily_intentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"on_date" date NOT NULL,
	"intention" text NOT NULL,
	"met_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"on_date" date NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"invitation" text,
	"inputs" jsonb,
	"source" text DEFAULT 'model' NOT NULL,
	"model" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "frequencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hz" integer,
	"description" text,
	"audio_url" text NOT NULL,
	"duration_seconds" integer,
	"moment" text DEFAULT 'anytime' NOT NULL,
	"centre_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "channel_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"added_by" varchar,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"min_tier_rank" integer DEFAULT 0 NOT NULL,
	"offering_id" uuid,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_read_only" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "channels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"parent_id" uuid,
	"root_id" uuid,
	"depth" integer DEFAULT 0 NOT NULL,
	"body" text NOT NULL,
	"audio_url" text,
	"audio_mime" text,
	"audio_duration_seconds" integer,
	"deleted_at" timestamp,
	"edited_at" timestamp,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membership_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"description" text,
	"price_cents" integer,
	"price_note" text,
	"includes" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"identifier" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"on_date" date NOT NULL,
	"weight_kg" real,
	"height_cm" real,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pattern" text DEFAULT 'push' NOT NULL,
	"equipment" text DEFAULT 'barbell' NOT NULL,
	"category" text DEFAULT 'full_body' NOT NULL,
	"takes_load" boolean DEFAULT true NOT NULL,
	"unilateral" boolean DEFAULT false NOT NULL,
	"tracking_type" text DEFAULT 'reps' NOT NULL,
	"bodyweight_factor" real DEFAULT 0 NOT NULL,
	"muscle_groups" text[],
	"aliases" text[],
	"tracks_one_rep_max" boolean DEFAULT true NOT NULL,
	"demo_url" text,
	"cues" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"owner_user_id" varchar,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "habit_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_habit_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"target_sets" integer DEFAULT 3 NOT NULL,
	"target_reps_low" integer,
	"target_reps_high" integer,
	"target_percent_1rm" real,
	"rest_seconds" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "member_build_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"modalities" text[],
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "member_workout_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_workout_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"target_sets" integer DEFAULT 3 NOT NULL,
	"target_reps_low" integer,
	"target_reps_high" integer,
	"target_percent_1rm" real,
	"rest_seconds" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "member_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" text,
	"on_date" date NOT NULL,
	"note" text,
	"quality" text,
	"side" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"habit_id" uuid,
	"on_date" date NOT NULL,
	"title" text,
	"note" text,
	"duration_minutes" integer,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"habit_exercise_id" uuid,
	"set_index" integer DEFAULT 1 NOT NULL,
	"reps" integer,
	"duration_seconds" integer,
	"distance_m" real,
	"weight_kg" real DEFAULT 0 NOT NULL,
	"is_warmup" boolean DEFAULT false NOT NULL,
	"rpe" real,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" varchar NOT NULL,
	"message_id" uuid NOT NULL,
	"author_id" varchar,
	"excerpt" text,
	"reason" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" varchar NOT NULL,
	"blocked_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cohort_attendance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"present" boolean DEFAULT true NOT NULL,
	"note" text,
	"recorded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cohort_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"note" text,
	"review_note" text,
	"applied_at" timestamp DEFAULT now(),
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cohort_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" varchar NOT NULL,
	"title" text NOT NULL,
	"agenda" text,
	"starts_at" timestamp,
	"duration_minutes" integer,
	"location" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'mastermind' NOT NULL,
	"description" text,
	"cover_url" text,
	"start_date" date,
	"end_date" date,
	"format" text DEFAULT 'hybrid' NOT NULL,
	"emphasis" text,
	"location" text,
	"capacity" integer DEFAULT 12 NOT NULL,
	"price_cents" integer,
	"price_note" text,
	"application_required" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"granted_metrics" text[],
	"synced_through" timestamp,
	"last_sync_at" timestamp,
	"last_sync_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"device_model" text,
	"os_version" text,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"on_date" date NOT NULL,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"source" text NOT NULL,
	"source_app" text,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"external_id" text NOT NULL,
	"workout_type" text,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp,
	"on_date" date NOT NULL,
	"duration_seconds" integer,
	"active_calories" double precision,
	"distance_meters" double precision,
	"avg_heart_rate" double precision,
	"max_heart_rate" double precision,
	"source" text NOT NULL,
	"source_app" text,
	"raw" jsonb,
	"user_response" text,
	"user_orientation_override" text,
	"user_focus" text,
	"user_label" text,
	"reviewed_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "habit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tracked_habit_id" uuid NOT NULL,
	"phase_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"value" double precision NOT NULL,
	"op" text DEFAULT 'set' NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "habit_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"routine_habit_id" uuid NOT NULL,
	"emphasis" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"target" double precision,
	"phase_type" text DEFAULT 'ongoing' NOT NULL,
	"duration_days" integer,
	"schedule_kind" text DEFAULT 'daily' NOT NULL,
	"schedule_days" smallint[],
	"schedule_count" integer,
	"recommended_time" text,
	"reason" text,
	"proposed_by" text DEFAULT 'coach' NOT NULL,
	"proposed_by_user_id" text,
	"responded_at" timestamp with time zone,
	"resulting_phase_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "habit_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"related_habit_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tracked_habit_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_habit_id" uuid NOT NULL,
	"context_type" text NOT NULL,
	"context_id" text NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tracked_habit_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_habit_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"routine_habit_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"target" double precision,
	"phase_type" text DEFAULT 'ongoing' NOT NULL,
	"starts_on" date NOT NULL,
	"duration_days" integer,
	"schedule_kind" text DEFAULT 'daily' NOT NULL,
	"schedule_days" smallint[],
	"schedule_count" integer,
	"recommended_time" text,
	"source" text DEFAULT 'member' NOT NULL,
	"assigned_by_user_id" text,
	"member_reason" text,
	"coach_note" text,
	"ends_on" date GENERATED ALWAYS AS (CASE WHEN duration_days IS NULL THEN NULL ELSE starts_on + (duration_days - 1) END) STORED,
	"closed_on" date,
	"created_at" timestamp with time zone DEFAULT now(),
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tracked_habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"routine_habit_id" uuid NOT NULL,
	"emphasis" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_added_by" text DEFAULT 'member' NOT NULL,
	"first_added_by_user_id" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "terrain_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"on_date" date NOT NULL,
	"energy" smallint,
	"recovery" smallint,
	"nervous_system" smallint,
	"digestion" smallint,
	"body_tension" smallint,
	"mental_clarity" smallint,
	"drive" smallint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rhythm_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"type" text NOT NULL,
	"on_date" date NOT NULL,
	"phase" text,
	"context_kind" text,
	"provenance" text DEFAULT 'member_entered' NOT NULL,
	"note" text,
	"recorded_by_user_id" varchar NOT NULL,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rhythm_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar NOT NULL,
	"relation" text NOT NULL,
	"label" text,
	"subject_user_id" varchar,
	"subject_sex" text,
	"support_preference" text,
	"model" text DEFAULT 'spontaneous_cycle' NOT NULL,
	"cycle_length" smallint,
	"period_length" smallint,
	"regular" boolean,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suggestion_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"category" text NOT NULL,
	"on_date" date,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"support_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profile_photos" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime" text DEFAULT 'image/jpeg' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaching_messages" ADD CONSTRAINT "coaching_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_products" ADD CONSTRAINT "habit_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_links" ADD CONSTRAINT "product_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_products" ADD CONSTRAINT "routine_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_shop_checkoffs" ADD CONSTRAINT "user_shop_checkoffs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_entitlements" ADD CONSTRAINT "ebook_entitlements_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_progress" ADD CONSTRAINT "ebook_progress_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_progress" ADD CONSTRAINT "ebook_progress_section_id_ebook_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."ebook_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_sections" ADD CONSTRAINT "ebook_sections_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_hosts" ADD CONSTRAINT "offering_hosts_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_hosts" ADD CONSTRAINT "offering_hosts_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_registrations" ADD CONSTRAINT "offering_registrations_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_sessions" ADD CONSTRAINT "offering_sessions_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_session_id_offering_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."offering_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_hosts" ADD CONSTRAINT "session_hosts_session_id_offering_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."offering_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_hosts" ADD CONSTRAINT "session_hosts_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_community_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."community_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_auth_tokens_user" ON "auth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_password_reset_user" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_push_tokens_user" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_coach_relationships_coach" ON "coach_relationships" USING btree ("coach_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_coach_relationships_member" ON "coach_relationships" USING btree ("member_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coaching_attachment_object" ON "coaching_attachments" USING btree ("storage_bucket","storage_path");--> statement-breakpoint
CREATE INDEX "idx_coaching_attachment_message" ON "coaching_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_coaching_attachment_user" ON "coaching_attachments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_coaching_msgs_user" ON "coaching_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_coaching_msgs_user_created" ON "coaching_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_hra_habit" ON "habit_routine_assignments" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "idx_hra_routine" ON "habit_routine_assignments" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "idx_habits_user_date" ON "habits" USING btree ("user_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "idx_habits_user_routine" ON "habits" USING btree ("user_routine_id");--> statement-breakpoint
CREATE INDEX "idx_habits_completed" ON "habits" USING btree ("user_id","completed");--> statement-breakpoint
CREATE INDEX "idx_rewards_user" ON "rewards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_rewards_user_date" ON "rewards" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_rewards_habit" ON "rewards" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "idx_routine_habits_routine" ON "routine_habits" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "idx_routine_habits_intensity" ON "routine_habits" USING btree ("intensity");--> statement-breakpoint
CREATE INDEX "idx_user_assigned_habits_user" ON "user_assigned_habits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_removed_habits_user" ON "user_removed_habits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_routines_user" ON "user_routines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_routines_status" ON "user_routines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_user_routines_idempotency" ON "user_routines" USING btree ("client_request_id");--> statement-breakpoint
CREATE INDEX "idx_mc_videos_category" ON "masterclass_videos" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_mc_videos_featured" ON "masterclass_videos" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "idx_ucs_user" ON "user_category_subs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ucs_category" ON "user_category_subs" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_ucs_user_category" ON "user_category_subs" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_habit_products_habit" ON "habit_products" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "idx_habit_products_product" ON "habit_products" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_habit_products" ON "habit_products" USING btree ("habit_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_product_links_product" ON "product_links" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_products_active" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_routine_products_routine" ON "routine_products" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "idx_routine_products_product" ON "routine_products" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_routine_products" ON "routine_products" USING btree ("routine_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_shop_checkoffs_user" ON "user_shop_checkoffs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shop_checkoffs" ON "user_shop_checkoffs" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_ebook_entitlements_user" ON "ebook_entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ebook_entitlements" ON "ebook_entitlements" USING btree ("user_id","ebook_id");--> statement-breakpoint
CREATE INDEX "idx_ebook_progress_user" ON "ebook_progress" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ebook_progress" ON "ebook_progress" USING btree ("user_id","ebook_id");--> statement-breakpoint
CREATE INDEX "idx_ebook_sections_book" ON "ebook_sections" USING btree ("ebook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ebook_sections_order" ON "ebook_sections" USING btree ("ebook_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_ebooks_published" ON "ebooks" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "idx_ebooks_routine" ON "ebooks" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "idx_centre_habits_centre" ON "centre_habits" USING btree ("centre_id");--> statement-breakpoint
CREATE INDEX "idx_centre_habits_habit" ON "centre_habits" USING btree ("habit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_centre_habits" ON "centre_habits" USING btree ("centre_id","habit_id");--> statement-breakpoint
CREATE INDEX "idx_centre_routines_centre" ON "centre_routines" USING btree ("centre_id");--> statement-breakpoint
CREATE INDEX "idx_centre_routines_routine" ON "centre_routines" USING btree ("routine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_centre_routines" ON "centre_routines" USING btree ("centre_id","routine_id");--> statement-breakpoint
CREATE INDEX "idx_energy_centres_published" ON "energy_centres" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "idx_centre_readings_user" ON "user_centre_readings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_centre_readings_user_centre" ON "user_centre_readings" USING btree ("user_id","centre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_cosmology" ON "user_cosmology" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_hosts_user" ON "hosts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_hosts_active" ON "hosts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_offering_hosts_offering" ON "offering_hosts" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "idx_offering_hosts_host" ON "offering_hosts" USING btree ("host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_offering_hosts" ON "offering_hosts" USING btree ("offering_id","host_id");--> statement-breakpoint
CREATE INDEX "idx_offering_registrations_offering" ON "offering_registrations" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "idx_offering_registrations_user" ON "offering_registrations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_offering_registrations" ON "offering_registrations" USING btree ("offering_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_offering_sessions_offering" ON "offering_sessions" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "idx_offering_sessions_starts" ON "offering_sessions" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_offerings_status" ON "offerings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_offerings_kind" ON "offerings" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_offerings_start" ON "offerings" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "idx_offerings_tier" ON "offerings" USING btree ("min_tier_rank");--> statement-breakpoint
CREATE INDEX "idx_session_attendance_session" ON "session_attendance" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_attendance" ON "session_attendance" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_session_hosts_session" ON "session_hosts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_hosts" ON "session_hosts" USING btree ("session_id","host_id");--> statement-breakpoint
CREATE INDEX "idx_events_user_time" ON "events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_events_name_time" ON "events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "idx_events_subject" ON "events" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_events_date" ON "events" USING btree ("on_date");--> statement-breakpoint
CREATE INDEX "idx_wins_user" ON "wins" USING btree ("user_id","earned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_wins" ON "wins" USING btree ("user_id","kind","subject_id");--> statement-breakpoint
CREATE INDEX "idx_daily_intentions_user" ON "daily_intentions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_daily_intentions" ON "daily_intentions" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_daily_notes_user" ON "daily_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_daily_notes_date" ON "daily_notes" USING btree ("on_date");--> statement-breakpoint
CREATE INDEX "idx_daily_notes_flagged" ON "daily_notes" USING btree ("flagged");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_daily_notes" ON "daily_notes" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_frequencies_moment" ON "frequencies" USING btree ("moment");--> statement-breakpoint
CREATE INDEX "idx_frequencies_active" ON "frequencies" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_members" ON "channel_members" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_channel_members_user" ON "channel_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_channels_tier" ON "channels" USING btree ("min_tier_rank");--> statement-breakpoint
CREATE INDEX "idx_channels_offering" ON "channels" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "idx_community_channel" ON "community_messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_community_root" ON "community_messages" USING btree ("root_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_community_parent" ON "community_messages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_community_user" ON "community_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_membership_tiers_rank" ON "membership_tiers" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "idx_reactions_message" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reactions" ON "message_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_locked" ON "login_attempts" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "IDX_support_requests_status" ON "support_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_support_requests_user" ON "support_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_body_measurements_user" ON "body_measurements" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_body_measurements_user_date" ON "body_measurements" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_exercises_pattern" ON "exercises" USING btree ("pattern");--> statement-breakpoint
CREATE INDEX "idx_exercises_active" ON "exercises" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_exercises_owner" ON "exercises" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_habit_exercises_habit" ON "habit_exercises" USING btree ("routine_habit_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_habit_exercises_exercise" ON "habit_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_member_build_profile" ON "member_build_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_member_workout_exercises" ON "member_workout_exercises" USING btree ("member_workout_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_member_workout_exercises_ex" ON "member_workout_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "idx_member_workouts_user" ON "member_workouts" USING btree ("user_id","is_archived");--> statement-breakpoint
CREATE INDEX "idx_training_observations_user" ON "training_observations" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_training_observations_exercise" ON "training_observations" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "idx_training_observations_session" ON "training_observations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_workout_sessions_user_date" ON "workout_sessions" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_workout_sessions_habit" ON "workout_sessions" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "idx_workout_sets_session" ON "workout_sets" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_workout_sets_exercise" ON "workout_sets" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "idx_content_reports_status" ON "content_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_content_reports_message" ON "content_reports" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_content_reports_reporter_message" ON "content_reports" USING btree ("reporter_id","message_id");--> statement-breakpoint
CREATE INDEX "idx_user_blocks_blocker" ON "user_blocks" USING btree ("blocker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_blocks_pair" ON "user_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "idx_cohort_attendance_session" ON "cohort_attendance" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cohort_attendance" ON "cohort_attendance" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_cohort_members_cohort" ON "cohort_members" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "idx_cohort_members_user" ON "cohort_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cohort_members" ON "cohort_members" USING btree ("cohort_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_cohort_sessions_cohort" ON "cohort_sessions" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "idx_cohorts_status" ON "cohorts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_health_connections" ON "health_connections" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "idx_health_connections_user" ON "health_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_health_days" ON "health_days" USING btree ("user_id","on_date","metric");--> statement-breakpoint
CREATE INDEX "idx_health_days_user_metric" ON "health_days" USING btree ("user_id","metric","on_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_health_workouts" ON "health_workouts" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_health_workouts_user_date" ON "health_workouts" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_habit_entries_user_date" ON "habit_entries" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_habit_entries_tracked_date" ON "habit_entries" USING btree ("tracked_habit_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_habit_entries_phase" ON "habit_entries" USING btree ("phase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_proposal_open" ON "habit_proposals" USING btree ("user_id","routine_habit_id") WHERE status = 'proposed';--> statement-breakpoint
CREATE INDEX "idx_proposals_user" ON "habit_proposals" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_habit_relation" ON "habit_relations" USING btree ("habit_id","related_habit_id","relation");--> statement-breakpoint
CREATE INDEX "idx_habit_relation_related" ON "habit_relations" USING btree ("related_habit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tracked_link" ON "tracked_habit_links" USING btree ("tracked_habit_id","context_type","context_id");--> statement-breakpoint
CREATE INDEX "idx_tracked_link_context" ON "tracked_habit_links" USING btree ("context_type","context_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_phase_one_active" ON "tracked_habit_phases" USING btree ("tracked_habit_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "idx_phase_user_active" ON "tracked_habit_phases" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_phase_tracked" ON "tracked_habit_phases" USING btree ("tracked_habit_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tracked_habits_live" ON "tracked_habits" USING btree ("user_id","routine_habit_id") WHERE status <> 'archived';--> statement-breakpoint
CREATE INDEX "idx_tracked_habits_user" ON "tracked_habits" USING btree ("user_id","emphasis");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_terrain_checkin" ON "terrain_checkins" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_terrain_checkin_user" ON "terrain_checkins" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "idx_rhythm_events_subject" ON "rhythm_events" USING btree ("subject_id","on_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rhythm_event_day" ON "rhythm_events" USING btree ("subject_id","type","on_date");--> statement-breakpoint
CREATE INDEX "idx_rhythm_subjects_owner" ON "rhythm_subjects" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rhythm_subject_self" ON "rhythm_subjects" USING btree ("owner_user_id") WHERE relation = 'self' AND archived_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_suggestion_dismissal_day" ON "suggestion_dismissals" USING btree ("user_id","category","on_date") WHERE on_date IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_suggestion_dismissal_forever" ON "suggestion_dismissals" USING btree ("user_id","category") WHERE on_date IS NULL;--> statement-breakpoint
CREATE INDEX "idx_suggestion_dismissals_user" ON "suggestion_dismissals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_support_products_support" ON "support_products" USING btree ("support_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_support_products" ON "support_products" USING btree ("support_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_profile_photos_token" ON "profile_photos" USING btree ("token");
-- ─── Four tables Drizzle does not know about ──────────────────────────────
--
-- `coaching_plans`, `coaching_plan_items`, `coaching_checkin_requests` and
-- `notifications` exist in production and were created by migrations, but were
-- never added to `shared/schema.ts`. `drizzle-kit generate` therefore cannot
-- emit them, and — more alarming — `drizzle-kit push` considers them unknown.
-- Introspected from production on 16 Aug 2026.

CREATE TABLE IF NOT EXISTS public.coaching_checkin_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_user_id character varying NOT NULL,
  coach_user_id character varying NOT NULL,
  relationship_id uuid,
  requested_by_user_id character varying NOT NULL,
  kind text DEFAULT 'quick'::text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  coach_prompt text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  due_on date,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  cancelled_by_user_id character varying,
  checkin_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.coaching_plan_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  plan_id uuid NOT NULL,
  routine_habit_id uuid NOT NULL,
  intent text DEFAULT 'add'::text NOT NULL,
  target double precision,
  schedule_kind text,
  schedule_days smallint[],
  schedule_count integer,
  recommended_time text,
  member_reason text,
  coach_note text,
  order_index integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.coaching_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_user_id character varying NOT NULL,
  coach_user_id character varying NOT NULL,
  relationship_id uuid,
  title text NOT NULL,
  focus text,
  member_visible_note text,
  internal_note text,
  status text DEFAULT 'draft'::text NOT NULL,
  starts_on date,
  ends_on date,
  created_by_user_id character varying NOT NULL,
  activated_by_user_id character varying,
  ended_by_user_id character varying,
  activated_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id character varying NOT NULL,
  type text NOT NULL,
  actor_user_id character varying,
  resource_type text NOT NULL,
  resource_id uuid,
  title text NOT NULL,
  body text,
  dedupe_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  read_at timestamp with time zone
);

ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_pkey PRIMARY KEY (id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_cancelled_has_time CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL)));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_completed_has_answer CHECK ((((status = 'completed'::text) AND (completed_at IS NOT NULL) AND (checkin_id IS NOT NULL)) OR ((status <> 'completed'::text) AND (completed_at IS NULL))));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_not_self CHECK (((member_user_id)::text <> (coach_user_id)::text));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_kind_check CHECK ((kind = ANY (ARRAY['quick'::text, 'recovery'::text, 'reflection'::text])));
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_intent_check CHECK ((intent = ANY (ARRAY['add'::text, 'change'::text, 'end'::text])));
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT uq_coaching_plan_item UNIQUE (plan_id, routine_habit_id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_activated_matches_status CHECK ((((status = 'draft'::text) AND (activated_at IS NULL) AND (ended_at IS NULL)) OR ((status = 'active'::text) AND (activated_at IS NOT NULL) AND (ended_at IS NULL)) OR ((status = 'ended'::text) AND (ended_at IS NOT NULL))));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_dates_ordered CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (ends_on >= starts_on)));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plan_not_self CHECK (((coach_user_id)::text <> (member_user_id)::text));
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'ended'::text])));

ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_cancelled_by_user_id_fkey FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES terrain_checkins(id) ON DELETE SET NULL;
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES coach_relationships(id) ON DELETE SET NULL;
ALTER TABLE public.coaching_checkin_requests ADD CONSTRAINT coaching_checkin_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES coaching_plans(id) ON DELETE CASCADE;
ALTER TABLE public.coaching_plan_items ADD CONSTRAINT coaching_plan_items_routine_habit_id_fkey FOREIGN KEY (routine_habit_id) REFERENCES routine_habits(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_activated_by_user_id_fkey FOREIGN KEY (activated_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_ended_by_user_id_fkey FOREIGN KEY (ended_by_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES users(id);
ALTER TABLE public.coaching_plans ADD CONSTRAINT coaching_plans_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES coach_relationships(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Partial uniques, which are where the real invariants live: one open check-in
-- per pair, one active plan per member, one notification per dedupe key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_checkin_open ON public.coaching_checkin_requests USING btree (member_user_id, coach_user_id) WHERE (status = 'open'::text);
CREATE INDEX IF NOT EXISTS idx_coaching_checkin_member ON public.coaching_checkin_requests USING btree (member_user_id, status);
CREATE INDEX IF NOT EXISTS idx_coaching_checkin_coach ON public.coaching_checkin_requests USING btree (coach_user_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_plan_item_plan ON public.coaching_plan_items USING btree (plan_id, order_index);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_plan_active_member ON public.coaching_plans USING btree (member_user_id) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS idx_coaching_plan_member ON public.coaching_plans USING btree (member_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_plan_coach ON public.coaching_plans USING btree (coach_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_dedupe ON public.notifications USING btree (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);

-- ─── Row-level security ───────────────────────────────────────────────────
--
-- Drizzle models none of this, which is the other half of why `push` left the
-- repository unable to rebuild itself: the schema files describe the shape of
-- the data and say nothing about who may read a row.
--
-- Introspected from production, 16 Aug 2026: 89 of 93 tables have RLS enabled
-- and 154 policies between them.
--
-- ── The four that do not, stated rather than hidden ───────────────────────
--
--   coach_relationships
--   health_connections
--   health_days
--   health_workouts
--
-- CLAUDE.md says "Every table has RLS". That is not true of these four, and
-- they hold sleep, heart rate, workouts and who coaches whom — the most
-- sensitive rows in the product. It is defensible if every read goes through
-- the server's service-role connection and no anon key ever touches them; it
-- is not defensible silently. Recorded here so the QA branch reproduces
-- production exactly, and so the decision has somewhere to be argued.

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centre_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centre_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_checkin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_intentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebook_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebook_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebook_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_routine_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.masterclass_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.masterclass_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_build_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retreats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rhythm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rhythm_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestion_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terrain_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_habit_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_habit_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_assigned_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_category_subs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_centre_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cosmology ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_removed_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_shop_checkoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

-- Policies, tables a–m. Introspected from production 16 Aug 2026.
-- Depends on the helper functions in 05: is_sakred_admin(), can_see_channel().
CREATE POLICY applications_admin ON public.applications AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_applications_insert ON public.applications AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY sakred_applications_select ON public.applications AS PERMISSIVE FOR SELECT TO public USING (is_sakred_admin());
CREATE POLICY body_measurements_no_client ON public.body_measurements AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY sakred_bookings_admin_select ON public.booking_requests AS PERMISSIVE FOR SELECT TO public USING (is_sakred_admin());
CREATE POLICY sakred_bookings_admin_update ON public.booking_requests AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_bookings_insert ON public.booking_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = (user_id)::text));
CREATE POLICY sakred_bookings_select ON public.booking_requests AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (user_id)::text));
CREATE POLICY sakred_bookings_update ON public.booking_requests AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = (user_id)::text));
CREATE POLICY centre_habits_select ON public.centre_habits AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY centre_habits_write ON public.centre_habits AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY centre_routines_select ON public.centre_routines AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY centre_routines_write ON public.centre_routines AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY channel_members_no_client ON public.channel_members AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY channels_select ON public.channels AS PERMISSIVE FOR SELECT TO public USING ((can_see_channel((auth.uid())::text, id) OR is_sakred_admin()));
CREATE POLICY channels_write ON public.channels AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_coaching_msgs_admin_update ON public.coaching_messages AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY sakred_coaching_msgs_insert ON public.coaching_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY sakred_coaching_msgs_select ON public.coaching_messages AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY cohort_attendance_admin ON public.cohort_attendance AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_attendance_own ON public.cohort_attendance AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cohort_members_admin ON public.cohort_members AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_members_apply ON public.cohort_members AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cohort_members_own ON public.cohort_members AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cohort_sessions_admin ON public.cohort_sessions AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_sessions_select ON public.cohort_sessions AS PERMISSIVE FOR SELECT TO public USING ((is_sakred_admin() OR (EXISTS ( SELECT 1
   FROM cohort_members m
  WHERE ((m.cohort_id = cohort_sessions.cohort_id) AND ((m.user_id)::text = (auth.uid())::text) AND (m.status = 'confirmed'::text))))));
CREATE POLICY cohorts_select ON public.cohorts AS PERMISSIVE FOR SELECT TO public USING (((status <> 'draft'::text) OR is_sakred_admin()));
CREATE POLICY cohorts_write ON public.cohorts AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY community_messages_admin ON public.community_messages AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY community_messages_insert ON public.community_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((user_id)::text = (auth.uid())::text) AND can_see_channel((auth.uid())::text, channel_id) AND (NOT (EXISTS ( SELECT 1
   FROM channels c
  WHERE ((c.id = community_messages.channel_id) AND c.is_read_only))))));
CREATE POLICY community_messages_own ON public.community_messages AS PERMISSIVE FOR UPDATE TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY community_messages_select ON public.community_messages AS PERMISSIVE FOR SELECT TO public USING ((can_see_channel((auth.uid())::text, channel_id) OR is_sakred_admin()));
CREATE POLICY content_reports_no_client ON public.content_reports AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY daily_intentions_own ON public.daily_intentions AS PERMISSIVE FOR ALL TO public USING (((user_id)::text = (auth.uid())::text)) WITH CHECK (((user_id)::text = (auth.uid())::text));
CREATE POLICY daily_intentions_read ON public.daily_intentions AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY daily_notes_admin ON public.daily_notes AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY daily_notes_own ON public.daily_notes AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY ebook_entitlements_admin ON public.ebook_entitlements AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY ebook_entitlements_own ON public.ebook_entitlements AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY ebook_progress_own ON public.ebook_progress AS PERMISSIVE FOR ALL TO public USING (((user_id)::text = (auth.uid())::text)) WITH CHECK (((user_id)::text = (auth.uid())::text));
CREATE POLICY ebook_sections_admin ON public.ebook_sections AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY ebooks_select ON public.ebooks AS PERMISSIVE FOR SELECT TO public USING ((is_published OR is_sakred_admin()));
CREATE POLICY ebooks_write ON public.ebooks AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY energy_centres_select ON public.energy_centres AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY energy_centres_write ON public.energy_centres AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY events_read_own ON public.events AS PERMISSIVE FOR SELECT TO public USING (((user_id)::text = (auth.uid())::text));
CREATE POLICY sakred_exec_applications_insert ON public.executive_applications AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY sakred_exec_applications_select ON public.executive_applications AS PERMISSIVE FOR SELECT TO public USING (is_sakred_admin());
CREATE POLICY sakred_exec_applications_update ON public.executive_applications AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY exercises_read ON public.exercises AS PERMISSIVE FOR SELECT TO authenticated USING (is_active);
CREATE POLICY frequencies_select ON public.frequencies AS PERMISSIVE FOR SELECT TO public USING ((is_active OR is_sakred_admin()));
CREATE POLICY frequencies_write ON public.frequencies AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY habit_entries_service ON public.habit_entries AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY habit_exercises_read ON public.habit_exercises AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY habit_products_select ON public.habit_products AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY habit_products_write ON public.habit_products AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY habit_proposals_service ON public.habit_proposals AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY habit_relations_service ON public.habit_relations AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY sakred_hra_delete ON public.habit_routine_assignments AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_hra_insert ON public.habit_routine_assignments AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_hra_select ON public.habit_routine_assignments AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_hra_update ON public.habit_routine_assignments AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_habits_insert ON public.habits AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY sakred_habits_select ON public.habits AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = user_id));
CREATE POLICY sakred_habits_update ON public.habits AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = user_id));
CREATE POLICY hosts_read ON public.hosts AS PERMISSIVE FOR SELECT TO public USING (is_active);
CREATE POLICY login_attempts_no_client_access ON public.login_attempts AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY sakred_mc_categories_delete ON public.masterclass_categories AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_mc_categories_insert ON public.masterclass_categories AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_mc_categories_select ON public.masterclass_categories AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_mc_categories_update ON public.masterclass_categories AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_mc_videos_delete ON public.masterclass_videos AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_mc_videos_insert ON public.masterclass_videos AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_mc_videos_select ON public.masterclass_videos AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_mc_videos_update ON public.masterclass_videos AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY member_build_profile_service ON public.member_build_profile AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY membership_tiers_select ON public.membership_tiers AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY membership_tiers_write ON public.membership_tiers AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY message_reactions_own ON public.message_reactions AS PERMISSIVE FOR ALL TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin())) WITH CHECK (((user_id)::text = (auth.uid())::text));

-- Policies, tables n–z. Introspected from production 16 Aug 2026.
CREATE POLICY offering_hosts_read ON public.offering_hosts AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM offerings o
  WHERE ((o.id = offering_hosts.offering_id) AND (o.status <> 'draft'::text)))));
CREATE POLICY cohort_members_admin ON public.offering_registrations AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_members_apply ON public.offering_registrations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cohort_members_own ON public.offering_registrations AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cohort_sessions_admin ON public.offering_sessions AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_sessions_select ON public.offering_sessions AS PERMISSIVE FOR SELECT TO public USING ((is_sakred_admin() OR (EXISTS ( SELECT 1
   FROM offering_registrations m
  WHERE ((m.offering_id = offering_sessions.offering_id) AND ((m.user_id)::text = (auth.uid())::text) AND (m.status = 'confirmed'::text))))));
CREATE POLICY cohorts_select ON public.offerings AS PERMISSIVE FOR SELECT TO public USING (((status <> 'draft'::text) OR is_sakred_admin()));
CREATE POLICY cohorts_write ON public.offerings AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_partner_services_admin_delete ON public.partner_services AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_partner_services_admin_insert ON public.partner_services AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_partner_services_admin_update ON public.partner_services AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_partner_services_select ON public.partner_services AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_partners_admin_delete ON public.partners AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_partners_admin_insert ON public.partners AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_partners_admin_update ON public.partners AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_partners_select ON public.partners AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY product_links_select ON public.product_links AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY product_links_write ON public.product_links AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY products_select ON public.products AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY products_write ON public.products AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY profile_photos_service ON public.profile_photos AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY sakred_properties_admin_delete ON public.properties AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_properties_admin_insert ON public.properties AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_properties_admin_update ON public.properties AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_properties_select ON public.properties AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_retreats_admin_delete ON public.retreats AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_retreats_admin_insert ON public.retreats AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_retreats_admin_update ON public.retreats AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY sakred_retreats_select ON public.retreats AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_rewards_insert ON public.rewards AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY sakred_rewards_select ON public.rewards AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = user_id));
CREATE POLICY rhythm_events_service ON public.rhythm_events AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY rhythm_subjects_service ON public.rhythm_subjects AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY sakred_routine_habits_delete ON public.routine_habits AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_routine_habits_insert ON public.routine_habits AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_routine_habits_select ON public.routine_habits AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_routine_habits_update ON public.routine_habits AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY routine_products_select ON public.routine_products AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY routine_products_write ON public.routine_products AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_attendance_admin ON public.session_attendance AS PERMISSIVE FOR ALL TO public USING (is_sakred_admin()) WITH CHECK (is_sakred_admin());
CREATE POLICY cohort_attendance_own ON public.session_attendance AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY session_hosts_read ON public.session_hosts AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (offering_sessions s
     JOIN offerings o ON ((o.id = s.offering_id)))
  WHERE ((s.id = session_hosts.session_id) AND (o.status <> 'draft'::text)))));
CREATE POLICY sakred_sessions_deny ON public.sessions AS PERMISSIVE FOR ALL TO public USING (false);
CREATE POLICY suggestion_dismissals_service ON public.suggestion_dismissals AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY support_products_service ON public.support_products AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY terrain_checkins_service ON public.terrain_checkins AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tracked_habit_links_service ON public.tracked_habit_links AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tracked_habit_phases_service ON public.tracked_habit_phases AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tracked_habits_service ON public.tracked_habits AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY training_observations_no_client ON public.training_observations AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY sakred_user_assigned_delete ON public.user_assigned_habits AS PERMISSIVE FOR DELETE TO public USING (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_assigned_insert ON public.user_assigned_habits AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_assigned_select ON public.user_assigned_habits AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_assigned_update ON public.user_assigned_habits AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = user_id));
CREATE POLICY user_blocks_no_client ON public.user_blocks AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY sakred_ucs_delete ON public.user_category_subs AS PERMISSIVE FOR DELETE TO public USING (((auth.uid())::text = (user_id)::text));
CREATE POLICY sakred_ucs_insert ON public.user_category_subs AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = (user_id)::text));
CREATE POLICY sakred_ucs_select ON public.user_category_subs AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (user_id)::text));
CREATE POLICY centre_readings_insert ON public.user_centre_readings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY centre_readings_own ON public.user_centre_readings AS PERMISSIVE FOR SELECT TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY cosmology_own ON public.user_cosmology AS PERMISSIVE FOR ALL TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin())) WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY user_removed_habits_own ON public.user_removed_habits AS PERMISSIVE FOR ALL TO public USING ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin())) WITH CHECK ((((user_id)::text = (auth.uid())::text) OR is_sakred_admin()));
CREATE POLICY sakred_user_routines_insert ON public.user_routines AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_routines_select ON public.user_routines AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = user_id));
CREATE POLICY sakred_user_routines_update ON public.user_routines AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = user_id));
CREATE POLICY user_shop_checkoffs_own ON public.user_shop_checkoffs AS PERMISSIVE FOR ALL TO public USING (((user_id)::text = (auth.uid())::text)) WITH CHECK (((user_id)::text = (auth.uid())::text));
CREATE POLICY sakred_users_select ON public.users AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (id)::text));
CREATE POLICY sakred_users_update ON public.users AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = (id)::text));
CREATE POLICY sakred_routines_delete ON public.wellness_routines AS PERMISSIVE FOR DELETE TO public USING (is_sakred_admin());
CREATE POLICY sakred_routines_insert ON public.wellness_routines AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_sakred_admin());
CREATE POLICY sakred_routines_select ON public.wellness_routines AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY sakred_routines_update ON public.wellness_routines AS PERMISSIVE FOR UPDATE TO public USING (is_sakred_admin());
CREATE POLICY wins_read_own ON public.wins AS PERMISSIVE FOR SELECT TO public USING (((user_id)::text = (auth.uid())::text));
CREATE POLICY workout_sessions_no_client ON public.workout_sessions AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY workout_sets_no_client ON public.workout_sets AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- ─── Functions the policies depend on ─────────────────────────────────────
--
-- Production has 37 functions in `public`; 31 of them belong to pg_trgm and
-- arrive with the extension. These six are ours, and the policies in 04 do not
-- work without them.
--
-- ── One thing found while writing this down ───────────────────────────────
--
-- `can_see_channel` exists TWICE, with different signatures and different
-- rules:
--
--   can_see_channel(text, uuid)              -- tier rank + offering
--   can_see_channel(character varying, uuid) -- admin bypass, explicit invites,
--                                            -- private rooms
--
-- The policies call `can_see_channel((auth.uid())::text, id)`, which resolves
-- to the FIRST — the older, simpler one. The second, which is the version
-- somebody wrote comments for about admins never being locked out and private
-- rooms staying private, is not what the database consults.
--
-- Both are reproduced here so the QA branch matches production exactly. Which
-- one should survive is a decision, not a cleanup, and it belongs to whoever
-- owns Community. Recorded rather than quietly resolved.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.is_sakred_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()::text
      AND is_admin = 'true'
  );
$function$;

CREATE OR REPLACE FUNCTION public.member_tier_rank(p_user_id text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(t.rank, 0)
  FROM users u
  LEFT JOIN membership_tiers t ON t.id = u.membership_tier
  WHERE u.id = p_user_id;
$function$;

-- The overload the policies actually resolve to.
CREATE OR REPLACE FUNCTION public.can_see_channel(p_user_id text, p_channel_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = p_channel_id
      AND c.is_active
      AND public.member_tier_rank(p_user_id) >= c.min_tier_rank
      AND (
        c.offering_id IS NULL
        OR EXISTS (
          SELECT 1 FROM offering_registrations r
          WHERE r.offering_id = c.offering_id
            AND r.user_id = p_user_id
            AND r.status = 'confirmed'
        )
      )
  );
$function$;

-- The overload that is never called. See the note at the top of this file.
CREATE OR REPLACE FUNCTION public.can_see_channel(p_user_id character varying, p_channel_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from channels c
    left join users u on u.id = p_user_id
    left join membership_tiers t on t.id = u.membership_tier
    where c.id = p_channel_id
      and c.is_active
      and (
        u.is_admin = 'true'
        or exists (
          select 1 from channel_members m
          where m.channel_id = c.id and m.user_id = p_user_id
        )
        or (
          not c.is_private
          and (
            case
              when c.offering_id is not null then exists (
                select 1 from offering_registrations r
                where r.offering_id = c.offering_id
                  and r.user_id = p_user_id
                  and r.status = 'confirmed'
              )
              else coalesce(t.rank, 0) >= c.min_tier_rank
            end
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.bump_reply_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE community_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE community_messages SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END $function$;

-- A phase is a contract: close it and open a new one rather than editing what
-- somebody was already asked to do.
CREATE OR REPLACE FUNCTION public.tracked_habit_phase_freeze()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tracked_habit_id  IS DISTINCT FROM OLD.tracked_habit_id
  OR NEW.user_id           IS DISTINCT FROM OLD.user_id
  OR NEW.routine_habit_id  IS DISTINCT FROM OLD.routine_habit_id
  OR NEW.target            IS DISTINCT FROM OLD.target
  OR NEW.phase_type        IS DISTINCT FROM OLD.phase_type
  OR NEW.starts_on         IS DISTINCT FROM OLD.starts_on
  OR NEW.duration_days     IS DISTINCT FROM OLD.duration_days
  OR NEW.schedule_kind     IS DISTINCT FROM OLD.schedule_kind
  OR NEW.schedule_days     IS DISTINCT FROM OLD.schedule_days
  OR NEW.schedule_count    IS DISTINCT FROM OLD.schedule_count
  OR NEW.recommended_time  IS DISTINCT FROM OLD.recommended_time
  OR NEW.source            IS DISTINCT FROM OLD.source
  OR NEW.assigned_by_user_id IS DISTINCT FROM OLD.assigned_by_user_id
  OR NEW.member_reason     IS DISTINCT FROM OLD.member_reason
  OR NEW.coach_note        IS DISTINCT FROM OLD.coach_note
  THEN
    RAISE EXCEPTION
      'tracked_habit_phases %: a phase is a contract. Close it and open a new one rather than editing what somebody was already asked to do.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;
