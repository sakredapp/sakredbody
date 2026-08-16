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
CREATE TABLE "coaching_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"routine_habit_id" uuid NOT NULL,
	"intent" text DEFAULT 'add' NOT NULL,
	"target" double precision,
	"schedule_kind" text,
	"schedule_days" smallint[],
	"schedule_count" integer,
	"recommended_time" text,
	"member_reason" text,
	"coach_note" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_user_id" varchar NOT NULL,
	"coach_user_id" varchar NOT NULL,
	"relationship_id" uuid,
	"title" text NOT NULL,
	"focus" text,
	"member_visible_note" text,
	"internal_note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_by_user_id" varchar NOT NULL,
	"activated_by_user_id" varchar,
	"ended_by_user_id" varchar,
	"activated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_checkin_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_user_id" varchar NOT NULL,
	"coach_user_id" varchar NOT NULL,
	"relationship_id" uuid,
	"requested_by_user_id" varchar NOT NULL,
	"kind" text DEFAULT 'quick' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"coach_prompt" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_on" date,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" varchar,
	"checkin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" varchar,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
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
CREATE UNIQUE INDEX "uq_profile_photos_token" ON "profile_photos" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coaching_plan_item" ON "coaching_plan_items" USING btree ("plan_id","routine_habit_id");--> statement-breakpoint
CREATE INDEX "idx_coaching_plan_item_plan" ON "coaching_plan_items" USING btree ("plan_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_coaching_plan_member" ON "coaching_plans" USING btree ("member_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_coaching_plan_coach" ON "coaching_plans" USING btree ("coach_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coaching_checkin_open" ON "coaching_checkin_requests" USING btree ("member_user_id","coach_user_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "idx_coaching_checkin_member" ON "coaching_checkin_requests" USING btree ("member_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_coaching_checkin_coach" ON "coaching_checkin_requests" USING btree ("coach_user_id","status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_dedupe" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id","created_at");