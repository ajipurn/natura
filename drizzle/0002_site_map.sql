CREATE TABLE "site_map" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"image_data" text,
	"image_type" text,
	"width" integer DEFAULT 1000 NOT NULL,
	"height" integer DEFAULT 1300 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_map" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "houses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patrols" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "map_x" double precision;--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "map_y" double precision;