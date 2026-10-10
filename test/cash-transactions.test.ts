import { beforeAll, describe, expect, it } from "vitest";
import type { CashMonth } from "@/server/kas";
import { cashDeposits, cashEntries, duesInvoices, duesReceipts, duesTypes, payments } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

let admin: ReturnType<typeof apiClient>;
let directId: number, duesId: number, donationId: number;
const month = "2024-02";
const cash = async (m = month) => (await admin.get(`/api/admin/kas?bulan=${m}`)).data as unknown as CashMonth;

beforeAll(async () => {
  const { env, db } = await createTestEnv();
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Bendahara", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "AF", numbers: "13" });
  const houseId = Number(((await admin.get("/api/admin/rumah")).data.houses as { id: number }[])[0].id);
  await db.insert(cashEntries).values([
    { date: "2024-01-01", direction: "in", amount: 100000, description: "Saldo awal", recordedBy: 1 },
    { date: "2024-02-06", direction: "out", amount: 10000, description: "Lampu pos", recordedBy: 1 },
  ]);
  [donationId] = (await db.insert(cashEntries).values({ date: "2024-02-05", direction: "in", amount: 20000, description: "Sumbangan warga", recordedBy: 1 }).returning()).map((e) => e.id);
  await db.insert(cashDeposits).values([
    { date: "2024-01-02", amount: 1000, recordedBy: 1 },
    { date: "2024-02-01", amount: 1500, recordedBy: 1, note: "Diterima lengkap" },
  ]);
  const payment = { houseId, periodStart: "2024-03-01", periodEnd: "2024-03-31", cadence: "monthly" as const, receivedBy: "treasurer" as const, recordedBy: 1 };
  await db.insert(payments).values({ ...payment, clientId: crypto.randomUUID(), amount: 5000, receivedDate: "2024-01-03" });
  [directId] = (await db.insert(payments).values({ ...payment, clientId: crypto.randomUUID(), amount: 7000, receivedDate: "2024-02-03", note: "Untuk Maret" }).returning()).map((p) => p.id);
  await db.insert(payments).values([
    { ...payment, clientId: crypto.randomUUID(), amount: 3500, receivedDate: "2024-02-03", receivedBy: "collector", collectorId: 1 },
    { ...payment, clientId: crypto.randomUUID(), amount: 99000, receivedDate: "2024-02-03", cancelledAt: new Date() },
  ]);
  const [type] = await db.insert(duesTypes).values({ name: "Kebersihan", amount: 100000, cadence: "monthly", startMonth: "2024-01", dueDay: 10 }).returning();
  const [invoice] = await db.insert(duesInvoices).values({ typeId: type.id, houseId, month: "2024-01", amount: 100000, dueDate: "2024-01-10", recordedBy: 1 }).returning();
  const receipt = { invoiceId: invoice.id, method: "transfer" as const, recordedBy: 1 };
  await db.insert(duesReceipts).values({ ...receipt, clientId: crypto.randomUUID(), amount: 2000, date: "2024-01-04" });
  [duesId] = (await db.insert(duesReceipts).values({ ...receipt, clientId: crypto.randomUUID(), amount: 4000, date: "2024-02-04" }).returning()).map((r) => r.id);
  await db.insert(duesReceipts).values({ ...receipt, clientId: crypto.randomUUID(), amount: 99000, date: "2024-02-04", cancelledAt: new Date() });
  await admin.put("/api/admin/riwayat", { entries: [{ date: "2024-02-01", houseId, status: "filled", amount: 1500 }] });
});

describe("tabel transaksi kas dari semua sumber", () => {
  it("menyatukan setoran, jimpitan langsung, iuran, pemasukan, dan pengeluaran terbaru dulu dengan id unik", async () => {
    const data = await cash();
    expect(data.transactions.map((t) => t.date)).toEqual(["2024-02-06", "2024-02-05", "2024-02-04", "2024-02-03", "2024-02-01"]);
    expect(data.transactions.map((t) => t.source)).toEqual(["entry", "entry", "dues", "payment", "deposit"]);
    expect(new Set(data.transactions.map((t) => t.id)).size).toBe(5);
    expect(data.transactions.find((t) => t.source === "payment")).toMatchObject({ description: "Jimpitan bulanan · AF-13", recordedByName: "Bendahara", note: "Untuk Maret", relatedMonth: "2024-03" });
    expect(data.transactions.find((t) => t.source === "dues")).toMatchObject({ description: "Kebersihan · AF-13", amount: 4000 });
    expect(data.transactions.find((t) => t.source === "deposit")).toMatchObject({ description: "Setoran ronda", note: "Diterima lengkap" });
  });

  it("total tabel cocok dengan saldo bulan, uang di petugas dan penerimaan batal tidak dihitung", async () => {
    const data = await cash();
    const net = data.transactions.reduce((sum, t) => sum + (t.direction === "in" ? t.amount : -t.amount), 0);
    expect(data).toMatchObject({ opening: 108000, deposits: 1500, directPayments: 7000, duesIncome: 4000, income: 20000, expenses: 10000, closing: 130500, balance: 130500 });
    expect(data.opening + net).toBe(data.closing);
    expect(data.nights.find((n) => n.date === "2024-02-03")).toMatchObject({ recorded: 3500, deposit: null });
    expect(data.transactions.some((t) => t.amount === 3500 || t.amount === 99000)).toBe(false);
  });

  it("tanggal uang diterima menentukan bulan kas, bukan periode jimpitan atau bulan tagihan iuran", async () => {
    expect((await cash("2024-01")).transactions).toHaveLength(4);
    const march = await cash("2024-03");
    expect(march.transactions).toEqual([]);
    expect(march.opening).toBe(130500);
  });

  it("koreksi manual dan setoran memperbarui satu transaksi asal", async () => {
    expect((await admin.patch(`/api/admin/kas/transaksi/${donationId}`, { date: "2024-02-05", direction: "in", amount: 25000, description: "Sumbangan warga" })).status).toBe(200);
    expect((await admin.put("/api/admin/kas/setoran/2024-02-01", { amount: 1600, note: "Tambahan Rp 100" })).status).toBe(200);
    const data = await cash();
    expect(data.transactions).toHaveLength(5);
    expect(data.transactions.find((t) => t.source === "deposit")).toMatchObject({ amount: 1600, note: "Tambahan Rp 100" });
    expect(data.closing).toBe(135600);
  });

  it("pembatalan jimpitan dan iuran menghapus penerimaannya dari tabel serta saldo", async () => {
    expect((await admin.delete(`/api/admin/pembayaran/${directId}`)).status).toBe(200);
    expect((await admin.delete(`/api/admin/iuran/pembayaran/${duesId}`)).status).toBe(200);
    const data = await cash();
    expect(data.transactions).toHaveLength(3);
    expect(data.transactions.every((t) => t.source === "deposit" || t.source === "entry")).toBe(true);
    expect(data.closing).toBe(124600);
  });

  it("uang di petugas hanya tampil sebagai satu pemasukan setelah disetor", async () => {
    await admin.put("/api/admin/kas/setoran/2024-02-03", { amount: 3500 });
    let data = await cash();
    expect(data.transactions.filter((t) => t.date === "2024-02-03")).toEqual([expect.objectContaining({ source: "deposit", amount: 3500 })]);
    expect(data.closing).toBe(128100);
    await admin.delete("/api/admin/kas/setoran/2024-02-03");
    data = await cash();
    expect(data.transactions.some((t) => t.date === "2024-02-03")).toBe(false);
    expect(data.closing).toBe(124600);
  });
});
