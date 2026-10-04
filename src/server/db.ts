import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as { __jimpitanDb?: Promise<Db> };

/**
 * DATABASE_URL:
 * - kosong / `pglite:<folder>` / `pglite:memory` → Postgres lokal (PGlite), dimigrasi otomatis.
 *   Cocok untuk development tanpa perlu install apa pun.
 * - `postgres://...` → Postgres sungguhan (mis. Supabase). Jalankan `npm run db:migrate` dulu.
 */
export function getDb(): Promise<Db> {
  globalForDb.__jimpitanDb ??= createDb(process.env.DATABASE_URL).catch(
    (err) => {
      globalForDb.__jimpitanDb = undefined;
      throw err;
    },
  );
  return globalForDb.__jimpitanDb;
}

async function createDb(url: string | undefined): Promise<Db> {
  if (!url || url.startsWith("pglite:")) {
    return createPgliteDb(url?.slice("pglite:".length) || ".data/pglite");
  }
  // `prepare: false` supaya kompatibel dengan connection pooler (Supabase/PgBouncer).
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzlePostgres(client, { schema });
}

async function createPgliteDb(location: string): Promise<Db> {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const client =
    location === "memory"
      ? new PGlite()
      : // Hanya untuk development lokal; jangan buat Turbopack menelusuri seluruh proyek.
        new PGlite(path.resolve(/*turbopackIgnore: true*/ process.cwd(), location));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  // API query builder-nya sama; tipe disamakan supaya kode lain tidak perlu tahu drivernya.
  return db as unknown as Db;
}
