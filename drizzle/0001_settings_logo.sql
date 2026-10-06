ALTER TABLE "settings" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "logo_version" integer DEFAULT 0 NOT NULL;