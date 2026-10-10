ALTER TABLE "ronda_schedule" DROP CONSTRAINT "ronda_schedule_one_source";--> statement-breakpoint
ALTER TABLE "ronda_schedule" DROP CONSTRAINT "ronda_schedule_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ronda_schedule" ADD COLUMN "resident_id" integer;--> statement-breakpoint
INSERT INTO "residents" ("user_id", "created_at")
SELECT "id", "created_at" FROM "users" ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint
UPDATE "ronda_schedule" AS s SET "resident_id" = r."id"
FROM "residents" AS r WHERE r."user_id" = s."user_id";
--> statement-breakpoint
ALTER TABLE "ronda_schedule" ADD CONSTRAINT "ronda_schedule_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ronda_schedule" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "ronda_schedule" ADD CONSTRAINT "ronda_schedule_one_source" CHECK (num_nonnulls(resident_id, house_id, name) = 1);
