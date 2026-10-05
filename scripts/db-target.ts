import { openLocalDb, type LocalDb } from "../src/server/db-local";

/**
 * Database tujuan skrip (migrasi, seed):
 *   tanpa --remote → DATABASE_URL di .env.local, atau PGlite lokal (.data/pglite) kalau kosong
 *   --remote       → REMOTE_DATABASE_URL di .env.local (Supabase, "Session pooler" port 5432)
 */
export async function openTarget(remote: boolean): Promise<LocalDb> {
  if (!remote) return openLocalDb();
  const url = process.env.REMOTE_DATABASE_URL;
  if (!url) {
    console.error("✗ REMOTE_DATABASE_URL belum diisi di .env.local (lihat .env.example).");
    process.exit(1);
  }
  return openLocalDb(url);
}
