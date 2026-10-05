import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
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
 *
 * Pakai `pg`, bukan postgres.js: postgres.js menumpuk query di satu koneksi (pipelining), dan query
 * berparameter yang menyusul query tanpa parameter tidak pernah dijawab lewat pooler mode transaksi,
 * jadi permintaannya menggantung. `pg` menjalankan satu query per koneksi dalam sekali kirim.
 */
export function createDb(url: string): Db & { $client: pg.Pool } {
  const local = LOCAL_HOSTS.has(new URL(url).hostname);
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    // Tutup koneksi yang menganggur supaya function yang sedang tidur tidak memegang koneksi.
    idleTimeoutMillis: 20_000,
    // Batas menunggu koneksi (termasuk antre saat kelima koneksi terpakai) dan menunggu jawaban
    // query: lewat dari itu jadi error, bukan permintaan yang menggantung selamanya.
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    ssl: local ? false : { rejectUnauthorized: false },
  });
  // Koneksi menganggur yang diputus server (mis. pooler) memancarkan "error"; tanpa pendengar
  // proses Node ikut mati. Pool membuang koneksi itu sendiri.
  pool.on("error", (err) => console.error("[db] koneksi menganggur terputus:", err.message));
  return drizzle(pool, { schema });
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
