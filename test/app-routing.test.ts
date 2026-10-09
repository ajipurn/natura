import { describe, expect, it } from "vitest";
import { loginNext } from "@/client/auth";
import { adminPath, appSurface, petugasPath, wargaOrigin, wargaPath } from "@/lib/app-paths";
import { domainRedirect, pageShell, vercelRoutes } from "../scripts/app-routing";

describe("alamat setiap bagian Natura", () => {
  it("memakai root pada subdomain sendiri dan URL lengkap saat pindah bagian", () => {
    expect(petugasPath("", "app.clusternatura.com")).toBe("/");
    expect(petugasPath("/jadwal", "app.clusternatura.com")).toBe("/jadwal");
    expect(adminPath("/rekap?bulan=2026-10", "dashboard.clusternatura.com")).toBe("/rekap?bulan=2026-10");
    expect(adminPath("/rumah", "app.clusternatura.com")).toBe("https://dashboard.clusternatura.com/rumah");
    expect(petugasPath("/", "dashboard.clusternatura.com")).toBe("https://app.clusternatura.com/");
    expect(wargaPath("/r/TOKEN", "app.clusternatura.com")).toBe("https://info.clusternatura.com/r/TOKEN");
    expect(wargaPath("", "clusternatura.com")).toBe("https://info.clusternatura.com/");
  });

  it("mempertahankan path development dan preview, termasuk host yang mirip Natura", () => {
    for (const hostname of ["localhost", "192.168.1.1", "jimpitan-natura.vercel.app", "app.clusternatura.com.example.org"]) {
      expect(appSurface(hostname)).toBeNull();
      expect(petugasPath("/jadwal", hostname)).toBe("/petugas/jadwal");
      expect(adminPath("", hostname)).toBe("/admin");
      expect(wargaPath("", hostname)).toBe("/");
    }
    expect(appSurface("APP.CLUSTERNATURA.COM.")).toBe("petugas");
  });

  it("QR dan kode warga memakai Info warga walaupun APP_URL diisi domain utama/dashboard", () => {
    expect(wargaOrigin("https://clusternatura.com/")).toBe("https://info.clusternatura.com");
    expect(wargaOrigin("https://dashboard.clusternatura.com")).toBe("https://info.clusternatura.com");
    expect(wargaOrigin("http://localhost:5173/")).toBe("http://localhost:5173");
  });

  it("login kembali ke QR atau path lama tanpa menerima redirect ke domain lain", () => {
    const host = "app.clusternatura.com";
    expect(loginNext("/r/TOKEN", "/", host)).toBe("https://info.clusternatura.com/r/TOKEN");
    expect(loginNext("/petugas/riwayat?bulan=2026-10", "/", host)).toBe("/riwayat?bulan=2026-10");
    expect(loginNext("/petugas?cari=Aji", "/", host)).toBe("/?cari=Aji");
    expect(loginNext("/admin/rekap", "/", host)).toBe("https://dashboard.clusternatura.com/rekap");
    expect(loginNext("/riwayat", "/", host)).toBe("/riwayat");
    expect(loginNext("/petugas?cari=Aji", "/", "dashboard.clusternatura.com")).toBe("/petugas?cari=Aji");
    for (const value of ["https://example.org", "//example.org", "/\\example.org"]) {
      expect(loginNext(value, "/", host)).toBe("/");
    }
    expect(loginNext("/r/TOKEN", "/petugas", "localhost")).toBe("/r/TOKEN");
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
    ["dashboard.clusternatura.com", "/rekap", "/admin/index.html"],
    ["dashboard.clusternatura.com", "/petugas", "/admin/index.html"],
    ["info.clusternatura.com", "/r/TOKEN", "/index.html"],
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
      for (const path of ["/assets/app.js", "/missing.png", "/sw.js", "/petugas-domain.webmanifest", "/@vite/client"]) {
        expect(pageShell(path, host)).toBeNull();
        expect(route(host, path)).toBeUndefined();
      }
    }
  });

  it("tautan lama diarahkan ke subdomain dengan filter/login tetap ada", () => {
    expect(domainRedirect(new URL("https://app.clusternatura.com/petugas/masuk?next=%2Fpetugas"))).toBe("https://app.clusternatura.com/masuk?next=%2Fpetugas");
    expect(domainRedirect(new URL("https://clusternatura.com/admin/rekap?bulan=2026-10"))).toBe("https://dashboard.clusternatura.com/rekap?bulan=2026-10");
    expect(domainRedirect(new URL("https://clusternatura.com/r/TOKEN"))).toBe("https://info.clusternatura.com/r/TOKEN");
    expect(route("app.clusternatura.com", "/petugas/masuk")).toMatchObject({ status: 308, headers: { Location: "https://app.clusternatura.com/$1" } });
    expect(domainRedirect(new URL("https://dashboard.clusternatura.com/petugas"))).toBeNull();
    expect(domainRedirect(new URL("https://dashboard.clusternatura.com/petugas?cari=Aji"))).toBeNull();
    expect(domainRedirect(new URL("https://info.clusternatura.com/r/TOKEN"))).toBeNull();
    expect(domainRedirect(new URL("http://localhost:5173/admin/rekap"))).toBeNull();
  });
});
