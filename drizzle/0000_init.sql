CREATE TYPE "public"."collection_method" AS ENUM('scan', 'manual');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('filled', 'empty');--> statement-breakpoint
CREATE TYPE "public"."house_status" AS ENUM('active', 'vacant');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'petugas');--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"patrol_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"status" "collection_status" NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"method" "collection_method" NOT NULL,
	"collected_by" integer,
	"recorded_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "patrols" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patrols_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"community_name" text NOT NULL,
	"default_amount" integer DEFAULT 500 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"role" "role" DEFAULT 'petugas' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_patrol_id_patrols_id_fk" FOREIGN KEY ("patrol_id") REFERENCES "public"."patrols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_collected_by_users_id_fk" FOREIGN KEY ("collected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collections_patrol_house_idx" ON "collections" USING btree ("patrol_id","house_id");--> statement-breakpoint
CREATE UNIQUE INDEX "houses_block_number_idx" ON "houses" USING btree ("block","number");