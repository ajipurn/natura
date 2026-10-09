CREATE TABLE "residents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"house_id" integer,
	"user_id" integer,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "residents_name_source" CHECK (("residents"."user_id" is null and "residents"."name" is not null and length(trim("residents"."name")) > 0) or ("residents"."user_id" is not null and "residents"."name" is null and "residents"."house_id" is null))
);
--> statement-breakpoint
ALTER TABLE "residents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "residents_user_idx" ON "residents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "residents_house_idx" ON "residents" USING btree ("house_id");
--> statement-breakpoint
INSERT INTO "residents" ("user_id", "created_at") SELECT "id", "created_at" FROM "users";
--> statement-breakpoint
INSERT INTO "residents" ("name", "house_id", "created_at")
SELECT trim(h."owner_name"), h."id", h."created_at" FROM "houses" h
WHERE nullif(trim(h."owner_name"), '') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."house_id" = h."id");
--> statement-breakpoint
-- Nama dipindahkan, bukan disalin: profil akun tetap mengambil nama dari users.
UPDATE "houses" SET "owner_name" = NULL WHERE "owner_name" IS NOT NULL;
