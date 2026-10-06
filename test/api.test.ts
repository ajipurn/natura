import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, formatMonth, rondaDate } from "@/lib/dates";
import { scheduleDay, slotHouseLabel } from "@/lib/schedule";
import { houses } from "@/server/schema";
import type { Db } from "@/server/db";
import type { Bindings } from "@/server/env";
import { apiClient, createTestEnv } from "./helpers/db";

type Slot = {
  id: number;
  day: number;
  position: number;
  name: string | null;
  block: string;
  number: string;
  houseId: number | null;
  ownerName: string | null;
  userId: number | null;
  color: string | null;
};

/** Baris jadwal dari API → isi yang dikirim editor jadwal (akun, rumah, atau nama). */
const toInput = (s: Pick<Slot, "day" | "name" | "houseId" | "userId" | "color">) => ({
  day: s.day,
  color: s.color,
  userId: s.userId,
  houseId: s.userId ? null : s.houseId,
  name: s.userId || s.houseId ? null : s.name,
});

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
  it("mendaftarkan semua rumah dari denah sekaligus", async () => {
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
    // Scan/catat hanya untuk yang jaga malam ini, admin juga: jadwalkan Aji malam ini dulu.
    const { users: list, me } = (await admin.get("/api/admin/petugas")).data as { users: { id: number }[]; me: { id: number } };
    expect(list.length).toBeGreaterThan(0);
    await admin.patch(`/api/admin/petugas/${me.id}`, {
      name: "Aji",
      role: "admin",
      active: true,
      houseId: null,
      days: [scheduleDay(rondaDate(new Date()))],
    });
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
    // Jumlah rumah dihuni untuk menghitung yang belum dicek tiap malam.
    expect(riwayat.data).toMatchObject({ today: snap.data.date, activeHouses: (snap.data.houses as { status: string }[]).filter((h) => h.status === "active").length });
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

  it("admin mengisi dan mengubah catatan banyak rumah sekaligus, untuk malam mana pun yang sudah lewat", async () => {
    const [a, b, c] = ((await admin.get("/api/admin/rumah")).data.houses as { id: number }[]).map((h) => h.id);
    const date = "2025-03-15";
    const fill = await admin.put(`/api/admin/riwayat/${date}`, {
      entries: [
        { houseId: a, status: "filled", amount: 500 },
        { houseId: b, status: "filled", amount: 500 },
        { houseId: c, status: "empty", amount: 0 },
        // Rumah yang muncul dua kali memakai isian terakhirnya.
        { houseId: b, status: "filled", amount: 2000 },
      ],
    });
    expect(fill.data.success).toBe("3 rumah tersimpan.");
    await admin.put(`/api/admin/riwayat/${date}/${a}`, { status: "none", amount: 0 });

    const rekap = (await admin.get("/api/rekap?bulan=2025-03")).data;
    expect(rekap).toMatchObject({ dates: [date], defaultAmount: 500 });
    expect(rekap.cells).toEqual({
      [`${b}:${date}`]: { status: "filled", amount: 2000 },
      [`${c}:${date}`]: { status: "empty", amount: 0 },
    });
    // Kalender riwayat: semua malam satu bulan, juga yang di luar 90 malam terbaru.
    const calendar = (await admin.get("/api/riwayat?bulan=2025-03")).data;
    expect(calendar.patrols).toMatchObject([{ date, filled: 1, empty: 1, total: 2000 }]);
    expect((await admin.get("/api/riwayat?bulan=2025-04")).data.patrols).toEqual([]);
    const audit = (await admin.get(`/api/admin/audit?tanggal=${date}`)).data as { logs: { method: string }[] };
    expect(audit.logs.map((l) => l.method)).toEqual(["koreksi", "koreksi", "koreksi", "koreksi"]);

    const tomorrow = addDays(rondaDate(new Date()), 1);
    const one = (status: string, amount: number, houseId = a) => ({ entries: [{ houseId, status, amount }] });
    expect((await admin.put(`/api/admin/riwayat/${tomorrow}`, one("empty", 0))).data).toEqual({ error: "Tanggalnya belum lewat." });
    expect((await admin.put(`/api/admin/riwayat/${date}`, one("filled", 0))).data).toEqual({ error: "Isi nominal yang benar." });
    expect((await admin.put(`/api/admin/riwayat/${date}`, one("empty", 0, 999_999))).status).toBe(404);
    expect((await admin.put(`/api/admin/riwayat/${date}`, { entries: [] })).status).toBe(400);
  });
});

describe("jadwal", () => {
  it("impor tabel jadwal lengkap dan isi nama KK", async () => {
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
    // Rumah tanpa akun: nama dari jadwal jadi nama KK, baris jadwalnya hanya menunjuk rumah.
    const list = await admin.get("/api/jadwal");
    expect(list.data.schedule).toMatchObject([
      { block: "AB", number: "3", name: null, ownerName: "Nino" },
      { block: "AF", number: "19", name: null, ownerName: "Sahrul" },
    ]);
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
  const schedule = async () => (await admin.get("/api/jadwal")).data.schedule as Slot[];

  it("impor jadwal menghubungkan nama ke akun petugas, termasuk nama kembar", async () => {
    await admin.post("/api/admin/petugas", { name: "Nino", pin: "1357", role: "petugas" });
    await admin.post("/api/admin/petugas", { name: "Wawan", pin: "2468", role: "petugas", houseId: await houseId("AD-5") });
    const res = await admin.put("/api/admin/jadwal", {
      text: "Senin: Nino (AB-3), Sahrul (AF-19)\nSabtu: Wawan (AD-5), Wawan (AF-7)",
      fillNames: false,
      overwriteNames: false,
    });
    expect(res.data.success).toMatch(/2 terhubung ke akun petugas\. 1 petugas diisi rumahnya\./);
    const rows = await schedule();
    // Wawan di AF-7 orang lain (rumahnya beda); Nino yang belum punya rumah diisi AB-3.
    expect(rows.map((r) => [r.day, r.name, `${r.block}-${r.number}`, r.userId !== null])).toEqual([
      [1, "Nino", "AB-3", true],
      [1, null, "AF-19", false],
      [6, "Wawan", "AD-5", true],
      [6, null, "AF-7", false],
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
    expect(rows.filter((r) => r.day === 1).map(slotHouseLabel)).toEqual(["AF-19"]);
    expect(rows.find((r) => r.userId === nino)).toMatchObject({ day: 3, name: "Nino Saputra" });

    // Petugas baru langsung dijadwalkan di urutan terakhir.
    const created = await admin.post("/api/admin/petugas", { name: "Tehe", pin: "8642", role: "petugas", houseId: await houseId("AB-9"), days: [1] });
    expect(created.status).toBe(200);
    rows = await schedule();
    expect(rows.filter((r) => r.day === 1).map((r) => r.name ?? slotHouseLabel(r))).toEqual(["AF-19", "Tehe"]);
  });

  it("jadwal hasil edit disimpan sekaligus, urutan mengikuti daftar", async () => {
    const rows = await schedule();
    const tehe = rows.find((r) => r.name === "Tehe")!;
    const slots = [
      toInput({ ...tehe, day: 0 }),
      ...rows.filter((r) => r.id !== tehe.id).map(toInput),
      { day: 0, houseId: await houseId("AA-8") },
      { day: 2, name: "Satpam" },
      // Rumah yang dihuni petugas disimpan sebagai baris petugas itu.
      { day: 4, houseId: await houseId("AB-9") },
    ];
    const res = await admin.put("/api/admin/jadwal/slot", { slots });
    expect(res.data.success).toBe(`Jadwal disimpan (${slots.length} baris).`);
    const saved = await schedule();
    expect(saved.filter((r) => r.day === 0).map((r) => [r.position, r.name, `${r.block}-${r.number}`])).toEqual([
      [0, "Tehe", "AB-9"],
      [1, null, "AA-8"],
    ]);
    expect(saved.find((r) => r.name === "Satpam")).toMatchObject({ day: 2, block: "", houseId: null, userId: null });
    expect(saved.find((r) => r.day === 4)).toMatchObject({ name: "Tehe", userId: tehe.userId });

    expect((await admin.put("/api/admin/jadwal/slot", { slots: [{ day: 0, userId: 99999 }] })).status).toBe(409);
    expect((await admin.put("/api/admin/jadwal/slot", { slots: [{ day: 0, houseId: 99999 }] })).status).toBe(409);
    expect((await admin.put("/api/admin/jadwal/slot", { slots: [{ day: 0 }] })).status).toBe(400);
    expect((await admin.put("/api/admin/jadwal/slot", { slots: [{ day: 0, name: "X", houseId: await houseId("AA-8") }] })).status).toBe(400);
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

    const slots = (await schedule()).map((s) => ({ ...toInput(s), color: "yellow" }));
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
    // Malam jaga dari dialog petugas: hijau (aktif), bukan putih yang disembunyikan dari petugas.
    expect((await schedule()).filter((s) => s.userId === rudiId).map((s) => s.color)).toEqual(["green"]);
    // Beri warna ke baris Rudi supaya terlihat ikut pindah.
    const rows = await schedule();
    await admin.put("/api/admin/jadwal/slot", {
      slots: rows.map((s) => ({ ...toInput(s), color: s.userId === rudiId ? "orange" : s.color })),
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
    // Malam tambahan hijau; malam lama tetap dengan warnanya.
    expect((await schedule()).filter((s) => s.userId === rudiId).map((s) => [s.day, s.block, s.color])).toEqual([
      [1, "AB", "green"],
      [5, "AB", "orange"],
    ]);

    await rudi.post("/api/jadwal/permintaan", { fromDay: 1, toDay: 3, note: "" });
    own = (await rudi.get("/api/jadwal/permintaan")).data.requests as { id: number; status: string; response: string | null }[];
    const id = (own[0] as unknown as { id: number }).id;
    expect((await rudi.post(`/api/jadwal/permintaan/${id}/batal`)).data.success).toBe("Permintaan dibatalkan.");
    expect((await rudi.post(`/api/jadwal/permintaan/${id}/batal`)).status).toBe(409);
    expect((await admin.get("/api/admin/permintaan")).data.pending).toBe(0);
  });
});

describe("satu sumber: nama warga di akun petugas", () => {
  type House = { id: number; block: string; number: string; ownerName: string | null };
  const house = async (label: string) =>
    ((await admin.get("/api/admin/rumah")).data.houses as House[]).find((h) => `${h.block}-${h.number}` === label)!;
  const schedule = async () => (await admin.get("/api/jadwal")).data.schedule as Slot[];
  const account = async (id: number) =>
    ((await admin.get("/api/admin/petugas")).data.users as { id: number; name: string; house: string | null }[]).find((u) => u.id === id)!;
  let budi: number;

  it("rumah tanpa akun yang dipilih untuk petugas: nama KK diganti nama akun, jadwal rumahnya jadi jadwal petugas", async () => {
    await admin.post("/api/admin/rumah", { block: "YY", numbers: "1-3" });
    const yy1 = (await house("YY-1")).id;
    await admin.patch(`/api/admin/rumah/${yy1}`, { block: "YY", number: "1", ownerName: "Pak Bambang", status: "active" });
    // Rumah YY-1 dijadwalkan Rabu dan Jumat sebelum punya akun.
    const before = await schedule();
    await admin.put("/api/admin/jadwal/slot", { slots: [...before.map(toInput), { day: 3, houseId: yy1 }, { day: 5, houseId: yy1 }] });
    expect((await schedule()).filter((s) => s.houseId === yy1).map((s) => [s.day, s.ownerName])).toEqual([
      [3, "Pak Bambang"],
      [5, "Pak Bambang"],
    ]);

    // Petugas baru di YY-1 yang jaga Rabu saja: baris Rabu jadi miliknya, baris Jumat dihapus.
    const res = await admin.post("/api/admin/petugas", { name: "Bambang", pin: "1593", role: "petugas", houseId: yy1, days: [3] });
    expect(res.data).toMatchObject({ id: expect.any(Number) });
    budi = res.data.id as number;
    const rows = (await schedule()).filter((s) => s.houseId === yy1);
    expect(rows.map((s) => [s.day, s.name, s.userId])).toEqual([[3, "Bambang", budi]]);
    expect((await house("YY-1")).ownerName).toBe("Bambang");
    expect(await schedule()).toHaveLength(before.length + 1);
  });

  it("ganti nama di petugas atau di data rumah: semua layar ikut", async () => {
    await admin.patch(`/api/admin/petugas/${budi}`, { name: "Bambang Santoso", role: "petugas", active: true, houseId: (await house("YY-1")).id, days: [3] });
    expect((await house("YY-1")).ownerName).toBe("Bambang Santoso");
    expect((await schedule()).find((s) => s.userId === budi)).toMatchObject({ name: "Bambang Santoso", ownerName: "Bambang Santoso" });
    const snap = (await admin.get("/api/ronda")).data as { houses: House[] };
    expect(snap.houses.find((h) => h.block === "YY" && h.number === "1")?.ownerName).toBe("Bambang Santoso");

    // Dari halaman Rumah: nama akun penghuninya yang berubah.
    const yy1 = (await house("YY-1")).id;
    const res = await admin.patch(`/api/admin/rumah/${yy1}`, { block: "YY", number: "1", ownerName: "Pak Bambang Santoso", status: "active" });
    expect(res.data.success).toBe("Tersimpan.");
    expect((await account(budi)).name).toBe("Pak Bambang Santoso");
    expect((await admin.patch(`/api/admin/rumah/${yy1}`, { block: "YY", number: "1", ownerName: "", status: "active" })).status).toBe(400);
  });

  it("pindah rumah: nama dan jadwal ikut orangnya, rumah lama tidak bernama lagi", async () => {
    const yy2 = (await house("YY-2")).id;
    await admin.patch(`/api/admin/petugas/${budi}`, { name: "Pak Bambang Santoso", role: "petugas", active: true, houseId: yy2, days: [3] });
    expect((await house("YY-1")).ownerName).toBeNull();
    expect((await house("YY-2")).ownerName).toBe("Pak Bambang Santoso");
    expect(slotHouseLabel((await schedule()).find((s) => s.userId === budi)!)).toBe("YY-2");
  });

  it("nama kembar boleh asal rumahnya beda; halaman masuk menampilkan rumahnya", async () => {
    const yy3 = (await house("YY-3")).id;
    const twin = await admin.post("/api/admin/petugas", { name: "Pak Bambang Santoso", pin: "7531", role: "petugas", houseId: yy3 });
    expect(twin.status).toBe(200);
    expect((await admin.post("/api/admin/petugas", { name: "pak bambang santoso", pin: "7531", role: "petugas", houseId: yy3 })).status).toBe(409);
    expect((await admin.post("/api/admin/petugas", { name: "Pak Bambang Santoso", pin: "7531", role: "petugas" })).status).toBe(409);
    const login = (await apiClient(env).get("/api/auth/users")).data.users as { name: string; house: string | null }[];
    expect(login.filter((u) => u.name === "Pak Bambang Santoso").map((u) => u.house)).toEqual(["YY-2", "YY-3"]);
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

    // Rumah tanpa akun dan tanpa nama warga di jadwal: tidak ikut ditampilkan ke warga.
    await admin.post("/api/admin/rumah", { block: "ZZ", numbers: "1" });
    const zz1 = ((await admin.get("/api/admin/rumah")).data.houses as { id: number; block: string }[]).find((h) => h.block === "ZZ")!.id;
    const slots = (await admin.get("/api/jadwal")).data.schedule as Slot[];
    await admin.put("/api/admin/jadwal/slot", { slots: [...slots.map(toInput), { day: 1, houseId: zz1 }] });

    const info = await warga.get("/api/warga");
    expect(info.data).toMatchObject({
      communityName: "Natura",
      announcements: [{ title: "Kerja bakti", pinned: true }],
      contacts: [{ name: "Pak RT", phone: "0812-3456-7890" }],
    });
    const wargaSchedule = info.data.schedule as { houseId: number | null; name: string | null }[];
    expect(wargaSchedule.length).toBeGreaterThan(0);
    expect(wargaSchedule.some((s) => s.houseId === zz1)).toBe(false);
    expect(wargaSchedule.every((s) => s.name)).toBe(true);
    const rekap = await warga.get("/api/warga/rekap");
    expect(rekap.data).toMatchObject({ nights: 1, total: 1000 });
    // Rekap warga tanpa nama KK.
    expect(JSON.stringify(rekap.data)).not.toMatch(/ownerName|Nino/);

    // Riwayat satu rumah: malam-malam ronda beserta hasilnya, juga tanpa nama.
    const checked = (rekap.data.perHouse as { id: number; filled: number }[]).find((h) => h.filled > 0)!;
    const history = await warga.get(`/api/warga/rumah/${checked.id}`);
    expect(history.data).toMatchObject({ house: { id: checked.id }, history: [{ date: rekap.data.today, status: "filled" }] });
    expect(JSON.stringify(history.data)).not.toMatch(/ownerName|token/);
    expect((await warga.get("/api/warga/rumah/99999")).status).toBe(404);

    // Kode diganti: akses lama tidak berlaku.
    await admin.post("/api/admin/pengaturan/kode-warga", { enabled: true });
    expect((await warga.get("/api/warga")).status).toBe(401);
    expect((await warga.get(`/api/warga/rumah/${checked.id}`)).status).toBe(401);
  });
});

describe("link Google Sheets", () => {
  it("rekap CSV tanpa nama warga, hanya lewat token yang berlaku", async () => {
    const sheets = apiClient(env);
    expect((await admin.get("/api/admin/pengaturan")).data.exportToken).toBeNull();
    expect((await sheets.get("/api/ekspor/apapun/rekap.csv")).status).toBe(404);
    expect((await sheets.post("/api/admin/pengaturan/link-ekspor", { enabled: true })).status).toBe(401);

    const token = (await admin.post("/api/admin/pengaturan/link-ekspor", { enabled: true })).data.exportToken as string;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect((await admin.get("/api/admin/pengaturan")).data.exportToken).toBe(token);

    const march = await sheets.get(`/api/ekspor/${token}/rekap.csv?bulan=2025-03`);
    expect(march.status).toBe(200);
    const csv = march.data as unknown as string;
    const lines = csv.split("\r\n");
    expect(lines.slice(0, 2)).toEqual(["Rekap jimpitan Natura · Maret 2025", "Blok,No,Status,Total (Rp),Ada,Kosong,Tidak dicek,15"]);
    expect(lines[2]).toMatch(/^Total,,,2000,1,1,\d+,2000$/);
    expect(lines).toContain("AB,3,Dihuni,0,0,0,1,");
    // Tanpa nama warga dan tanpa BOM (Google Sheets membacanya sebagai bagian sel A1).
    expect(csv).not.toMatch(/Nama KK|Nino|\uFEFF/);
    // Tanpa ?bulan: bulan berjalan.
    expect((await sheets.get(`/api/ekspor/${token}/rekap.csv`)).data).toMatch(`Rekap jimpitan Natura · ${formatMonth(rondaDate(new Date()).slice(0, 7))}`);
    expect((await sheets.get(`/api/ekspor/${token.slice(0, -1)}/rekap.csv`)).status).toBe(404);

    // Link baru: link lama berhenti. Dimatikan: tidak ada link yang berlaku.
    const next = (await admin.post("/api/admin/pengaturan/link-ekspor", { enabled: true })).data.exportToken as string;
    expect((await sheets.get(`/api/ekspor/${token}/rekap.csv`)).status).toBe(404);
    expect((await sheets.get(`/api/ekspor/${next}/rekap.csv`)).status).toBe(200);
    await admin.post("/api/admin/pengaturan/link-ekspor", { enabled: false });
    expect((await sheets.get(`/api/ekspor/${next}/rekap.csv`)).status).toBe(404);
  });
});

describe("audit catatan", () => {
  it("catatan tercatat dengan pencatatnya; petugas di luar jadwal ditolak", async () => {
    const tonight = rondaDate(new Date());
    const day = scheduleDay(tonight);
    await admin.post("/api/admin/rumah", { block: "XX", numbers: "1-2" });
    const houseList = (await admin.get("/api/admin/rumah")).data.houses as { id: number; block: string; number: string }[];
    const [xx1, xx2] = ["1", "2"].map((n) => houseList.find((h) => h.block === "XX" && h.number === n)!.id);
    await admin.post("/api/admin/petugas", { name: "Sari", pin: "2580", role: "petugas", houseId: xx1, days: [day] });
    await admin.post("/api/admin/petugas", { name: "Joko", pin: "3690", role: "petugas", houseId: xx2, days: [(day + 1) % 7] });

    const login = async (name: string, pin: string) => {
      const client = apiClient(env);
      const id = ((await client.get("/api/auth/users")).data.users as { id: number; name: string }[]).find((u) => u.name === name)!.id;
      await client.post("/api/auth/login", { userId: id, pin });
      return client;
    };
    const sari = await login("Sari", "2580");
    const joko = await login("Joko", "3690");
    const entry = (clientId: string, houseId: number, method: "scan" | "manual") => ({
      clientId,
      houseId,
      status: "filled",
      amount: 500,
      method,
      recordedAt: new Date().toISOString(),
    });
    await sari.post("/api/ronda/catatan", { entries: [entry("audit-1", xx1, "scan")] });
    // Kiriman ulang dari antrean offline tidak menambah jejak.
    await sari.post("/api/ronda/catatan", { entries: [entry("audit-1", xx1, "scan")] });
    // Joko tidak jaga malam ini: catatannya ditolak dan tidak tersimpan.
    const rejected = await joko.post("/api/ronda/catatan", { entries: [entry("audit-2", xx1, "scan"), entry("audit-3", xx2, "manual")] });
    expect(rejected.data.results).toMatchObject([
      { ok: false, error: expect.stringMatching(/^Bukan jadwal jagamu/) },
      { ok: false, error: expect.stringMatching(/^Bukan jadwal jagamu/) },
    ]);
    // Halaman rumah (QR dibuka dengan kamera HP) juga menolak.
    const token = ((await admin.get("/api/admin/rumah")).data.houses as { id: number; token: string }[]).find((h) => h.id === xx2)!.token;
    expect((await joko.get(`/api/rumah/${token}`)).data.canRecord).toBe(false);
    expect((await sari.get(`/api/rumah/${token}`)).data.canRecord).toBe(true);
    expect((await joko.post(`/api/rumah/${token}/catat`, { status: "filled", amount: 500 })).status).toBe(400);
    await admin.put(`/api/admin/riwayat/${tonight}/${xx2}`, { status: "empty", amount: 0 });

    const audit = (await admin.get(`/api/admin/audit?tanggal=${tonight}`)).data as {
      logs: { houseId: number; userName: string; method: string; onDuty: boolean | null; status: string }[];
      offDuty: { name: string; count: number }[];
      guards: { name: string; count: number }[];
      counts: { total: number; scan: number; offDuty: number };
    };
    const mine = audit.logs.filter((l) => l.houseId === xx1 || l.houseId === xx2);
    expect(mine.map((l) => [l.userName, l.method, l.onDuty, l.status]).sort()).toEqual(
      [
        ["Aji", "koreksi", null, "empty"],
        ["Sari", "scan", true, "filled"],
      ].sort(),
    );
    expect(audit.offDuty.map((r) => r.name)).not.toContain("Joko");
    expect(audit.guards.find((g) => g.name === "Sari")).toMatchObject({ count: 1 });
    expect(((await admin.get("/api/admin/ringkasan")).data as { todo: { offDuty: number } }).todo.offDuty).toBe(audit.counts.offDuty);
    // Halaman Petugas: kapan terakhir mencatat (catatan yang ditolak tidak dihitung).
    const petugas = (await admin.get("/api/admin/petugas")).data.users as { name: string; lastRecordedAt: string | null }[];
    expect(petugas.find((u) => u.name === "Sari")!.lastRecordedAt).not.toBeNull();
    expect(petugas.find((u) => u.name === "Joko")!.lastRecordedAt).toBeNull();
    // Petugas biasa tidak bisa membuka audit.
    expect((await sari.get("/api/admin/audit")).status).toBe(403);
  });
});

describe("lokasi di denah", () => {
  it("admin menyimpan titik acuan; app petugas menerimanya di data ronda", async () => {
    const anchors = [
      { x: 400, y: 300, lat: -6.3, lng: 106.7 },
      { x: 1600, y: 350, lat: -6.3005, lng: 106.7055 },
      { x: 900, y: 950, lat: -6.3035, lng: 106.7015 },
    ];
    expect((await admin.put("/api/admin/denah/lokasi", { anchors })).data.success).toBe("Titik acuan disimpan.");
    expect((await admin.get("/api/admin/denah/lokasi")).data.anchors).toEqual(anchors);
    expect((await admin.get("/api/ronda")).data.planAnchors).toEqual(anchors);

    // Segaris atau di luar denah ditolak; kosong = mematikan.
    const line = [0, 1, 2].map((i) => ({ x: 400 + i * 300, y: 300, lat: -6.3, lng: 106.7 + i * 0.001 }));
    expect((await admin.put("/api/admin/denah/lokasi", { anchors: line })).status).toBe(400);
    expect((await admin.put("/api/admin/denah/lokasi", { anchors: [{ x: 99999, y: 0, lat: 0, lng: 0 }] })).status).toBe(400);
    await admin.put("/api/admin/denah/lokasi", { anchors: [] });
    expect((await admin.get("/api/ronda")).data.planAnchors).toEqual([]);
  });
});
