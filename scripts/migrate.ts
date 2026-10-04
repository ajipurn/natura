/**
 * Menjalankan migrasi database ke DATABASE_URL.
 * Pakai: `npm run db:migrate` (membaca .env / .env.local seperti Next.js).
 */
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  loadEnvConfig(process.cwd());
  const url = process.env.DATABASE_URL;

  if (!url || url.startsWith("pglite:")) {
    // PGlite dimigrasi otomatis saat dibuka.
    const { getDb } = await import("../src/server/db");
    await getDb();
    console.log("✓ Database lokal (PGlite) sudah dimigrasi.");
    return;
  }

  const client = postgres(url, { prepare: false, max: 1 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    console.log("✓ Migrasi selesai.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗ Migrasi gagal:", err);
  process.exit(1);
});
