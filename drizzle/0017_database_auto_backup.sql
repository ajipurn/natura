CREATE TABLE "backup_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"hour" integer DEFAULT 2 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"last_file_name" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" text,
	"lease_until" timestamp with time zone,
	CONSTRAINT "backup_settings_singleton" CHECK ("backup_settings"."id" = 1),
	CONSTRAINT "backup_settings_hour_range" CHECK ("backup_settings"."hour" between 0 and 23)
);
--> statement-breakpoint
ALTER TABLE "backup_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO "backup_settings" ("id") VALUES (1);
