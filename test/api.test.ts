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

describe("petugas & jadwal yang bisa diubah", () => {
  async function userId(name: string) {
    const { data } = await admin.get("/api/admin/petugas");
    return (data.users as { id: number; name: string }[]).find((u) => u.name === name)!.id;
  }
  async function houseId(label: string) {
    const { data } = await admin.get("/api/admin/rumah");
    return (data.houses as { id: number; block: string; number: string }[]).find((h) => `${h.block}-${h.number}` === label)!.id;
  }
  type Slot = { id: number; day: number; position: number; name: string | null; block: string; number: string; userId: number | null };
  const schedule = async () => (await admin.get("/api/jadwal")).data.schedule as Slot[];

  it("impor jadwal menghubungkan nama ke akun petugas, termasuk nama kembar", async () => {
    await admin.post("/api/admin/petugas", { name: "Nino", pin: "1357", role: "petugas" });
    await admin.post("/api/admin/petugas", { name: "Wawan (AD-5)", pin: "2468", role: "petugas" });
    const res = await admin.put("/api/admin/jadwal", {
      text: "Senin: Nino (AB-3), Sahrul (AF-19)\nSabtu: Wawan (AD-5), Wawan (AF-7)",
      fillNames: false,
      overwriteNames: false,
    });
    expect(res.data.success).toMatch(/2 terhubung ke akun petugas/);
    const rows = await schedule();
    expect(rows.map((r) => [r.day, r.name, `${r.block}-${r.number}`, r.userId !== null])).toEqual([
      [1, "Nino", "AB-3", true],
      [1, "Sahrul", "AF-19", false],
      [6, "Wawan", "AD-5", true],
      [6, "Wawan", "AF-7", false],
    ]);
  });

  it("malam jaga dan rumah petugas diatur dari halaman petugas", async () => {
    const nino = await userId("Nino");
    const ab3 = await houseId("AB-3");
    const res = await admin.patch(`/api/admin/petugas/${nino}`, { name: "Nino", role: "petugas", active: true, houseId: ab3, days: [1, 3] });
    expect(res.data.success).toBe("Tersimpan.");
    let rows = await schedule();
    expect(rows.filter((r) => r.userId === nino).map((r) => [r.day, r.position, `${r.block}-${r.number}`])).toEqual([
      [1, 0, "AB-3"],
      [3, 0, "AB-3"],
    ]);
    const list = (await admin.get("/api/admin/petugas")).data.users as { id: number; house: string | null; days: number[] }[];
    expect(list.find((u) => u.id === nino)).toMatchObject({ house: "AB-3", days: [1, 3] });

    // Ganti nama akun: jadwal ikut berubah. Hapus Senin: barisnya hilang, urutan lain tetap.
    await admin.patch(`/api/admin/petugas/${nino}`, { name: "Nino Saputra", role: "petugas", active: true, houseId: ab3, days: [3] });
    rows = await schedule();
    expect(rows.filter((r) => r.day === 1).map((r) => r.name)).toEqual(["Sahrul"]);
    expect(rows.find((r) => r.userId === nino)).toMatchObject({ day: 3, name: "Nino Saputra" });

    // Petugas baru langsung dijadwalkan di urutan terakhir.
    const created = await admin.post("/api/admin/petugas", { name: "Tehe", pin: "8642", role: "petugas", houseId: await houseId("AB-9"), days: [1] });
    expect(created.status).toBe(200);
    rows = await schedule();
    expect(rows.filter((r) => r.day === 1).map((r) => r.name)).toEqual(["Sahrul", "Tehe"]);
  });

  it("jadwal hasil edit disimpan sekaligus, urutan mengikuti daftar", async () => {
    const rows = await schedule();
    const tehe = rows.find((r) => r.name === "Tehe")!;
    const slots = [
      { ...tehe, day: 0 },
      ...rows.filter((r) => r.id !== tehe.id),
      { day: 0, name: null, block: "AA", number: "8", userId: null },
      { day: 2, name: "Satpam", block: "", number: "", userId: null },
    ].map(({ day, name, block, number, userId }) => ({ day, name, block, number, userId }));
    const res = await admin.put("/api/admin/jadwal/slot", { slots });
    expect(res.data.success).toBe(`Jadwal disimpan (${slots.length} baris).`);
    const saved = await schedule();
    expect(saved.filter((r) => r.day === 0).map((r) => [r.position, r.name, `${r.block}-${r.number}`])).toEqual([
      [0, "Tehe", "AB-9"],
      [1, null, "AA-8"],
    ]);
    expect(saved.find((r) => r.name === "Satpam")).toMatchObject({ day: 2, block: "", houseId: null });

    const bad = await admin.put("/api/admin/jadwal/slot", { slots: [{ day: 0, name: "X", block: "", number: "", userId: 99999 }] });
    expect(bad.status).toBe(409);
    expect((await admin.put("/api/admin/jadwal/slot", { slots: [{ day: 0, name: null, block: "", number: "", userId: null }] })).status).toBe(400);
    // Jadwal lama tetap utuh setelah permintaan yang ditolak.
    expect(await schedule()).toHaveLength(saved.length);
  });

  it("menghapus rumah tidak menghapus petugasnya, hanya melepas rumahnya", async () => {
    await admin.post("/api/admin/rumah", { block: "ZZ", numbers: "1" });
    const zz1 = await houseId("ZZ-1");
    await admin.post("/api/admin/petugas", { name: "Penghuni ZZ", pin: "9753", role: "petugas", houseId: zz1 });
    expect((await admin.delete(`/api/admin/rumah/${zz1}`)).status).toBe(200);
    const list = (await admin.get("/api/admin/petugas")).data.users as { name: string; houseId: number | null }[];
    expect(list.find((u) => u.name === "Penghuni ZZ")).toMatchObject({ houseId: null });
  });
});

describe("warna jadwal & permintaan ubah jadwal", () => {
  type Slot = { id: number; day: number; position: number; name: string | null; userId: number | null; color: string | null; block: string };
  const schedule = async () => (await admin.get("/api/jadwal")).data.schedule as Slot[];
  let rudi: ReturnType<typeof apiClient>;
  let rudiId: number;

  it("warna ikut tersimpan dari editor dan dari impor tabel", async () => {
    const res = await admin.put("/api/admin/jadwal", {
      text: "Senin: Nino (AB-3), Sahrul (AF-19), (AB-5)",
      fillNames: false,
      overwriteNames: false,
      colors: ["green", null, "orange"],
    });
    expect(res.status).toBe(200);
    expect((await schedule()).map((s) => s.color)).toEqual(["green", null, "orange"]);
    // Jumlah warna tidak cocok dengan jadwal yang terbaca: warnanya diabaikan.
    await admin.put("/api/admin/jadwal", { text: "Senin: Nino (AB-3)", fillNames: false, overwriteNames: false, colors: ["green", "yellow"] });
    expect((await schedule()).map((s) => s.color)).toEqual([null]);

    const slots = (await schedule()).map(({ day, name, block, userId }) => ({ day, name, block, number: "3", userId, color: "yellow" }));
    await admin.put("/api/admin/jadwal/slot", { slots });
    expect((await schedule())[0].color).toBe("yellow");
  });

  it("petugas meminta pindah malam; admin menyetujui dan jadwal ikut berubah", async () => {
    const houses = (await admin.get("/api/admin/rumah")).data.houses as { id: number; block: string; number: string }[];
    const ab5 = houses.find((h) => h.block === "AB" && h.number === "5")!.id;
    await admin.post("/api/admin/petugas", { name: "Rudi", pin: "1470", role: "petugas", houseId: ab5, days: [2] });
    rudi = apiClient(env);
    const users = (await rudi.get("/api/auth/users")).data.users as { id: number; name: string }[];
    rudiId = users.find((u) => u.name === "Rudi")!.id;
    await rudi.post("/api/auth/login", { userId: rudiId, pin: "1470" });
    // Beri warna ke baris Rudi supaya terlihat ikut pindah.
    const rows = await schedule();
    await admin.put("/api/admin/jadwal/slot", {
      slots: rows.map(({ day, name, block, userId, color }) => ({
        day,
        name,
        block,
        number: block === "AB" && userId === rudiId ? "5" : "3",
        userId,
        color: userId === rudiId ? "orange" : color,
      })),
    });

    expect((await rudi.post("/api/jadwal/permintaan", { fromDay: 4, toDay: 5, note: "" })).data.error).toBe("Kamu tidak dijadwalkan di malam itu.");
    expect((await rudi.post("/api/jadwal/permintaan", { fromDay: 2, toDay: 2, note: "" })).status).toBe(400);
    const sent = await rudi.post("/api/jadwal/permintaan", { fromDay: 2, toDay: 5, note: "Shift malam di hari Selasa" });
    expect(sent.data.success).toMatch(/terkirim/);
    expect((await rudi.post("/api/jadwal/permintaan", { fromDay: 2, toDay: 6, note: "" })).data.error).toMatch(/Masih ada permintaan/);
    expect((await rudi.get("/api/admin/permintaan")).status).toBe(403);

    const list = await admin.get("/api/admin/permintaan");
    expect(list.data.pending).toBe(1);
    const request = (list.data.requests as { id: number; userName: string; house: string; days: number[] }[])[0];
    expect(request).toMatchObject({ userName: "Rudi", house: "AB-5", days: [2] });
    const dashboard = (await admin.get("/api/admin/ringkasan")).data as { todo: { pendingRequests: number } };
    expect(dashboard.todo.pendingRequests).toBe(1);

    const ok = await admin.post(`/api/admin/permintaan/${request.id}/setujui`, { response: "" });
    expect(ok.data.success).toMatch(/Disetujui/);
    const mine = (await schedule()).filter((s) => s.userId === rudiId);
    expect(mine.map((s) => [s.day, s.color])).toEqual([[5, "orange"]]);
    expect((await admin.post(`/api/admin/permintaan/${request.id}/tolak`, { response: "" })).status).toBe(409);
    const own = (await rudi.get("/api/jadwal/permintaan")).data.requests as { status: string }[];
    expect(own[0].status).toBe("approved");
  });

  it("permintaan bisa ditolak dengan alasan, atau dibatalkan petugas", async () => {
    await rudi.post("/api/jadwal/permintaan", { fromDay: 5, toDay: 0, note: "" });
    let pending = ((await admin.get("/api/admin/permintaan")).data.requests as { id: number; status: string }[]).find((r) => r.status === "pending")!;
    await admin.post(`/api/admin/permintaan/${pending.id}/tolak`, { response: "Ahad sudah penuh" });
    let own = (await rudi.get("/api/jadwal/permintaan")).data.requests as { status: string; response: string | null }[];
    expect(own[0]).toMatchObject({ status: "rejected", response: "Ahad sudah penuh" });
    expect((await schedule()).filter((s) => s.userId === rudiId).map((s) => s.day)).toEqual([5]);

    // Tambah malam tanpa melepas yang lama.
    await rudi.post("/api/jadwal/permintaan", { fromDay: null, toDay: 1, note: "" });
    pending = ((await admin.get("/api/admin/permintaan")).data.requests as { id: number; status: string }[]).find((r) => r.status === "pending")!;
    await admin.post(`/api/admin/permintaan/${pending.id}/setujui`, { response: "" });
    expect((await schedule()).filter((s) => s.userId === rudiId).map((s) => [s.day, s.block])).toEqual([
      [1, "AB"],
      [5, "AB"],
    ]);

    await rudi.post("/api/jadwal/permintaan", { fromDay: 1, toDay: 3, note: "" });
    own = (await rudi.get("/api/jadwal/permintaan")).data.requests as { id: number; status: string; response: string | null }[];
    const id = (own[0] as unknown as { id: number }).id;
    expect((await rudi.post(`/api/jadwal/permintaan/${id}/batal`)).data.success).toBe("Permintaan dibatalkan.");
    expect((await rudi.post(`/api/jadwal/permintaan/${id}/batal`)).status).toBe(409);
    expect((await admin.get("/api/admin/permintaan")).data.pending).toBe(0);
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
