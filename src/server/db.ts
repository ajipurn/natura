import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
/** Transaksi dari `db.transaction`; query builder-nya sama dengan `Db`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** `Db` atau transaksi yang sedang berjalan. */
export type Executor = Db | Tx;

/** Query yang belum dijalankan (query builder Drizzle baru jalan saat di-await). */
export type Statement = PromiseLike<unknown>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Drizzle di atas Postgres sungguhan, mis. Supabase lewat "Transaction pooler" (port 6543).
 * Dibuat sekali per proses; koneksi dipakai bergantian oleh permintaan yang masuk.
 */
export function createDb(url: string): Db & { $client: postgres.Sql } {
  const local = LOCAL_HOSTS.has(new URL(url).hostname);
  const client = postgres(url, {
    // Connection pooler (Supabase/PgBouncer mode transaksi) tidak mendukung prepared statement.
    prepare: false,
    max: 5,
    // Tutup koneksi yang menganggur supaya function yang sedang tidur tidak memegang koneksi.
    idle_timeout: 20,
    connect_timeout: 10,
    // NOTICE dari Postgres (mis. "already exists, skipping" saat migrasi) tidak perlu dicetak.
    onnotice: () => {},
    ssl: local ? false : "require",
  });
  return drizzle(client, { schema });
}

/**
 * Jalankan beberapa query dalam satu transaksi: semua berhasil atau semua batal. Query dibuat dari
 * `tx` supaya ikut transaksinya, lalu dijalankan berurutan.
 */
export async function runBatch(db: Db, build: (tx: Tx) => Statement[]) {
  await db.transaction(async (tx) => {
    for (const statement of build(tx)) await statement;
  });
}
