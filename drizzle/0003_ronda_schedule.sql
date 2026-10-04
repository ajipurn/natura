CREATE TABLE "ronda_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"position" integer NOT NULL,
	"name" text,
	"block" text NOT NULL,
	"number" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ronda_schedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ronda_schedule_day_idx" ON "ronda_schedule" USING btree ("day_of_week","position");