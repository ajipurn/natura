import { beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "@/server/app";
import type { Bindings } from "@/server/env";
import { createTestEnv } from "./helpers/db";

let env: Bindings;
let session: string;
const dashboard = "dashboard.clusternatura.com";
const cookiePair = (cookie: string) => cookie.split(";")[0];

function request(host: string, path: string, method = "GET", json?: unknown, cookie?: string) {
  const origin = `https://${host}`;
  return app.request(`${origin}${path}`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: json === undefined ? undefined : JSON.stringify(json),
  }, env);
}

beforeAll(async () => {
  ({ env } = await createTestEnv());
  env.DEV = undefined;
  // Konfigurasi lama tidak boleh membuat QR dari dashboard baru kembali ke domain Vercel.
  env.APP_URL = "https://jimpitan-natura.vercel.app";
  const setup = await request(dashboard, "/api/auth/setup", "POST", { communityName: "Cluster Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  expect(setup.status).toBe(200);
  session = setup.headers.getSetCookie().find((cookie) => cookie.startsWith("jimpitan_session="))!;
});

describe("sesi antar-subdomain Natura", () => {
  it("cookie aman berlaku di Natura dan akun yang sama terbaca di petugas, dashboard, dan info", async () => {
    expect(session).toContain("Domain=clusternatura.com");
    expect(session).toContain("Secure");
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    for (const host of [dashboard, "app.clusternatura.com", "info.clusternatura.com"]) {
      const auth = await request(host, "/api/auth", "GET", undefined, cookiePair(session));
      expect(await auth.json()).toMatchObject({ user: { name: "Admin", role: "admin" } });
    }
  });

  it("QR dan link warga dari dashboard memakai Info warga walau konfigurasi lama masih ada", async () => {
    for (const path of ["/api/admin/rumah", "/api/admin/pengaturan"]) {
      const response = await request(dashboard, path, "GET", undefined, cookiePair(session));
      expect(await response.json()).toMatchObject({ origin: "https://info.clusternatura.com" });
    }
  });

  it("kode warga memakai cookie bersama tetapi tidak membuka API petugas atau admin", async () => {
    const created = await request(dashboard, "/api/admin/pengaturan/kode-warga", "POST", { enabled: true }, cookiePair(session));
    const { wargaCode } = await created.json();
    const entered = await request("info.clusternatura.com", "/api/warga/masuk", "POST", { code: wargaCode });
    expect(entered.status).toBe(200);
    const cookie = entered.headers.getSetCookie().find((value) => value.startsWith("jimpitan_warga="))!;
    expect(cookie).toContain("Domain=clusternatura.com");
    const access = await request("app.clusternatura.com", "/api/warga/akses", "GET", undefined, cookiePair(cookie));
    expect(await access.json()).toMatchObject({ access: true });
    expect((await request("app.clusternatura.com", "/api/ronda", "GET", undefined, cookiePair(cookie))).status).toBe(401);
    expect((await request(dashboard, "/api/admin/rumah", "GET", undefined, cookiePair(cookie))).status).toBe(401);
    const logout = await request("info.clusternatura.com", "/api/warga/keluar", "POST", {}, cookiePair(cookie));
    expect(logout.headers.getSetCookie()).toEqual(expect.arrayContaining([
      expect.stringMatching(/jimpitan_warga=;.*Domain=clusternatura\.com/),
      expect.stringMatching(/jimpitan_warga=;.*Path=\//),
    ]));
  });

  it("logout menghapus cookie bersama dan cookie host-only lama", async () => {
    const response = await request(dashboard, "/api/auth/logout", "POST", {}, cookiePair(session));
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.some((cookie) => cookie.includes("Domain=clusternatura.com") && cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((cookie) => !cookie.includes("Domain=") && cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("preview tidak memasang cookie domain Natura dan CSRF tetap memeriksa origin", async () => {
    const login = await request("preview.vercel.app", "/api/auth/login", "POST", { userId: 1, pin: "1234" });
    expect(login.status).toBe(200);
    expect(login.headers.getSetCookie().join(";")).not.toContain("Domain=");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const crossOrigin = await app.request(`https://${dashboard}/api/auth/logout`, {
        method: "POST", headers: { Origin: "https://app.clusternatura.com", "Content-Type": "text/plain", Cookie: cookiePair(session) }, body: "{}",
      }, env);
      expect(crossOrigin.ok).toBe(false);
      expect(crossOrigin.headers.getSetCookie()).toHaveLength(0);
    } finally {
      log.mockRestore();
    }
  });
});
