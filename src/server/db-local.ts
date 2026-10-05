import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createDb, type Db } from "./db";
import * as schema from "./schema";

/**
 * Database untuk development dan tes: PGlite (Postgres di dalam proses, tanpa instalasi), atau
 * Postgres sungguhan kalau `DATABASE_URL` diisi. Tidak ikut ke production (lihat `vercel.ts`).
 */
export const LOCAL_DB_DIR = ".data/pglite";
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export type LocalDb = { db: Db; close: () => Promise<void>; label: string };

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * PGlite hanya boleh dibuka satu proses. Penanda `<folder>.pid` mencegah seed membuka database
 * yang sedang dipakai `bun run dev` (bisa merusak datanya).
 */
function claim(dir: string) {
  const lock = `${dir}.pid`;
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    if (pid !== process.pid && isRunning(pid)) {
      throw new Error(`Database lokal (${dir}) sedang dipakai proses lain (pid ${pid}), biasanya \`bun run dev\`. Matikan dulu, lalu coba lagi.`);
    }
  }
  mkdirSync(path.dirname(lock), { recursive: true });
  writeFileSync(lock, String(process.pid));
  return () => rmSync(lock, { force: true });
}

/** PGlite di folder `location` (atau "memory"), sudah dimigrasi. */
export async function createPgliteDb(location: string): Promise<LocalDb> {
  const release = location === "memory" ? () => {} : claim(path.resolve(location));
  try {
    const client = location === "memory" ? new PGlite() : new PGlite(path.resolve(location));
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    process.once("exit", release);
    return {
      // Query builder-nya sama; tipe disamakan supaya kode lain tidak perlu tahu drivernya.
      db: db as unknown as Db,
      close: async () => {
        await client.close();
        release();
      },
      label: location === "memory" ? "PGlite (memori)" : `PGlite lokal (${location})`,
    };
  } catch (err) {
    release();
    throw err;
  }
}

/** `DATABASE_URL` kalau diisi (Postgres sungguhan, sudah dimigrasi lewat `bun run db:migrate`), selain itu PGlite lokal. */
export async function openLocalDb(url = process.env.DATABASE_URL): Promise<LocalDb> {
  if (!url) return createPgliteDb(LOCAL_DB_DIR);
  const db = createDb(url);
  return { db, close: () => db.$client.end(), label: `Postgres (${new URL(url).host})` };
}
