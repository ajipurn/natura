import { describe, expect, it } from "vitest";
import { loginNext } from "@/client/auth";
import { adminPath, appSurface, petugasPath, sameAppPath, wargaOrigin, wargaPath } from "@/lib/app-paths";
import { DOMAIN_MANIFESTS, domainRedirect, pageShell, vercelRoutes } from "../scripts/app-routing";

describe("alamat setiap bagian Natura", () => {
  it("memakai /dashboard dan /info, dengan URL relatif saat host-nya sama", () => {
    expect(petugasPath("", "app.clusternatura.com")).toBe("/");
    expect(petugasPath("/jadwal", "app.clusternatura.com")).toBe("/jadwal");
    expect(adminPath("/rekap?bulan=2026-10", "app.clusternatura.com")).toBe("/dashboard/rekap?bulan=2026-10");
    expect(adminPath("/rumah", "app.clusternatura.com")).toBe("/dashboard/rumah");
    expect(adminPath("", "app.clusternatura.com")).toBe("/dashboard");
    expect(adminPath("/petugas?cari=Aji", "app.clusternatura.com")).toBe("/dashboard/petugas?cari=Aji");
    expect(adminPath("/rumah", "clusternatura.com")).toBe("https://app.clusternatura.com/dashboard/rumah");
    expect(petugasPath("/", "dashboard.clusternatura.com")).toBe("https://app.clusternatura.com/");
    expect(wargaPath("/r/TOKEN", "app.clusternatura.com")).toBe("https://clusternatura.com/info/r/TOKEN");
    expect(wargaPath("", "clusternatura.com")).toBe("/info");
    expect(wargaPath("/r/TOKEN", "clusternatura.com")).toBe("/info/r/TOKEN");
    expect(wargaPath("?kode=ABCD", "clusternatura.com")).toBe("/info?kode=ABCD");
  });

  it("mempertahankan path development dan preview, termasuk host yang mirip Natura", () => {
    for (const hostname of ["localhost", "192.168.1.1", "jimpitan-natura.vercel.app", "app.clusternatura.com.example.org"]) {
      expect(appSurface(hostname)).toBeNull();
      expect(petugasPath("/jadwal", hostname)).toBe("/petugas/jadwal");
      expect(adminPath("", hostname)).toBe("/admin");
      expect(wargaPath("", hostname)).toBe("/");
    }
    expect(appSurface("APP.CLUSTERNATURA.COM.")).toBe("petugas");
    expect(appSurface("app.clusternatura.com", "/dashboard/rekap")).toBe("admin");
    expect(appSurface("app.clusternatura.com", "/dashboard-lain")).toBe("petugas");
    expect(appSurface("clusternatura.com", "/info/r/TOKEN")).toBe("warga");
    expect(appSurface("clusternatura.com", "/informasi")).toBe("landing");
  });

  it("QR dan kode warga memakai Info warga walaupun APP_URL diisi domain utama/dashboard", () => {
    for (const origin of ["https://clusternatura.com/", "https://app.clusternatura.com/dashboard", "https://dashboard.clusternatura.com", "https://info.clusternatura.com", "https://clusternatura.com/info/"]) {
      expect(wargaOrigin(origin)).toBe("https://clusternatura.com/info");
    }
    expect(wargaOrigin("http://localhost:5173/")).toBe("http://localhost:5173");
  });

  it("login kembali ke QR atau path lama tanpa menerima redirect ke domain lain", () => {
    const host = "app.clusternatura.com";
    expect(loginNext("/r/TOKEN", "/", host)).toBe("https://clusternatura.com/info/r/TOKEN");
    expect(loginNext("/info/r/TOKEN", "/", host)).toBe("https://clusternatura.com/info/r/TOKEN");
    expect(loginNext("/petugas/riwayat?bulan=2026-10", "/", host)).toBe("/riwayat?bulan=2026-10");
    expect(loginNext("/petugas?cari=Aji", "/", host)).toBe("/?cari=Aji");
    expect(loginNext("/admin/rekap", "/", host)).toBe("/dashboard/rekap");
    expect(loginNext("/dashboard/rekap?bulan=2026-10", "/", host)).toBe("/dashboard/rekap?bulan=2026-10");
    expect(loginNext("/riwayat", "/", host)).toBe("/riwayat");
    expect(loginNext("/petugas?cari=Aji", "/dashboard", host)).toBe("/dashboard/petugas?cari=Aji");
    expect(loginNext("/petugas?cari=Aji", "/", "dashboard.clusternatura.com")).toBe("https://app.clusternatura.com/dashboard/petugas?cari=Aji");
    for (const value of ["https://example.org", "//example.org", "/\\example.org"]) {
      expect(loginNext(value, "/", host)).toBe("/");
    }
    expect(loginNext("/r/TOKEN", "/petugas", "localhost")).toBe("/r/TOKEN");
  });

  it("manifest dashboard memakai cakupan /dashboard/, terpisah dari halaman awal petugas", () => {
    expect(DOMAIN_MANIFESTS.find((m) => m.target === "admin-domain.webmanifest")?.basePath).toBe("/dashboard/");
    expect(DOMAIN_MANIFESTS.find((m) => m.target === "petugas-domain.webmanifest")?.basePath).toBe("/");
  });

  it("login memuat halaman baru saat berpindah antara petugas, dashboard, dan QR", () => {
    const host = "app.clusternatura.com";
    expect(sameAppPath("/jadwal", "/", host)).toBe(true);
    expect(sameAppPath("/dashboard/rekap", "/", host)).toBe(false);
    expect(sameAppPath("/dashboard/petugas?cari=Aji", "/dashboard", host)).toBe(true);
    expect(sameAppPath("/jadwal", "/dashboard", host)).toBe(false);
    expect(sameAppPath("/dashboard-lain", "/dashboard", host)).toBe(false);
    expect(sameAppPath("https://clusternatura.com/info/r/TOKEN", "/", host)).toBe(false);
    expect(sameAppPath("/petugas/riwayat", "/petugas", "localhost")).toBe(true);
    expect(sameAppPath("/r/TOKEN", "/petugas", "localhost")).toBe(false);
    expect(sameAppPath("/admin-lain", "/admin", "localhost")).toBe(false);
  });
});

describe("routing HTML Vite dan Vercel", () => {
  // Jalankan aturan sebelum filesystem seperti Vercel. File statis yang ada tetap dilayani sendiri.
  function route(hostname: string, pathname: string) {
    for (const rule of vercelRoutes) {
      if (!("src" in rule) || !rule.src) continue;
      const match = pathname.match(new RegExp(rule.src));
      if (!match || ("continue" in rule && rule.continue)) continue;
      if ("has" in rule && !rule.has.every((condition) => condition.value === hostname)) continue;
      return rule;
    }
    return undefined;
  }

  it.each([
    ["clusternatura.com", "/", "/landing/index.html"],
    ["www.clusternatura.com", "/", "/landing/index.html"],
    ["app.clusternatura.com", "/", "/petugas/index.html"],
    ["app.clusternatura.com", "/riwayat/2026-10-09", "/petugas/index.html"],
    ["app.clusternatura.com", "/dashboard", "/admin/index.html"],
    ["app.clusternatura.com", "/dashboard/", "/admin/index.html"],
    ["app.clusternatura.com", "/dashboard/rekap", "/admin/index.html"],
    ["app.clusternatura.com", "/dashboard/petugas", "/admin/index.html"],
    ["app.clusternatura.com", "/dashboard/info", "/admin/index.html"],
    ["clusternatura.com", "/info", "/index.html"],
    ["clusternatura.com", "/info/", "/index.html"],
    ["clusternatura.com", "/info/r/TOKEN", "/index.html"],
    ["www.clusternatura.com", "/info/r/TOKEN", "/index.html"],
    ["localhost", "/admin/rekap", "/admin/index.html"],
    ["preview.vercel.app", "/petugas/jadwal", "/petugas/index.html"],
    ["localhost", "/landing/", "/landing/index.html"],
    ["localhost", "/", "/index.html"],
  ])("%s%s memilih %s", (hostname, pathname, shell) => {
    expect(pageShell(pathname, hostname)).toBe(shell);
    expect(route(hostname, pathname)).toMatchObject({ dest: shell });
  });

  it("API dan file statis tidak ditimpa halaman utama", () => {
    for (const host of ["app.clusternatura.com", "dashboard.clusternatura.com", "clusternatura.com"]) {
      expect(route(host, "/api/auth")).toMatchObject({ dest: "/api" });
      for (const path of ["/assets/app.js", "/missing.png", "/sw.js", "/petugas-domain.webmanifest", "/@vite/client", "/dashboard/missing.png", "/info/missing.png"]) {
        expect(pageShell(path, host)).toBeNull();
        expect(route(host, path)).toBeUndefined();
      }
    }
  });

  it.each([
    ["https://app.clusternatura.com/petugas/masuk?next=%2Fpetugas", "https://app.clusternatura.com/masuk?next=%2Fpetugas"],
    ["https://clusternatura.com/admin/rekap?bulan=2026-10", "https://app.clusternatura.com/dashboard/rekap?bulan=2026-10"],
    ["https://app.clusternatura.com/admin", "https://app.clusternatura.com/dashboard"],
    ["https://clusternatura.com/dashboard", "https://app.clusternatura.com/dashboard"],
    ["https://app.clusternatura.com/info?kode=ABCD", "https://clusternatura.com/info?kode=ABCD"],
    ["https://clusternatura.com/r/TOKEN", "https://clusternatura.com/info/r/TOKEN"],
    ["https://app.clusternatura.com/r/TOKEN", "https://clusternatura.com/info/r/TOKEN"],
    ["https://info.clusternatura.com/r/TOKEN", "https://clusternatura.com/info/r/TOKEN"],
    ["https://info.clusternatura.com/?kode=ABCD", "https://clusternatura.com/info?kode=ABCD"],
    ["https://dashboard.clusternatura.com/", "https://app.clusternatura.com/dashboard"],
    ["https://dashboard.clusternatura.com/rekap?bulan=2026-10", "https://app.clusternatura.com/dashboard/rekap?bulan=2026-10"],
    ["https://dashboard.clusternatura.com/petugas?cari=Aji", "https://app.clusternatura.com/dashboard/petugas?cari=Aji"],
    ["https://dashboard.clusternatura.com/info", "https://app.clusternatura.com/dashboard/info"],
  ])("redirect %s ke %s konsisten di Vite/Vercel dan tidak berulang", (from, to) => {
    const source = new URL(from);
    expect(domainRedirect(source)).toBe(to);
    const rule = route(source.hostname, source.pathname);
    expect(rule).toMatchObject({ status: 308 });
    if (!rule || !("headers" in rule) || !rule.headers || !("Location" in rule.headers)) throw new Error("Missing redirect Location");
    const match = source.pathname.match(new RegExp(rule!.src!))!;
    expect(rule.headers.Location!.replace(/\$(\d+)/g, (_, group) => match[Number(group)] ?? "") + source.search).toBe(to);
    expect(domainRedirect(new URL(to))).toBeNull();
  });

  it("alamat baru dan localhost tidak diarahkan ulang", () => {
    for (const url of ["https://clusternatura.com/info/r/TOKEN", "https://app.clusternatura.com/dashboard/petugas", "https://app.clusternatura.com/dashboard/info", "https://app.clusternatura.com/jadwal"]) {
      expect(domainRedirect(new URL(url))).toBeNull();
    }
    expect(domainRedirect(new URL("http://localhost:5173/admin/rekap"))).toBeNull();
  });
});
