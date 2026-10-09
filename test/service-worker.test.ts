import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function worker(hostname: string, shell: string) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const cached = new Map([[shell, new Response("<html>App petugas tersimpan</html>")]]);
  const cache = {
    match: async (key: string) => cached.get(key)?.clone(),
    put: async (key: string, response: Response) => { cached.set(key, response); },
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
  it("root, jadwal, dan riwayat di subdomain memakai shell yang disimpan di /", async () => {
    const sw = worker("app.clusternatura.com", "/");
    for (const path of ["/", "/jadwal", "/riwayat/2026-10-09", "/masuk"]) {
      const response = await sw.navigate(path);
      expect(response?.status).toBe(200);
      expect(await response?.text()).toContain("App petugas tersimpan");
    }
  });

  it("alamat Vercel lama masih memakai shell /petugas/", async () => {
    const sw = worker("jimpitan-natura.vercel.app", "/petugas/");
    expect(await (await sw.navigate("/petugas/jadwal"))?.text()).toContain("App petugas tersimpan");
    expect((await sw.navigate("/admin/rekap"))?.status).toBe(503);
  });

  it("QR dan API tidak menerima salinan halaman ronda sebagai respons", async () => {
    const sw = worker("app.clusternatura.com", "/");
    const qr = await sw.navigate("/r/TOKEN");
    expect(qr?.status).toBe(503);
    expect(await qr?.text()).toContain("href='/'");
    expect((await sw.navigate("/api/auth"))?.status).toBe(503);
  });
});
