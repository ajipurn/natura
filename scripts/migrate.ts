/**
 * Jalankan migrasi (folder drizzle/) ke Postgres.
 *
 *   bun run db:migrate          → DATABASE_URL, atau PGlite lokal (dimigrasi otomatis saat dibuka)
 *   bun run db:migrate:remote   → REMOTE_DATABASE_URL (Supabase), jalankan setiap ada migrasi baru
 *
 * Berhenti tanpa mengubah apa pun kalau database sudah berisi tabel dari skema lain (mis. riwayat
 * migrasi yang tidak ada di folder drizzle/), supaya data lama tidak tertimpa.
 */
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { openTarget } from "./db-target";

const remote = process.argv.includes("--remote");
const migrationsFolder = "drizzle";

async function main() {
  const target = await openTarget(remote);
  if (target.label.startsWith("PGlite")) {
    console.log(`✓ ${target.label} sudah dimigrasi.`);
    return target.close();
  }
  const { db } = target;
  console.log(`Migrasi ke ${target.label}…`);

  const local = new Set(readMigrationFiles({ migrationsFolder }).map((m) => m.hash));
  const [{ history }] = await db.execute<{ history: string | null }>(sql`select to_regclass('drizzle.__drizzle_migrations')::text as history`);
  const applied = history ? await db.execute<{ hash: string }>(sql`select hash from drizzle.__drizzle_migrations`) : [];
  const foreign = applied.filter((m) => !local.has(m.hash));
  const tables = await db.execute<{ name: string }>(
    sql`select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  if (foreign.length > 0 || (applied.length === 0 && tables.length > 0)) {
    console.error(
      `✗ Database ini sudah berisi skema lain (${tables.length} tabel: ${tables.map((t) => t.name).join(", ")}; ` +
        `${foreign.length} migrasi tidak dikenal). Tidak ada yang diubah.\n` +
        "  Cadangkan dulu (pg_dump), kosongkan databasenya, lalu jalankan migrasi lagi.",
    );
    await target.close();
    process.exit(1);
  }

  await migrate(db, { migrationsFolder });
  console.log(`✓ Migrasi selesai (${local.size} file, ${local.size - applied.length} baru).`);
  await target.close();
}

main().catch((err) => {
  console.error("✗ Migrasi gagal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
