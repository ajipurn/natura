CREATE TABLE "payment_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"house_id" integer NOT NULL,
	"effective_from" date NOT NULL,
	"cadence" text NOT NULL,
	"rate_per_night" integer NOT NULL,
	"due_timing" text NOT NULL,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"week_start" integer DEFAULT 1 NOT NULL,
	"recorded_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_plans_values" CHECK ("payment_plans"."rate_per_night" > 0 and "payment_plans"."grace_days" between 0 and 31 and "payment_plans"."week_start" between 0 and 6 and "payment_plans"."cadence" in ('daily', 'weekly', 'monthly') and "payment_plans"."due_timing" in ('start', 'end'))
);
--> statement-breakpoint
ALTER TABLE "payment_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jimpitan_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"house_id" integer NOT NULL,
	"received_date" date NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"cadence" text NOT NULL,
	"amount" integer NOT NULL,
	"received_by" text NOT NULL,
	"collector_id" integer,
	"note" text,
	"recorded_by" integer,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jimpitan_payments_values" CHECK ("jimpitan_payments"."amount" > 0 and "jimpitan_payments"."period_end" >= "jimpitan_payments"."period_start" and "jimpitan_payments"."cadence" in ('daily', 'weekly', 'monthly') and "jimpitan_payments"."received_by" in ('treasurer', 'collector'))
);
--> statement-breakpoint
ALTER TABLE "jimpitan_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_payment_id_jimpitan_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."jimpitan_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jimpitan_payments" ADD CONSTRAINT "jimpitan_payments_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jimpitan_payments" ADD CONSTRAINT "jimpitan_payments_collector_id_users_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jimpitan_payments" ADD CONSTRAINT "jimpitan_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_logs_payment_idx" ON "payment_logs" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_plans_house_date_idx" ON "payment_plans" USING btree ("house_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "jimpitan_payments_client_idx" ON "jimpitan_payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "jimpitan_payments_house_period_idx" ON "jimpitan_payments" USING btree ("house_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "jimpitan_payments_received_idx" ON "jimpitan_payments" USING btree ("received_date");