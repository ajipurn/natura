ALTER TYPE "public"."role" ADD VALUE 'ketua';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'sekretaris';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'bendahara';--> statement-breakpoint
CREATE TABLE "dues_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"month" text NOT NULL,
	"amount" integer NOT NULL,
	"due_date" date NOT NULL,
	"cancelled_at" timestamp with time zone,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dues_invoices_amount" CHECK ("dues_invoices"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "dues_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dues_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"receipt_id" integer,
	"action" text NOT NULL,
	"amount" integer NOT NULL,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dues_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dues_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"date" date NOT NULL,
	"method" text NOT NULL,
	"note" text,
	"proof" text,
	"cancelled_at" timestamp with time zone,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dues_receipts_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "dues_receipts_values" CHECK ("dues_receipts"."amount" > 0 and "dues_receipts"."method" in ('cash', 'transfer'))
);
--> statement-breakpoint
ALTER TABLE "dues_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dues_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"cadence" text NOT NULL,
	"start_month" text NOT NULL,
	"due_day" integer DEFAULT 10 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dues_types_values" CHECK ("dues_types"."amount" > 0 and "dues_types"."due_day" between 1 and 31 and "dues_types"."cadence" in ('monthly', 'once'))
);
--> statement-breakpoint
ALTER TABLE "dues_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "families" (
	"id" serial PRIMARY KEY NOT NULL,
	"head_resident_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "families" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "residence_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"resident_id" integer NOT NULL,
	"from_house_id" integer,
	"to_house_id" integer,
	"date" date NOT NULL,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "residence_moves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "family_id" integer;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "family_relation" text;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "housing_status" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "resident_since" date;--> statement-breakpoint
ALTER TABLE "dues_invoices" ADD CONSTRAINT "dues_invoices_type_id_dues_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."dues_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_invoices" ADD CONSTRAINT "dues_invoices_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_invoices" ADD CONSTRAINT "dues_invoices_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_logs" ADD CONSTRAINT "dues_logs_invoice_id_dues_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."dues_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_logs" ADD CONSTRAINT "dues_logs_receipt_id_dues_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."dues_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_logs" ADD CONSTRAINT "dues_logs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_receipts" ADD CONSTRAINT "dues_receipts_invoice_id_dues_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."dues_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_receipts" ADD CONSTRAINT "dues_receipts_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_head_resident_id_residents_id_fk" FOREIGN KEY ("head_resident_id") REFERENCES "public"."residents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residence_moves" ADD CONSTRAINT "residence_moves_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residence_moves" ADD CONSTRAINT "residence_moves_from_house_id_houses_id_fk" FOREIGN KEY ("from_house_id") REFERENCES "public"."houses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residence_moves" ADD CONSTRAINT "residence_moves_to_house_id_houses_id_fk" FOREIGN KEY ("to_house_id") REFERENCES "public"."houses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residence_moves" ADD CONSTRAINT "residence_moves_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dues_invoices_period_idx" ON "dues_invoices" USING btree ("type_id","house_id","month");--> statement-breakpoint
CREATE INDEX "dues_receipts_invoice_idx" ON "dues_receipts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "dues_receipts_date_idx" ON "dues_receipts" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "families_head_idx" ON "families" USING btree ("head_resident_id");--> statement-breakpoint
CREATE INDEX "residence_moves_resident_idx" ON "residence_moves" USING btree ("resident_id");--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "residents_family_idx" ON "residents" USING btree ("family_id");--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_housing_status" CHECK ("residents"."housing_status" in ('unknown', 'owner', 'tenant', 'family', 'other'));--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_family_relation" CHECK ("residents"."family_relation" is null or "residents"."family_relation" in ('head', 'spouse', 'child', 'parent', 'other'));