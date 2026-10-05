import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll } from "vitest";
import { app } from "@/server/app";
import { createDb, type Db } from "@/server/db";
import { createPgliteDb } from "@/server/db-local";
import type { Bindings } from "@/server/env";

// Didaftarkan saat file tes dimuat: afterAll yang dipanggil dari dalam beforeAll tidak dijalankan.
const cleanups: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * Database kosong yang sudah dimigrasi, satu per file tes, dan ditutup setelah tes di file itu selesai:
 * PGlite di memori, atau database baru di Postgres sungguhan kalau TEST_DATABASE_URL diisi
 * (mis. `TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres bun run test`).
 */
async function createTestDb(): Promise<Db> {
  const server = process.env.TEST_DATABASE_URL;
  if (!server) {
    const local = await createPgliteDb("memory");
    cleanups.push(local.close);
    return local.db;
  }
  const name = `natura_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: server });
  await admin.connect();
  await admin.query(`create database ${name}`);
  const url = new URL(server);
  url.pathname = `/${name}`;
  const db = createDb(url.href);
  await migrate(db, { migrationsFolder: "drizzle" });
  cleanups.push(async () => {
    await db.$client.end();
    await admin.query(`drop database ${name} with (force)`);
    await admin.end();
  });
  return db;
}

export async function createTestEnv() {
  const db = await createTestDb();
  const env: Bindings = {
    db,
    AUTH_SECRET: "test-secret-test-secret-test-secret-test",
    DEV: "1",
  };
  return { db, env };
}

/** Pemanggil API untuk tes, menyimpan cookie seperti browser. */
export function apiClient(env: Bindings) {
  const jar = new Map<string, string>();
  async function request(method: string, path: string, json?: unknown) {
    // Browser selalu mengirim Origin untuk POST/PUT/DELETE; dipakai pemeriksaan CSRF.
    const headers: Record<string, string> = { Origin: "http://localhost" };
    if (json !== undefined) headers["Content-Type"] = "application/json";
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await app.request(path, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) }, env);
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (/Max-Age=0/i.test(cookie) || value === "") jar.delete(name);
      else jar.set(name, value);
    }
    const data = res.headers.get("Content-Type")?.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data: data as Record<string, unknown> & { error?: string } };
  }
  return {
    get: (path: string) => request("GET", path),
    post: (path: string, json?: unknown) => request("POST", path, json ?? {}),
    put: (path: string, json?: unknown) => request("PUT", path, json ?? {}),
    patch: (path: string, json?: unknown) => request("PATCH", path, json ?? {}),
    delete: (path: string) => request("DELETE", path),
    cookies: jar,
  };
}
