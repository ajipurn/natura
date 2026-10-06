CREATE TYPE "public"."cash_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "cash_deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_deposits_date_unique" UNIQUE("date"),
	CONSTRAINT "cash_deposits_amount" CHECK ("cash_deposits"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cash_deposits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cash_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"direction" "cash_direction" NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_entries_amount" CHECK ("cash_entries"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cash_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_entries_date_idx" ON "cash_entries" USING btree ("date");