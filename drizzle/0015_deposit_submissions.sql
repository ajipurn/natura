ALTER TABLE "patrols" ADD COLUMN "deposit_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patrols" ADD COLUMN "deposit_requested_by" integer;--> statement-breakpoint
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_deposit_requested_by_users_id_fk" FOREIGN KEY ("deposit_requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;