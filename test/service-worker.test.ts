import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function worker(hostname: string, shell: string, assets: Record<string, string> = {}) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const cached = new Map([[shell, new Response("<html>App petugas tersimpan</html>")], ...Object.entries(assets).map(([path, content]) => [path, new Response(content)] as const)]);
  const cacheKey = (key: string | { url: string }) => typeof key === "string" ? key : new URL(key.url).pathname + new URL(key.url).search;
  const cache = {
    match: async (key: string | { url: string }) => cached.get(cacheKey(key))?.clone(),
    put: async (key: string | { url: string }, response: Response) => { cached.set(cacheKey(key), response); },
    add: vi.fn(async () => {}),
  };
  const network = vi.fn(async () => { throw new Error("offline"); });
  runInNewContext(script, {
    self: { location: { hostname, origin: `https://${hostname}` }, addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => handlers.set(name, handler), skipWaiting: vi.fn() },
    caches: { open: async () => cache }, fetch: network, Response, URL, setTimeout, clearTimeout,
  });
  async function navigate(pathname: string) {
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: { method: "GET", mode: "navigate", url: `https://${hostname}${pathname}` },
      respondWith: (value: Promise<Response>) => { response = value; },
    });
    return response;
  }
  return { navigate, network };
}

describe("app petugas bisa dibuka offline setelah pindah subdomain", () => {
  it("halaman app dan bookmark lama memakai shell di root subdomain", async () => {
    const sw = worker("app.clusternatura.com", "/");
    for (const path of ["/", "/ronda", "/jadwal", "/riwayat/2026-10-09", "/masuk", "/akun", "/app", "/app/", "/app/ronda", "/app/jadwal", "/app/riwayat/2026-10-09", "/app/masuk", "/petugas", "/info"]) {
      const response = await sw.navigate(path);
      expect(response?.status).toBe(200);
      expect(await response?.text()).toContain("App petugas tersimpan");
    }
  });

  it("bookmark Vercel lama dan alamat baru memakai shell /app/", async () => {
    const sw = worker("jimpitan-natura.vercel.app", "/app/");
    expect(await (await sw.navigate("/petugas/jadwal"))?.text()).toContain("App petugas tersimpan");
    expect(await (await sw.navigate("/app/jadwal"))?.text()).toContain("App petugas tersimpan");
    expect((await sw.navigate("/admin/rekap"))?.status).toBe(503);
  });

  it("QR rumah, dashboard, dan API tidak menerima salinan halaman ronda sebagai respons", async () => {
    const sw = worker("app.clusternatura.com", "/");
    const qr = await sw.navigate("/r/TOKEN");
    expect(qr?.status).toBe(503);
    expect(await qr?.text()).toContain("href='/'");
    expect((await sw.navigate("/api/auth"))?.status).toBe(503);
    for (const path of ["/dashboard", "/dashboard/rekap", "/dashboard/petugas", "/info/r/TOKEN"]) {
      expect((await sw.navigate(path))?.status).toBe(503);
    }
  });

  it("logo bawaan yang sudah disimpan tetap tampil saat offline", async () => {
    const logo = '<svg xmlns="http://www.w3.org/2000/svg"><title>Cluster Natura</title></svg>';
    const sw = worker("app.clusternatura.com", "/", { "/natura-logo.svg": logo });
    const response = await sw.navigate("/natura-logo.svg");
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe(logo);
    expect(sw.network).not.toHaveBeenCalled();
  });
});
