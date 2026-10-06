import { beforeAll, describe, expect, it } from "vitest";
import { addDays, localDate, rondaDate, shiftMonth } from "@/lib/dates";
import type { Bindings } from "@/server/env";
import { apiClient, createTestEnv } from "./helpers/db";

type Night = { date: string; recorded: number; deposit: { amount: number; note: string | null; recordedByName: string | null } | null };
type Kas = {
  opening: number;
  deposits: number;
  income: number;
  expenses: number;
  closing: number;
  balance: number;
  nights: Night[];
  entries: { id: number; date: string; direction: "in" | "out"; amount: number; description: string }[];
  undeposited: string[];
};

let env: Bindings;
let admin: ReturnType<typeof apiClient>;
let q1: number, q2: number;
const tonight = rondaDate(new Date());
const [d1, d2, d3] = [addDays(tonight, -1), addDays(tonight, -2), addDays(tonight, -3)];
const month = tonight.slice(0, 7);

const kas = async (bulan = month) => (await admin.get(`/api/admin/kas?bulan=${bulan}`)).data as unknown as Kas;
const night = (k: Kas, date: string) => k.nights.find((n) => n.date === date);

beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Bendahara", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "K", numbers: "1-2" });
  const houses = (await admin.get("/api/admin/rumah")).data.houses as { id: number; number: string }[];
  [q1, q2] = ["1", "2"].map((n) => houses.find((h) => h.number === n)!.id);
  // Tiga malam yang sudah lewat: Rp 1.500, Rp 1.000, dan malam yang semua wadahnya kosong.
  await admin.put("/api/admin/riwayat", {
    entries: [
      { date: d1, houseId: q1, status: "filled", amount: 1000 },
      { date: d1, houseId: q2, status: "filled", amount: 500 },
      { date: d2, houseId: q1, status: "filled", amount: 1000 },
      { date: d2, houseId: q2, status: "empty", amount: 0 },
      { date: d3, houseId: q1, status: "empty", amount: 0 },
    ],
  });
});

describe("kas: setoran ke bendahara per malam", () => {
  it("sebelum ada setoran, malam yang ada uangnya tampil belum disetor tapi belum ditagih", async () => {
    const k = await kas();
    // Malam yang semuanya kosong (Rp 0) tidak perlu disetor.
    expect(night(k, d3)).toBeUndefined();
    if (d1.startsWith(month)) expect(night(k, d1)).toMatchObject({ recorded: 1500, deposit: null });
    expect(k.undeposited).toEqual([]);
    expect(k.balance).toBe(0);
  });

  it("mencatat, mengubah, dan menghapus setoran satu malam; selisih dengan catatan petugas terlihat", async () => {
    expect((await admin.put(`/api/admin/kas/setoran/${d2}`, { amount: 1000 })).data).toEqual({ success: "Setoran tersimpan." });
    // Malam sesudah setoran pertama yang belum disetor mulai ditagih (malam ini belum).
    expect((await kas()).undeposited).toEqual([d1]);

    // Uang yang diterima kurang dari catatan.
    await admin.put(`/api/admin/kas/setoran/${d1}`, { amount: 1000, note: "Rp 500 menyusul" });
    const k = await kas(d1.slice(0, 7));
    expect(night(k, d1)).toMatchObject({ recorded: 1500, deposit: { amount: 1000, note: "Rp 500 menyusul", recordedByName: "Bendahara" } });
    expect(k.undeposited).toEqual([]);

    // Disetor lagi: setoran malam itu diubah, bukan ditambah baris baru.
    await admin.put(`/api/admin/kas/setoran/${d1}`, { amount: 1500, note: "" });
    expect(night(await kas(d1.slice(0, 7)), d1)?.deposit).toMatchObject({ amount: 1500, note: null });
    expect((await kas()).balance).toBe(2500);

    expect((await admin.delete(`/api/admin/kas/setoran/${d2}`)).data).toEqual({ success: "Setoran dihapus." });
    expect((await kas()).balance).toBe(1500);
    await admin.put(`/api/admin/kas/setoran/${d2}`, { amount: 1000 });
  });

  it("menolak malam yang belum tiba, tanggal salah, dan jumlah salah", async () => {
    expect((await admin.put(`/api/admin/kas/setoran/${addDays(tonight, 1)}`, { amount: 500 })).data).toEqual({ error: "Malamnya belum tiba." });
    expect((await admin.put("/api/admin/kas/setoran/2026-02-30", { amount: 500 })).status).toBe(400);
    expect((await admin.put(`/api/admin/kas/setoran/${d1}`, { amount: -1 })).status).toBe(400);
    expect((await admin.put(`/api/admin/kas/setoran/${d1}`, { amount: 1.5 })).status).toBe(400);
    expect((await admin.put(`/api/admin/kas/setoran/${d1}`, {})).status).toBe(400);
  });
});

describe("kas: pemasukan lain, pengeluaran, dan saldo", () => {
  it("saldo = setoran + pemasukan lain − pengeluaran; saldo awal bulan dari bulan-bulan sebelumnya", async () => {
    const lastMonth = shiftMonth(month, -1);
    await admin.post("/api/admin/kas/transaksi", { date: `${lastMonth}-01`, direction: "in", amount: 200_000, description: "Saldo awal" });
    const res = await admin.post("/api/admin/kas/transaksi", { date: localDate(new Date()), direction: "out", amount: 50_000, description: "Lampu pos ronda" });
    expect(res.data).toEqual({ success: "Pengeluaran dicatat." });

    const k = await kas();
    const depositedThisMonth = [d1, d2].filter((d) => d.startsWith(month));
    const deposits = depositedThisMonth.reduce((sum, d) => sum + (d === d1 ? 1500 : 1000), 0);
    expect(k).toMatchObject({ opening: 200_000 + (2500 - deposits), deposits, income: 0, expenses: 50_000, balance: 152_500 });
    expect(k.closing).toBe(k.balance);
    expect(k.entries).toMatchObject([{ direction: "out", amount: 50_000, description: "Lampu pos ronda" }]);

    const id = k.entries[0].id;
    await admin.patch(`/api/admin/kas/transaksi/${id}`, { date: localDate(new Date()), direction: "out", amount: 60_000, description: "Lampu + kabel" });
    expect((await kas()).balance).toBe(142_500);
    expect((await admin.delete(`/api/admin/kas/transaksi/${id}`)).data).toEqual({ success: "Catatan kas dihapus." });
    expect((await kas()).balance).toBe(202_500);
  });

  it("menolak tanggal yang belum lewat, jumlah nol, keterangan kosong, jenis salah, dan id tak dikenal", async () => {
    const ok = { date: localDate(new Date()), direction: "out", amount: 1000, description: "Tes" };
    const post = (json: object) => admin.post("/api/admin/kas/transaksi", { ...ok, ...json });
    expect((await post({ date: addDays(localDate(new Date()), 1) })).data).toEqual({ error: "Tanggalnya belum lewat." });
    expect((await post({ amount: 0 })).status).toBe(400);
    expect((await post({ description: "  " })).status).toBe(400);
    expect((await post({ direction: "keluar" })).status).toBe(400);
    expect((await admin.patch("/api/admin/kas/transaksi/999999", ok)).status).toBe(404);
  });

  it("hanya admin", async () => {
    const guest = apiClient(env);
    expect([401, 403]).toContain((await guest.get("/api/admin/kas")).status);
    expect([401, 403]).toContain((await guest.put(`/api/admin/kas/setoran/${d1}`, { amount: 1 })).status);
  });
});

describe("kas di ringkasan dan halaman warga", () => {
  it("Ringkasan memuat saldo dan malam yang belum disetor", async () => {
    const { data } = await admin.get("/api/admin/ringkasan");
    expect(data.cash).toEqual({ balance: 202_500, undeposited: 0 });
    expect((data.todo as { undeposited: number }).undeposited).toBe(0);
  });

  it("tampil di halaman warga tanpa nama pencatat, dan bisa dimatikan di Pengaturan", async () => {
    const code = (await admin.post("/api/admin/pengaturan/kode-warga", { enabled: true })).data.wargaCode as string;
    const warga = apiClient(env);
    await warga.post("/api/warga/masuk", { code });
    await admin.post("/api/admin/kas/transaksi", { date: localDate(new Date()), direction: "out", amount: 2500, description: "Fotokopi jadwal" });

    const cash = (await warga.get("/api/warga")).data.cash as Kas & { entries: Record<string, unknown>[] };
    expect(cash).toMatchObject({ balance: 200_000, expenses: 2500 });
    expect(cash.entries).toEqual([expect.objectContaining({ description: "Fotokopi jadwal", amount: 2500 })]);
    expect(cash.entries[0]).not.toHaveProperty("recordedByName");

    await admin.put("/api/admin/pengaturan", { communityName: "Natura", defaultAmount: 500, cashPublic: false });
    expect((await admin.get("/api/admin/pengaturan")).data.cashPublic).toBe(false);
    expect((await warga.get("/api/warga")).data.cash).toBeNull();
    // Menyimpan pengaturan tanpa `cashPublic` tidak mengubahnya.
    await admin.put("/api/admin/pengaturan", { communityName: "Natura", defaultAmount: 500 });
    expect((await admin.get("/api/admin/pengaturan")).data.cashPublic).toBe(false);
  });
});
