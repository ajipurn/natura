CREATE TABLE "telegram_notifications" (
	"key" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" text,
	"lease_until" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "telegram_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "telegram_notifications_pending_idx" ON "telegram_notifications" USING btree ("active","next_attempt_at");