import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { houses } from "@/server/schema";
import type { Db } from "@/server/db";
import type { Bindings } from "@/server/env";
import { apiClient, createTestEnv } from "./helpers/d1";

let db: Db;
let env: Bindings;
let admin: ReturnType<typeof apiClient>;

beforeAll(async () => {
  ({ db, env } = await createTestEnv());
  admin = apiClient(env);
});

describe("setup & login", () => {
  it("aplikasi baru minta setup, lalu admin pertama langsung masuk", async () => {
    const status = await admin.get("/api/auth");
    expect(status.data).toEqual({ setupNeeded: true, user: null });

    const bad = await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Aji", pin: "12", pinConfirm: "12" });
    expect(bad).toMatchObject({ status: 400, data: { error: "PIN harus 4–6 angka." } });

    const res = await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Aji", pin: "1234", pinConfirm: "1234" });
    expect(res.status).toBe(200);
    expect((await admin.get("/api/auth")).data).toMatchObject({ setupNeeded: false, user: { name: "Aji", role: "admin" } });

    const again = await apiClient(env).post("/api/auth/setup", { communityName: "X", defaultAmount: 500, name: "Lain", pin: "1234", pinConfirm: "1234" });
    expect(again.status).toBe(409);
  });

  it("permintaan paralel tidak bisa mencoba lebih dari 5 PIN", async () => {
    await admin.post("/api/admin/petugas", { name: "Penguji", pin: "4321", role: "petugas" });
    const { data } = await apiClient(env).get("/api/auth/users");
    const userId = (data.users as { id: number; name: string }[]).find((u) => u.name === "Penguji")!.id;

    const guest = apiClient(env);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => guest.post("/api/auth/login", { userId, pin: String(5000 + i) })),
    );
    expect(results.filter((r) => r.data.error?.startsWith("PIN salah")).length).toBeLessThanOrEqual(5);
    // PIN benar pun ditolak selama terkunci.
    const locked = await guest.post("/api/auth/login", { userId, pin: "4321" });
    expect(locked.data.error).toMatch(/Coba lagi dalam/);
  });

  it("petugas tidak bisa membuka API admin", async () => {
    await admin.post("/api/admin/petugas", { name: "Budi", pin: "1111", role: "petugas" });
    const budi = apiClient(env);
    const { data } = await budi.get("/api/auth/users");
    const userId = (data.users as { id: number; name: string }[]).find((u) => u.name === "Budi")!.id;
    expect((await budi.post("/api/auth/login", { userId, pin: "1111" })).status).toBe(200);
    expect((await budi.get("/api/ronda")).status).toBe(200);
    expect((await budi.get("/api/admin/rumah")).status).toBe(403);
    expect((await apiClient(env).get("/api/ronda")).status).toBe(401);
  });

  it("ganti PIN mengeluarkan sesi lain", async () => {
    const other = apiClient(env);
    const { data } = await other.get("/api/auth/users");
    const userId = (data.users as { id: number; name: string }[]).find((u) => u.name === "Budi")!.id;
    await other.post("/api/auth/login", { userId, pin: "1111" });
    const phone2 = apiClient(env);
    await phone2.post("/api/auth/login", { userId, pin: "1111" });

    const res = await other.post("/api/auth/pin", { currentPin: "1111", newPin: "2222", confirmPin: "2222" });
    expect(res.status).toBe(200);
    expect((await other.get("/api/ronda")).status).toBe(200);
    expect((await phone2.get("/api/ronda")).status).toBe(401);
  });
});

describe("rumah, ronda, riwayat", () => {
  it("mendaftarkan rumah dari denah (lebih dari batas parameter D1)", async () => {
    const res = await admin.post("/api/admin/rumah/dari-denah");
    expect(res.data.success).toMatch(/^76 rumah didaftarkan/);
    const list = await admin.get("/api/admin/rumah");
    expect((list.data.houses as unknown[]).length).toBe(76);
  });

  it("menambah, mengubah, dan menghapus rumah", async () => {
    expect((await admin.post("/api/admin/rumah", { block: "c", numbers: "1-3", ownerName: "" })).data.success).toBe(
      "3 rumah ditambahkan ke blok C.",
    );
    expect((await admin.post("/api/admin/rumah", { block: "C", numbers: "1" })).status).toBe(409);
    const [c1] = await db.select().from(houses).where(and(eq(houses.block, "C"), eq(houses.number, "1")));
    const dup = await admin.patch(`/api/admin/rumah/${c1.id}`, { block: "C", number: "2", ownerName: null, status: "active" });
    expect(dup.status).toBe(409);
    const del = await admin.delete(`/api/admin/rumah/${c1.id}`);
    expect(del.data).toEqual({ success: "Rumah dihapus." });
  });

  it("catatan ronda tersimpan, tampil di riwayat, rekap, dan halaman rumah", async () => {
    const snap = await admin.get("/api/ronda");
    const house = (snap.data.houses as { id: number; token: string; block: string; number: string }[]).find(
      (h) => h.block === "AD" && h.number === "3",
    )!;
    const sync = await admin.post("/api/ronda/catatan", {
      entries: [{ clientId: "a", houseId: house.id, status: "filled", amount: 500, method: "scan", recordedAt: new Date().toISOString() }],
    });
    expect(sync.data.results).toEqual([{ clientId: "a", ok: true, date: snap.data.date }]);

    const riwayat = await admin.get("/api/riwayat");
    expect(riwayat.data.patrols).toMatchObject([{ date: snap.data.date, filled: 1, total: 500, collectors: "Aji" }]);
    const detail = await admin.get(`/api/riwayat/${snap.data.date}`);
    expect(detail.data.collections).toMatchObject([{ houseId: house.id, status: "filled" }]);

    // Halaman rumah publik: tanpa nama KK, tanpa tombol catat.
    const page = await apiClient(env).get(`/api/rumah/${house.token}`);
    expect(page.data).toMatchObject({ user: null, house: { block: "AD", number: "3", ownerName: null } });
    expect((page.data.history as unknown[]).length).toBe(1);
    expect((await apiClient(env).post(`/api/rumah/${house.token}/catat`, { status: "empty", amount: 0 })).status).toBe(401);
    expect((await admin.post(`/api/rumah/${house.token}/catat`, { status: "empty", amount: 0 })).data).toEqual({ ok: true });

    // Koreksi admin.
    const fix = await admin.put(`/api/admin/riwayat/${snap.data.date}/${house.id}`, { status: "filled", amount: 1000 });
    expect(fix.data.success).toBe("Tersimpan.");
    const rekap = await admin.get(`/api/rekap?bulan=${(snap.data.date as string).slice(0, 7)}`);
    expect((rekap.data.cells as Record<string, unknown>)[`${house.id}:${snap.data.date}`]).toEqual({ status: "filled", amount: 1000 });

    const dash = await admin.get("/api/admin/ringkasan");
    expect(dash.data).toMatchObject({ tonight: { filled: 1, total: 1000 }, monthSummary: { nights: 1, total: 1000 } });
  });
});

describe("jadwal", () => {
  it("impor tabel jadwal (lebih dari batas parameter D1) dan isi nama KK", async () => {
    const days = ["AHAD", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
    const lots = ["AA-7", "AA-8", "AA-9", "AA-10", "AA-11", "AA-12", "AA-13", "AA-14", "AA-15", "AA-16", "AA-17", "AA-18"];
    const header = ["", ...days].join("\t");
    const rows = lots.map((lot, r) => [String(r + 1), ...days.map((_, d) => `WARGA ${r}${d} (${lot})`)].join("\t"));
    const res = await admin.put("/api/admin/jadwal", { text: [header, ...rows].join("\n"), fillNames: true, overwriteNames: false });
    expect(res.data.success).toMatch(/^84 baris jadwal tersimpan untuk 7 malam\. 0 nama KK diisi\./);
    // Setiap rumah muncul 7 kali dengan nama berbeda → nama ganda, tidak diisi.
    expect(res.data.success).toMatch(/Nama ganda/);

    const single = await admin.put("/api/admin/jadwal", { text: "Senin: Nino (AB-3), Sahrul (AF-19)", fillNames: true, overwriteNames: false });
    expect(single.data.success).toBe("2 baris jadwal tersimpan untuk 1 malam. 2 nama KK diisi.");
    const list = await admin.get("/api/jadwal");
    expect(list.data.schedule).toMatchObject([{ block: "AB", number: "3", name: "Nino", ownerName: "Nino" }, { name: "Sahrul" }]);
  });
});

describe("halaman warga", () => {
  it("tertutup sampai admin membuat kode, lalu terbuka dengan kode itu", async () => {
    const warga = apiClient(env);
    expect((await warga.get("/api/warga/akses")).data).toMatchObject({ enabled: false, access: false });
    expect((await warga.post("/api/warga/masuk", { code: "APAPUN" })).status).toBe(403);

    const { data } = await admin.post("/api/admin/pengaturan/kode-warga", { enabled: true });
    const code = data.wargaCode as string;
    expect(code).toMatch(/^[2-9A-Z]{8}$/);

    expect((await warga.get("/api/warga")).status).toBe(401);
    expect((await warga.post("/api/warga/masuk", { code: "SALAH123" })).status).toBe(400);
    expect((await warga.post("/api/warga/masuk", { code: code.toLowerCase() })).data).toEqual({ ok: true });

    await admin.post("/api/admin/pengumuman", { title: "Kerja bakti", body: "Minggu pagi jam 7.", pinned: true });
    await admin.put("/api/admin/kontak", { contacts: [{ name: "Pak RT", role: "Ketua RT", phone: "0812-3456-7890" }] });

    const info = await warga.get("/api/warga");
    expect(info.data).toMatchObject({
      communityName: "Natura",
      announcements: [{ title: "Kerja bakti", pinned: true }],
      contacts: [{ name: "Pak RT", phone: "0812-3456-7890" }],
    });
    const rekap = await warga.get("/api/warga/rekap");
    expect(rekap.data).toMatchObject({ nights: 1, total: 1000 });
    // Rekap warga tanpa nama KK.
    expect(JSON.stringify(rekap.data)).not.toMatch(/ownerName|Nino/);

    // Kode diganti: akses lama tidak berlaku.
    await admin.post("/api/admin/pengaturan/kode-warga", { enabled: true });
    expect((await warga.get("/api/warga")).status).toBe(401);
  });
});
