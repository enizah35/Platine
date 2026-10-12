CREATE TABLE "artist_external_ids" (
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "artist_external_ids_provider_external_id_pk" PRIMARY KEY("provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"control_policy" text NOT NULL,
	"dj_role_id" text,
	"autoplay_default" boolean NOT NULL,
	"idle_timeout_s" integer NOT NULL,
	"keep_queue_on_leave" boolean NOT NULL,
	"playlist_edit_policy" text NOT NULL,
	"history_retention_days" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text,
	"kind" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recovered" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"track_id" uuid NOT NULL,
	"requested_by" text,
	"origin" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"played_ms" integer,
	"end_reason" text,
	"wrong_match" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playback_matches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"track_id" uuid NOT NULL,
	"guild_id" text,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"score" double precision NOT NULL,
	"status" text NOT NULL,
	"reported_by" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playback_matches_key_uq" UNIQUE NULLS NOT DISTINCT("track_id","guild_id","source","source_ref")
);
--> statement-breakpoint
CREATE TABLE "player_state" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"voice_channel_id" text NOT NULL,
	"text_channel_id" text NOT NULL,
	"panel_message_id" text,
	"current_queue_item_id" uuid,
	"current_track_id" uuid,
	"position_ms" integer DEFAULT 0 NOT NULL,
	"position_at" timestamp with time zone NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"loop_mode" text DEFAULT 'off' NOT NULL,
	"autoplay" boolean NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"track_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"requested_by" text,
	"origin" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_external_ids" (
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"track_id" uuid NOT NULL,
	"url" text,
	CONSTRAINT "track_external_ids_provider_external_id_pk" PRIMARY KEY("provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "track_likes" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"track_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_likes_guild_id_user_id_track_id_pk" PRIMARY KEY("guild_id","user_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isrc" text,
	"title" text NOT NULL,
	"artists" text[] NOT NULL,
	"primary_artist" text NOT NULL,
	"album" text,
	"duration_ms" integer NOT NULL,
	"artwork_url" text,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"explicit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_isrc_unique" UNIQUE("isrc")
);
--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"max_humans" integer DEFAULT 0 NOT NULL,
	"listen_ms_2plus" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_matches" ADD CONSTRAINT "playback_matches_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_state" ADD CONSTRAINT "player_state_current_track_id_tracks_id_fk" FOREIGN KEY ("current_track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_external_ids" ADD CONSTRAINT "track_external_ids_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_likes" ADD CONSTRAINT "track_likes_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_at_idx" ON "incidents" USING btree ("at");--> statement-breakpoint
CREATE INDEX "play_history_guild_started_idx" ON "play_history" USING btree ("guild_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "play_history_started_idx" ON "play_history" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "playback_matches_track_guild_idx" ON "playback_matches" USING btree ("track_id","guild_id");--> statement-breakpoint
CREATE INDEX "player_state_status_idx" ON "player_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "playlist_items_playlist_position_idx" ON "playlist_items" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "playlists_guild_name_uq" ON "playlists" USING btree ("guild_id",lower("name"));--> statement-breakpoint
CREATE INDEX "queue_items_guild_position_idx" ON "queue_items" USING btree ("guild_id","position");--> statement-breakpoint
CREATE INDEX "track_external_ids_track_idx" ON "track_external_ids" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "tracks_duration_idx" ON "tracks" USING btree ("duration_ms");--> statement-breakpoint
CREATE INDEX "voice_sessions_guild_started_idx" ON "voice_sessions" USING btree ("guild_id","started_at");