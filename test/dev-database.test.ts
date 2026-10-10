import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { devDb, handleApi } from "@/server/dev";
import { openLocalDb, type LocalDb } from "@/server/db-local";

vi.mock("@/server/db-local", () => ({ openLocalDb: vi.fn() }));
const store = globalThis as typeof globalThis & { __naturaDevDb?: Promise<LocalDb>; __naturaDevDbUrl?: string };
let server: Server | undefined;
beforeEach(() => {
  delete store.__naturaDevDb; delete store.__naturaDevDbUrl;
  vi.mocked(openLocalDb).mockReset().mockResolvedValue({ label: "local", close: vi.fn(), db: {} } as unknown as LocalDb);
});
afterEach(async () => {
  delete store.__naturaDevDb; delete store.__naturaDevDbUrl; vi.unstubAllEnvs(); vi.restoreAllMocks();
  if (server) {
    const stopped = once(server, "close");
    server.close(); server.closeAllConnections();
    await stopped; server = undefined;
  }
});

/** Sama dengan middleware Vite: rejection diteruskan ke overlay, respons JSON diteruskan ke app. */
async function requestApi(vars: Record<string, string>, path = "/api/auth") {
  const overlay = vi.fn();
  server = createServer((req, res) => {
    void handleApi(req, res, vars).catch((err) => {
      overlay(err); res.writeHead(500); res.end("Vite error overlay");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Port tes tidak tersedia.");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  return { response, overlay };
}

it("env lokal kosong memilih PGlite meskipun proses mewarisi DATABASE_URL remote", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://reader@remote.example/app");
  await devDb({ DATABASE_URL: "" });
  expect(openLocalDb).toHaveBeenCalledWith("");
});

it("server dev menolak remote sebelum membuka koneksi", () => {
  expect(() => devDb({ DATABASE_URL: "postgresql://reader@remote.example/app" })).toThrow("localhost");
  expect(openLocalDb).not.toHaveBeenCalled();
});

it("cache hanya dipakai untuk database lokal yang sama", async () => {
  const vars = { DATABASE_URL: "postgresql://natura@127.0.0.1:5433/natura" };
  await devDb(vars); await devDb(vars);
  expect(openLocalDb).toHaveBeenCalledOnce();
  expect(() => devDb({ DATABASE_URL: "postgresql://natura@localhost:5432/another" })).toThrow("Mulai ulang");
});

it("cache koneksi dari versi lama harus ditutup dengan restart sebelum digunakan kembali", () => {
  store.__naturaDevDb = Promise.resolve({ label: "old", close: vi.fn() } as unknown as LocalDb);
  expect(() => devDb({ DATABASE_URL: "postgresql://natura@127.0.0.1:5433/natura" })).toThrow("Mulai ulang");
  expect(openLocalDb).not.toHaveBeenCalled();
});

it("konfigurasi remote mengirim pesan pemulihan JSON, bukan error overlay Vite", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { response, overlay } = await requestApi({ DATABASE_URL: "postgresql://reader:private-password@remote.example/app" });
  expect(response.status).toBe(503);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ title: "Database lokal belum siap", error: expect.stringContaining("make db-sync") });
  expect(JSON.stringify(body)).not.toMatch(/private-password|remote\.example|at localDatabaseUrl/);
  expect(overlay).not.toHaveBeenCalled();
  expect(openLocalDb).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalled();
});

it("perubahan target database meminta restart di dalam aplikasi", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await devDb({ DATABASE_URL: "postgresql://natura@localhost:5433/natura" });
  const { response, overlay } = await requestApi({ DATABASE_URL: "postgresql://natura@localhost:5432/another" });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining("bun run dev") });
  expect(overlay).not.toHaveBeenCalled();
});

it("kesalahan kode yang tidak dikenali tetap diteruskan ke Vite untuk debugging", async () => {
  const failure = new TypeError("Kesalahan kode saat membuka database");
  vi.mocked(openLocalDb).mockRejectedValue(failure);
  const { response, overlay } = await requestApi({ DATABASE_URL: "" });
  expect(response.status).toBe(500);
  expect(overlay).toHaveBeenCalledWith(failure);
});

it("konfigurasi valid tetap dilayani oleh API Hono", async () => {
  const { response, overlay } = await requestApi({ DATABASE_URL: "" }, "/api/tidak-ada");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Tidak ditemukan." });
  expect(overlay).not.toHaveBeenCalled();
});
