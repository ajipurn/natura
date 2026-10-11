ALTER TABLE "settings" ADD COLUMN "recording_start" text DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "recording_end" text DEFAULT '00:00' NOT NULL;