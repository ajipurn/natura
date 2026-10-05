CREATE TYPE "public"."collection_method" AS ENUM('scan', 'manual');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('filled', 'empty');--> statement-breakpoint
CREATE TYPE "public"."guard_color" AS ENUM('green', 'yellow', 'orange');--> statement-breakpoint
CREATE TYPE "public"."house_status" AS ENUM('active', 'vacant');--> statement-breakpoint
CREATE TYPE "public"."log_method" AS ENUM('scan', 'manual', 'koreksi');--> statement-breakpoint
CREATE TYPE "public"."log_status" AS ENUM('filled', 'empty', 'none');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'petugas');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "collection_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text,
	"date" date NOT NULL,
	"house_id" integer NOT NULL,
	"user_id" integer,
	"status" "log_status" NOT NULL,
	"amount" integer NOT NULL,
	"method" "log_method" NOT NULL,
	"on_duty" boolean,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"patrol_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"status" "collection_status" NOT NULL,
	"amount" integer NOT NULL,
	"method" "collection_method" NOT NULL,
	"collected_by" integer,
	"recorded_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"phone" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "houses" (
	"id" serial PRIMARY KEY NOT NULL,
	"block" text NOT NULL,
	"number" text NOT NULL,
	"owner_name" text,
	"token" text NOT NULL,
	"status" "house_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "houses_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "houses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patrols" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patrols_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "patrols" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ronda_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"position" integer NOT NULL,
	"user_id" integer,
	"house_id" integer,
	"name" text,
	"color" "guard_color",
	CONSTRAINT "ronda_schedule_one_source" CHECK (num_nonnulls(user_id, house_id, name) = 1)
);
--> statement-breakpoint
ALTER TABLE "ronda_schedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schedule_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_day" integer,
	"to_day" integer NOT NULL,
	"note" text,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"response" text,
	"decided_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "schedule_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"community_name" text NOT NULL,
	"default_amount" integer DEFAULT 500 NOT NULL,
	"warga_code" text,
	"warga_code_version" integer DEFAULT 1 NOT NULL,
	"plan_anchors" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"role" "role" DEFAULT 'petugas' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"session_version" integer DEFAULT 1 NOT NULL,
	"house_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collection_logs" ADD CONSTRAINT "collection_logs_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_logs" ADD CONSTRAINT "collection_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_patrol_id_patrols_id_fk" FOREIGN KEY ("patrol_id") REFERENCES "public"."patrols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_collected_by_users_id_fk" FOREIGN KEY ("collected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ronda_schedule" ADD CONSTRAINT "ronda_schedule_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ronda_schedule" ADD CONSTRAINT "ronda_schedule_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_requests" ADD CONSTRAINT "schedule_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_requests" ADD CONSTRAINT "schedule_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_logs_date_idx" ON "collection_logs" USING btree ("date","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_logs_client_idx" ON "collection_logs" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_patrol_house_idx" ON "collections" USING btree ("patrol_id","house_id");--> statement-breakpoint
CREATE UNIQUE INDEX "houses_block_number_idx" ON "houses" USING btree ("block","number");--> statement-breakpoint
CREATE INDEX "ronda_schedule_day_idx" ON "ronda_schedule" USING btree ("day_of_week","position");--> statement-breakpoint
CREATE INDEX "schedule_requests_status_idx" ON "schedule_requests" USING btree ("status","created_at");