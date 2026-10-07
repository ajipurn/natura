import { beforeAll, describe, expect, it } from "vitest";
import { addDays, daysInMonth, localDate, shiftMonth } from "@/lib/dates";
import { allocatePayment, billingPeriods, paymentCells, paymentPeriod, type PaymentPlanDTO } from "@/lib/payments";
import { summarizeMonth } from "@/lib/month-summary";
import { getMonthRecap } from "@/server/queries";
import { getDashboard } from "@/server/dashboard";
import { getPaymentMonth } from "@/server/payments";
import type { Db } from "@/server/db";
import { apiClient, createTestEnv } from "./helpers/db";

const plan: PaymentPlanDTO = { id: 1, houseId: 1, effectiveFrom: "2026-10-01", cadence: "monthly", ratePerNight: 500, dueTiming: "end", graceDays: 0, weekStart: 1 };

describe("periode pembayaran", () => {
  it("nominal bulanan memakai hari sebenarnya; mingguan bisa melewati bulan", () => {
    expect(paymentPeriod("2026-10-07", "monthly")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(paymentPeriod("2028-02-10", "monthly").end).toBe("2028-02-29");
    expect(paymentPeriod("2026-11-01", "weekly")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(paymentPeriod("2026-11-01", "weekly", 0)).toEqual({ start: "2026-11-01", end: "2026-11-07" });
  });
  it("uang dibagi tanpa kehilangan rupiah; bayar sebagian tetap kurang bayar", () => {
    const payment = { id: 1, houseId: 1, receivedDate: "2026-10-01", periodStart: "2026-10-01", periodEnd: "2026-10-31", cadence: "monthly" as const, amount: 5001 };
    expect(allocatePayment(payment).reduce((sum, [, n]) => sum + n, 0)).toBe(5001);
    const cells = paymentCells([payment], [plan], 500);
    expect(billingPeriods([plan], cells, {}, "2026-10-07", "2026-10-01", "2026-10-31")[0]).toMatchObject({ status: "partial", expected: 15500, paid: 5001, remaining: 10499 });
    expect(billingPeriods([plan], cells, {}, "2026-11-01", "2026-10-01", "2026-10-31")[0].status).toBe("overdue");
  });
  it("akhir bulan sekarang, awal bulan berikutnya; tidak menagih sebelum mulai berlaku", () => {
    const future = { ...plan, id: 2, effectiveFrom: "2026-11-01", dueTiming: "start" as const };
    const periods = billingPeriods([plan, future], {}, {}, "2026-10-07", "2026-09-01", "2026-11-30");
    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ start: "2026-10-01", end: "2026-10-31", dueDate: "2026-10-31", expected: 15500, status: "not-due" });
    expect(periods[1]).toMatchObject({ start: "2026-11-01", end: "2026-11-30", dueDate: "2026-11-01", expected: 15000, status: "not-due" });
    expect(billingPeriods([future], {}, {}, "2026-11-01", "2026-11-01", "2026-11-30")[0].status).toBe("due");
  });
  it("mulai di tengah bulan hanya menagih sejak tanggal berlaku dan memberi tambahan waktu", () => {
    const p = { ...plan, effectiveFrom: "2026-10-07", graceDays: 3 };
    const bill = billingPeriods([p], {}, {}, "2026-11-02", "2026-10-01", "2026-10-31")[0];
    expect(bill).toMatchObject({ start: "2026-10-07", expected: 12500, dueDate: "2026-11-03", status: "not-due" });
  });
  it("mingguan lintas bulan tetap memisahkan nominal bulan dan kas diterima", () => {
    const payment = { id: 1, houseId: 1, receivedDate: "2026-10-29", periodStart: "2026-10-29", periodEnd: "2026-11-04", cadence: "weekly" as const, amount: 3500 };
    const october = paymentCells([payment], [], 500, "2026-10-01", "2026-10-31");
    const november = paymentCells([payment], [], 500, "2026-11-01", "2026-11-30");
    expect(Object.values(october).reduce((sum, c) => sum + c.weeklyAmount, 0)).toBe(1500);
    expect(Object.values(november).reduce((sum, c) => sum + c.weeklyAmount, 0)).toBe(2000);
    expect(Object.values(october).every((c) => c.monthlyAmount === 0)).toBe(true);
  });
  it("uang harian yang sudah diambil ikut melunasi periode dan mengurangi sisa bayar", () => {
    const payment = { id: 1, houseId: 1, receivedDate: "2026-10-07", periodStart: "2026-10-01", periodEnd: "2026-10-31", cadence: "monthly" as const, amount: 15000 };
    const cells = paymentCells([payment], [plan], 500);
    const bills = billingPeriods([plan], cells, { "1:2026-10-01": { status: "filled", amount: 500 } }, "2026-10-07", "2026-10-01", "2026-10-31");
    expect(bills[0]).toMatchObject({ paid: 15500, remaining: 0, status: "paid" });
  });
  it("kembali ke harian membatasi tagihan bulanan dan tidak membuat tunggakan wadah harian", () => {
    const daily = { ...plan, id: 2, effectiveFrom: "2026-10-07", cadence: "daily" as const };
    const bills = billingPeriods([plan, daily], {}, {}, "2026-11-01", "2026-10-01", "2026-10-31");
    expect(bills).toEqual([expect.objectContaining({ cadence: "monthly", start: "2026-10-01", end: "2026-10-06", expected: 3000, status: "overdue" })]);
  });
});

let db: Db;
let admin: ReturnType<typeof apiClient>;
let guest: ReturnType<typeof apiClient>;
let staff: ReturnType<typeof apiClient>;
let houseIds: number[];
let collectorId: number;
const today = localDate(new Date());
const month = today.slice(0, 7);
const days = daysInMonth(month);
const monthlyAmount = days.length * 500;
const nextMonth = shiftMonth(month, 1);
const nextDays = daysInMonth(nextMonth);
const makePayment = (houseId: number, overrides: Record<string, unknown> = {}) => ({
  clientId: crypto.randomUUID(), houseId, receivedDate: today, periodStart: days[0], periodEnd: days.at(-1),
  cadence: "monthly", amount: monthlyAmount, receivedBy: "treasurer", collectorId: null, note: "", ...overrides,
});

beforeAll(async () => {
  const test = await createTestEnv();
  db = test.db; admin = apiClient(test.env); guest = apiClient(test.env); staff = apiClient(test.env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Bendahara", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "Q", numbers: "1-4" });
  houseIds = ((await admin.get("/api/admin/rumah")).data.houses as { id: number }[]).map((h) => h.id);
  await admin.post("/api/admin/petugas", { name: "Petugas", pin: "1234", role: "petugas", active: true });
  collectorId = ((await admin.get("/api/admin/petugas")).data.users as { id: number; name: string }[]).find((u) => u.name === "Petugas")!.id;
  await staff.post("/api/auth/login", { userId: collectorId, pin: "1234" });
  for (const houseId of houseIds) await admin.put("/api/admin/pembayaran/kesepakatan/" + houseId, { effectiveFrom: days[0], cadence: "monthly", ratePerNight: 500, dueTiming: "end" });
});

describe("API pembayaran dan kas", () => {
  it("pembayaran bulanan di muka tidak membuat catatan ronda; kiriman ulang tidak menggandakan uang", async () => {
    const input = makePayment(houseIds[0]);
    expect((await admin.post("/api/admin/pembayaran", input)).status).toBe(200);
    expect((await admin.post("/api/admin/pembayaran", input)).status).toBe(200);
    const data = (await admin.get("/api/admin/pembayaran?bulan=" + month)).data;
    expect(data.payments).toHaveLength(1);
    expect((data.bills as { houseId: number; status: string }[]).find((b) => b.houseId === houseIds[0])?.status).toBe("paid");
    const recap = await getMonthRecap(db, month);
    expect(recap.dates).toEqual([]);
    expect(recap.cells).toEqual({});
    const row = summarizeMonth(recap).rows.find((r) => r.house.id === houseIds[0])!;
    expect(row).toMatchObject({ monthlyTotal: monthlyAmount, collectedTotal: 0, total: monthlyAmount, filledCount: 0 });
    const cash = (await admin.get("/api/admin/kas?bulan=" + month)).data;
    expect(cash.balance).toBe(monthlyAmount);
    expect(cash.nights).toEqual([]);
    const id = (data.payments as { id: number }[])[0].id;
    expect((await admin.get("/api/admin/pembayaran/" + id + "/log")).data.logs).toHaveLength(1);
    expect((await admin.post("/api/admin/pembayaran", { ...input, amount: 1 })).status).toBe(400);
  });
  it("periode masa depan boleh, tanggal penerimaan masa depan dan periode terbalik ditolak", async () => {
    expect((await admin.post("/api/admin/pembayaran", makePayment(houseIds[1], { periodStart: nextDays[0], periodEnd: nextDays.at(-1), amount: nextDays.length * 500 }))).status).toBe(200);
    expect((await admin.post("/api/admin/pembayaran", makePayment(houseIds[1], { receivedDate: addDays(today, 1) }))).status).toBe(400);
    expect((await admin.post("/api/admin/pembayaran", makePayment(houseIds[1], { periodStart: days.at(-1), periodEnd: days[0] }))).status).toBe(400);
    expect((await admin.post("/api/admin/pembayaran", makePayment(999999))).status).toBe(400);
  });
  it("pembayaran ke petugas masuk pencocokan setoran; saldo bertambah sekali setelah disetor", async () => {
    const before = Number((await admin.get("/api/admin/kas?bulan=" + month)).data.balance);
    const input = makePayment(houseIds[2], { cadence: "weekly", periodStart: today, periodEnd: addDays(today, 6), amount: 3500, receivedBy: "collector", collectorId });
    expect((await admin.post("/api/admin/pembayaran", input)).status).toBe(200);
    let cash = (await admin.get("/api/admin/kas?bulan=" + month)).data;
    expect(cash.balance).toBe(before);
    expect(cash.nights).toEqual([expect.objectContaining({ date: today, recorded: 3500, periodPayments: 3500, deposit: null })]);
    await admin.put("/api/admin/kas/setoran/" + today, { amount: 3500 });
    cash = (await admin.get("/api/admin/kas?bulan=" + month)).data;
    expect(cash.balance).toBe(before + 3500);
    expect(cash.nights).toEqual([expect.objectContaining({ recorded: 3500, deposit: expect.objectContaining({ amount: 3500 }) })]);
  });
  it("koreksi dan pembatalan memperbarui rekap/kas tetapi tetap menyimpan audit", async () => {
    const list = (await admin.get("/api/admin/pembayaran?bulan=" + month)).data.payments as { id: number; houseId: number }[];
    const id = list.find((p) => p.houseId === houseIds[0])!.id;
    const before = Number((await admin.get("/api/admin/kas?bulan=" + month)).data.balance);
    const { clientId: _clientId, ...changed } = makePayment(houseIds[0], { amount: 5000 });
    expect((await admin.patch("/api/admin/pembayaran/" + id, changed)).status).toBe(200);
    expect((await admin.get("/api/admin/kas?bulan=" + month)).data.balance).toBe(before - monthlyAmount + 5000);
    expect((await admin.delete("/api/admin/pembayaran/" + id)).status).toBe(200);
    expect((await admin.get("/api/admin/kas?bulan=" + month)).data.balance).toBe(before - monthlyAmount);
    const audit = (await admin.get("/api/admin/pembayaran/" + id + "/log")).data.logs as { action: string }[];
    expect(audit.map((l) => l.action)).toEqual(["cancel", "update", "create"]);
    expect((await admin.get("/api/admin/pembayaran?bulan=" + month)).data.history).toEqual(expect.arrayContaining([expect.objectContaining({ id, cancelledAt: expect.any(String) })]));
  });
  it("hanya admin boleh mengubah pembayaran dan kesepakatan", async () => {
    for (const client of [guest, staff]) {
      expect([401, 403]).toContain((await client.get("/api/admin/pembayaran")).status);
      expect([401, 403]).toContain((await client.post("/api/admin/pembayaran", makePayment(houseIds[3]))).status);
      expect([401, 403]).toContain((await client.put("/api/admin/pembayaran/kesepakatan/" + houseIds[3], { effectiveFrom: today, cadence: "monthly", ratePerNight: 500, dueTiming: "start" })).status);
    }
  });
  it("riwayat pembayaran yang dibatalkan tetap mencegah penghapusan rumah", async () => {
    const houses = (await admin.get("/api/admin/rumah")).data.houses as { id: number; collectionCount: number; paymentCount: number }[];
    expect(houses.find((h) => h.id === houseIds[0])).toMatchObject({ collectionCount: 0, paymentCount: 1 });
    expect((await admin.delete("/api/admin/rumah/" + houseIds[0])).status).toBe(409);
  });
  it("halaman QR hanya menampilkan data pembayaran publik", async () => {
    const houses = (await admin.get("/api/admin/rumah")).data.houses as { id: number; token: string }[];
    const token = houses.find((h) => h.id === houseIds[1])!.token;
    const info = (await guest.get("/api/rumah/" + token)).data.paymentInfo as { receipts: Record<string, unknown>[]; plans: Record<string, unknown>[] };
    expect(info.receipts).toHaveLength(1);
    expect(Object.keys(info.receipts[0]).sort()).toEqual(["amount", "cadence", "periodEnd", "periodStart", "receivedDate"]);
    expect(info.plans.every((p) => !("recordedBy" in p))).toBe(true);
  });
  it("tunggakan bulan sebelumnya tetap bisa dilihat saat membuka bulan berikutnya", async () => {
    const data = await getPaymentMonth(db, nextMonth, nextDays[0]);
    expect(data.overdueBills).toEqual(expect.arrayContaining([expect.objectContaining({ houseId: houseIds[0], start: days[0], remaining: monthlyAmount, status: "overdue" })]));
  });
  it("ringkasan lewat tengah malam tetap menjumlahkan penerimaan pada bulan ronda yang tampil", async () => {
    const overview = await getDashboard(db, new Date(nextMonth + "-01T02:00:00+07:00"));
    const current = (await admin.get("/api/admin/pembayaran?bulan=" + month)).data.payments as { receivedDate: string; amount: number }[];
    const received = current.filter((p) => p.receivedDate.startsWith(month)).reduce((sum, p) => sum + p.amount, 0);
    expect(overview.month).toBe(month);
    expect(overview.paymentOverview.receivedToday).toBe(0);
    expect(overview.paymentOverview.receivedMonth).toBe(received);
    expect(overview.monthSummary.total).toBe(received);
  });
  it("identitas kiriman yang sama tidak dapat digunakan untuk rumah lain", async () => {
    const current = (await admin.get("/api/admin/pembayaran?bulan=" + month)).data.payments as { clientId: string }[];
    expect((await admin.post("/api/admin/pembayaran", makePayment(houseIds[3], { clientId: current[0].clientId }))).status).toBe(400);
  });
});
