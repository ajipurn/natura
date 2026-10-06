import { beforeAll, describe, expect, it } from "vitest";
import { app } from "@/server/app";
import type { Bindings } from "@/server/env";
import { MAX_LOGO_BYTES } from "@/server/logo";
import { apiClient, createTestEnv } from "./helpers/db";

/** PNG 1×1 transparan. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const pngUrl = `data:image/png;base64,${PNG}`;

let env: Bindings;
let admin: ReturnType<typeof apiClient>;

beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Aji", pin: "1234", pinConfirm: "1234" });
});

/** Gambar logo apa adanya (apiClient membaca isinya sebagai teks). */
const getLogo = (path = "/api/logo") => app.request(path, {}, env);

describe("logo lingkungan", () => {
  it("belum ada logo: alamatnya null dan gambarnya 404", async () => {
    expect((await admin.get("/api/admin/pengaturan")).data.logoUrl).toBeNull();
    expect((await getLogo()).status).toBe(404);
  });

  it("logo tersimpan, ikut di data halaman yang memakainya, dan gambarnya boleh disimpan lama di browser", async () => {
    const res = await admin.put("/api/admin/pengaturan/logo", { logo: pngUrl });
    expect(res.status).toBe(200);
    const logoUrl = res.data.logoUrl as string;
    expect(logoUrl).toMatch(/^\/api\/logo\?v=\d+$/);
    expect((await admin.get("/api/admin/pengaturan")).data.logoUrl).toBe(logoUrl);
    expect((await admin.get("/api/admin/rumah")).data.logoUrl).toBe(logoUrl);
    // Halaman warga dan halaman rumah terbuka tanpa login.
    expect((await apiClient(env).get("/api/warga/akses")).data.logoUrl).toBe(logoUrl);

    const image = await getLogo(logoUrl);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await image.arrayBuffer()).toString("base64")).toBe(PNG);
    // Tanpa versi: selalu diperiksa ulang.
    expect((await getLogo()).headers.get("cache-control")).toBe("no-cache");
  });

  it("logo baru mendapat alamat baru, dan alamat lama tidak lagi disimpan lama; dihapus = tidak ada logo", async () => {
    const before = (await admin.get("/api/admin/pengaturan")).data.logoUrl as string;
    const after = (await admin.put("/api/admin/pengaturan/logo", { logo: pngUrl })).data.logoUrl;
    expect(after).not.toBe(before);
    expect((await getLogo(before)).headers.get("cache-control")).toBe("no-cache");

    expect((await admin.put("/api/admin/pengaturan/logo", { logo: null })).data.logoUrl).toBeNull();
    expect((await admin.get("/api/admin/pengaturan")).data.logoUrl).toBeNull();
    expect((await getLogo()).status).toBe(404);
  });

  it("menolak isi yang bukan gambar, jenis lain, alamat luar, dan gambar yang terlalu besar", async () => {
    const tooBig = Buffer.concat([Buffer.from(PNG, "base64"), Buffer.alloc(MAX_LOGO_BYTES)]).toString("base64");
    const rejected = [
      // Berlabel PNG, isinya bukan PNG.
      `data:image/png;base64,${btoa("<script>alert(1)</script>")}`,
      `data:image/svg+xml;base64,${btoa("<svg xmlns='http://www.w3.org/2000/svg'/>")}`,
      "https://contoh.com/logo.png",
      `data:image/png;base64,${tooBig}`,
    ];
    for (const logo of rejected) {
      expect((await admin.put("/api/admin/pengaturan/logo", { logo })).status).toBe(400);
    }
    expect((await getLogo()).status).toBe(404);
  });

  it("hanya admin yang bisa mengganti logo", async () => {
    const res = await apiClient(env).put("/api/admin/pengaturan/logo", { logo: pngUrl });
    expect([401, 403]).toContain(res.status);
  });
});
