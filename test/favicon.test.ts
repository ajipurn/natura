import { beforeAll, describe, expect, it } from "vitest";
import { app } from "@/server/app";
import type { Bindings } from "@/server/env";
import { apiClient, createTestEnv } from "./helpers/db";

/** PNG 1×1 transparan. */
const pngUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let env: Bindings;
let admin: ReturnType<typeof apiClient>;

beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Aji", pin: "1234", pinConfirm: "1234" });
});

/** Favicon diminta browser tanpa login. */
const getFavicon = (headers: Record<string, string> = {}) => app.request("/api/logo/favicon", { headers }, env);

describe("favicon", () => {
  it("tanpa logo: ikon bawaan", async () => {
    const res = await getFavicon();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/icon.svg");
  });

  it("dengan logo: logo dalam kotak persegi, diperiksa ulang tiap halaman dibuka", async () => {
    await admin.put("/api/admin/pengaturan/logo", { logo: pngUrl });
    const res = await getFavicon();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const svg = await res.text();
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain(`href="${pngUrl}"`);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');

    // Logo yang sama: 304 tanpa isi. Logo diganti: versinya berubah, jadi isinya dikirim lagi.
    const etag = res.headers.get("etag")!;
    expect((await getFavicon({ "If-None-Match": etag })).status).toBe(304);
    await admin.put("/api/admin/pengaturan/logo", { logo: pngUrl });
    const changed = await getFavicon({ "If-None-Match": etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
  });

  it("logo dihapus: kembali ke ikon bawaan", async () => {
    await admin.put("/api/admin/pengaturan/logo", { logo: null });
    expect((await getFavicon()).headers.get("location")).toBe("/icon.svg");
  });
});
