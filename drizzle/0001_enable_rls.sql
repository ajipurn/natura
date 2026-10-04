-- Supabase membuka tabel di skema "public" lewat Data API (PostgREST).
-- Aplikasi ini konek langsung sebagai pemilik tabel (RLS tidak berlaku untuknya),
-- jadi RLS tanpa policy cukup untuk menutup akses lewat API publik.
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "houses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patrols" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;
