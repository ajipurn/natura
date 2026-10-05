import { migrate } from "drizzle-orm/d1/migrator";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll } from "vitest";
import { app } from "@/server/app";
import { createDb } from "@/server/db";
import type { Bindings } from "@/server/env";

/**
 * D1 sungguhan (Miniflare, di memori) yang sudah dimigrasi, satu per file tes.
 * Ditutup otomatis setelah tes di file itu selesai.
 */
export async function createTestEnv() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [{ name: "test", modules: true, script: "export default {}", d1Databases: { DB: "test-db" } }],
    }),
  );
  afterAll(() => mf.dispose());
  const d1 = await mf.getD1Database("DB");
  const db = createDb(d1);
  await migrate(db, { migrationsFolder: "drizzle" });
  const env: Bindings = {
    DB: d1,
    ASSETS: { fetch: async () => new Response("shell") },
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
