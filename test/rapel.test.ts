import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { allocatePayment, type PeriodPayment } from "@/lib/payments";
import { monthHouseNights, summarizeMonth } from "@/lib/month-summary";
import { buildRecapCsv, buildSheetsCsv } from "@/lib/recap-csv";
import { buildRecapSheets } from "@/lib/recap-xlsx";
import { getMonthRecap } from "@/server/queries";
import type { getHousePaymentInfo } from "@/server/payments";
import { houses, payments, settings } from "@/server/schema";
import type { Db } from "@/server/db";
import { apiClient, createTestEnv } from "./helpers/db";

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());
let db: Db;
let admin: ReturnType<typeof apiClient>;
let staff: ReturnType<typeof apiClient>;
let guest: ReturnType<typeof apiClient>;
let ids: number[];
let collectorId: number;
const selected = ["2026-10-01", "2026-10-03", "2026-10-05"];
const make = (houseId: number, dates = selected, overrides: Record<string, unknown> = {}) => ({
  clientId: crypto.randomUUID(), houseId, cadence: "daily", receivedDate: "2026-10-10",
  periodStart: dates[0], periodEnd: dates.at(-1), amount: dates.length * 500,
  allocations: dates.map((date) => [date, 500]), receivedBy: "treasurer", collectorId: null, note: "Rapel warga", ...overrides,
});
async function balance() { return Number((await admin.get("/api/admin/kas?bulan=2026-10")).data.balance); }

beforeAll(async () => {
  const test = await createTestEnv();
  db = test.db; admin = apiClient(test.env); staff = apiClient(test.env); guest = apiClient(test.env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "R", numbers: "1-9" });
  ids = ((await admin.get("/api/admin/rumah")).data.houses as { id: number }[]).map((h) => h.id);
  const entries = ids.flatMap((houseId) => [
    ...selected.map((date) => ({ houseId, date, status: "empty", amount: 0 })),
    { houseId, date: "2026-10-02", status: "filled", amount: 500 },
    { houseId, date: "2026-09-30", status: "empty", amount: 0 },
  ]);
  expect((await admin.put("/api/admin/riwayat", { entries })).status).toBe(200);
  await admin.put("/api/admin/pembayaran/kesepakatan/" + ids[1], { effectiveFrom: "2026-10-01", cadence: "monthly", ratePerNight: 500, dueTiming: "end" });
  await db.update(houses).set({ status: "vacant" }).where(eq(houses.id, ids[2]));
  await admin.put("/api/admin/pembayaran/kesepakatan/" + ids[3], { effectiveFrom: "2026-10-03", cadence: "daily", ratePerNight: 700, dueTiming: "end" });
  await admin.post("/api/admin/petugas", { name: "Petugas", pin: "1234", role: "petugas", active: true });
  collectorId = ((await admin.get("/api/admin/petugas")).data.users as { id: number; name: string }[]).find((u) => u.name === "Petugas")!.id;
  await staff.post("/api/auth/login", { userId: collectorId, pin: "1234" });
});

describe("rapel harian", () => {
  it("menawarkan hanya catatan kosong harian, tanpa menagih rumah mudik atau periode bulanan", async () => {
    expect((await admin.get("/api/admin/pembayaran/rapel/" + ids[0])).data.dates).toEqual([
      { date: "2026-09-30", amount: 500 }, ...selected.map((date) => ({ date, amount: 500 })),
    ]);
    for (const houseId of [ids[1], ids[2]]) {
      const response = await admin.get("/api/admin/pembayaran/rapel/" + houseId);
      expect(response.data.dates).toEqual(houseId === ids[1] ? [{ date: "2026-09-30", amount: 500 }] : []);
    }
  });

  it("melunasi hari yang tidak berurutan tanpa menimpa hasil ronda atau menggandakan kas", async () => {
    const input = make(ids[0]);
    const before = await balance();
    expect((await admin.post("/api/admin/pembayaran", input)).status).toBe(200);
    expect((await admin.post("/api/admin/pembayaran", input)).status).toBe(200);
    expect(await balance()).toBe(before + 1500);
    const recap = await getMonthRecap(db, "2026-10");
    for (const date of selected) expect(recap.cells[ids[0] + ":" + date]).toEqual({ status: "empty", amount: 0 });
    const row = summarizeMonth(recap).rows.find((r) => r.house.id === ids[0])!;
    expect(row).toMatchObject({ filledCount: 4, empty: 0, collectedTotal: 500, rapelTotal: 1500, total: 2000 });
    expect(row.nights.filter((n) => n.rapel).map((n) => n.date)).toEqual(selected);
    expect(summarizeMonth(recap).dateTotals.reduce((sum, value) => sum + value, 0)).toBe(ids.length * 500);
    expect((await admin.get("/api/admin/pembayaran/rapel/" + ids[0])).data.dates).toEqual([{ date: "2026-09-30", amount: 500 }]);
    expect((await admin.post("/api/admin/pembayaran", make(ids[0]))).status).toBe(400);
    const receipt = recap.periodPayments!.find((p) => p.houseId === ids[0])!;
    expect(allocatePayment(receipt)).toEqual(selected.map((date) => [date, 500]));
  });

  it("nominal mengikuti tarif tiap tanggal, termasuk perubahan tarif", async () => {
    const dates = (await admin.get("/api/admin/pembayaran/rapel/" + ids[3])).data.dates;
    expect(dates).toEqual([{ date: "2026-09-30", amount: 500 }, { date: selected[0], amount: 500 }, { date: selected[1], amount: 700 }, { date: selected[2], amount: 700 }]);
    expect((await admin.post("/api/admin/pembayaran", make(ids[3]))).status).toBe(400);
    expect((await admin.post("/api/admin/pembayaran", make(ids[3], selected, { amount: 1900, allocations: [[selected[0], 500], [selected[1], 700], [selected[2], 700]] }))).status).toBe(200);
    const recap = await getMonthRecap(db, "2026-10");
    const house = recap.houses.find((h) => h.id === ids[3])!;
    expect(monthHouseNights(recap, house).filter((n) => n.rapel).every((n) => n.status === "filled")).toBe(true);
  });

  it("tanggal isi, tidak dicek, bulanan, mudik, dan setelah tanggal penerimaan ditolak", async () => {
    for (const input of [make(ids[4], ["2026-10-02"]), make(ids[4], ["2026-10-04"]), make(ids[1], [selected[0]]), make(ids[2]), make(ids[4], selected, { receivedDate: "2026-10-02" })]) {
      expect((await admin.post("/api/admin/pembayaran", input)).status).toBe(400);
    }
  });

  it("jumlah uang dan tanggal pilihan harus konsisten dan unik", async () => {
    for (const overrides of [{ amount: 1400 }, { allocations: null }, { allocations: [[selected[0], 500], [selected[0], 500]], amount: 1000, periodEnd: selected[0] }, { periodStart: "2026-09-30" }, { cadence: "monthly" }]) {
      expect((await admin.post("/api/admin/pembayaran", make(ids[4], selected, overrides))).status).toBe(400);
    }
  });

  it("dua kiriman bersamaan untuk tanggal sama hanya menyimpan satu pembayaran", async () => {
    const before = await balance();
    const results = await Promise.all([admin.post("/api/admin/pembayaran", make(ids[4])), admin.post("/api/admin/pembayaran", make(ids[4]))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await balance()).toBe(before + 1500);
  });

  it("rapel ke petugas masuk setoran pada tanggal penerimaan, sekali saja", async () => {
    const before = await balance();
    expect((await admin.post("/api/admin/pembayaran", make(ids[5], selected, { receivedBy: "collector", collectorId }))).status).toBe(200);
    let cash = (await admin.get("/api/admin/kas?bulan=2026-10")).data;
    expect(cash.balance).toBe(before);
    expect(cash.nights).toEqual(expect.arrayContaining([expect.objectContaining({ date: "2026-10-10", recorded: 1500, periodPayments: 1500 })]));
    await admin.put("/api/admin/kas/setoran/2026-10-10", { amount: 1500 });
    cash = (await admin.get("/api/admin/kas?bulan=2026-10")).data;
    expect(cash.balance).toBe(before + 1500);
  });

  it("koreksi dan pembatalan menyegarkan warna, nominal, pilihan hari, dan audit", async () => {
    const input = make(ids[6]);
    const before = await balance();
    await admin.post("/api/admin/pembayaran", input);
    const [receipt] = await db.select().from(payments).where(eq(payments.houseId, ids[6]));
    const { clientId: _id, ...changed } = make(ids[6], [selected[0], selected[2]]);
    expect((await admin.patch("/api/admin/pembayaran/" + receipt.id, changed)).status).toBe(200);
    expect(await balance()).toBe(before + 1000);
    expect((await admin.get("/api/admin/pembayaran/rapel/" + ids[6])).data.dates).toEqual([{ date: "2026-09-30", amount: 500 }, { date: selected[1], amount: 500 }]);
    expect((await admin.delete("/api/admin/pembayaran/" + receipt.id)).status).toBe(200);
    expect(await balance()).toBe(before);
    const recap = await getMonthRecap(db, "2026-10");
    expect(summarizeMonth(recap).rows.find((r) => r.house.id === ids[6])).toMatchObject({ rapelTotal: 0, empty: 3, collectedTotal: 500 });
    expect((await admin.get("/api/admin/pembayaran/" + receipt.id + "/log")).data.logs).toEqual([
      expect.objectContaining({ action: "cancel" }), expect.objectContaining({ action: "update" }), expect.objectContaining({ action: "create" }),
    ]);
  });

  it("rapel lintas bulan mengikuti hari pilihan, kas mengikuti tanggal diterima", async () => {
    const before = await balance();
    await admin.post("/api/admin/pembayaran", make(ids[7], ["2026-09-30", "2026-10-01"]));
    const september = summarizeMonth(await getMonthRecap(db, "2026-09")).rows.find((r) => r.house.id === ids[7])!;
    const october = summarizeMonth(await getMonthRecap(db, "2026-10")).rows.find((r) => r.house.id === ids[7])!;
    expect(september).toMatchObject({ rapelTotal: 500, collectedTotal: 0 });
    expect(october).toMatchObject({ rapelTotal: 500, collectedTotal: 500 });
    expect(await balance()).toBe(before + 1000);
  });

  it("Excel, CSV, dan Google Sheets memberi penanda rapel, nominal terpisah, dan total konsisten", async () => {
    const recap = await getMonthRecap(db, "2026-10");
    const house = recap.houses.find((h) => h.id === ids[0])!;
    const one = { ...recap, houses: [house] };
    const sheets = buildRecapSheets(one, "Natura");
    for (const date of selected) {
      const i = recap.dates.indexOf(date);
      expect(sheets[0].data[3][4 + i]).toMatchObject({ value: "Rapel", backgroundColor: "#dcfce7" });
    }
    expect(sheets[0].data[3].at(-2)).toMatchObject({ value: 1500 });
    expect(sheets[0].data[3].at(-1)).toMatchObject({ value: 2000 });
    const receipt = sheets[2].data.slice(3).find((row) => row[0]?.value === "R-1")!;
    expect(receipt[2]?.value).toBe("Rapel");
    expect(receipt[7]?.value).toBe(selected.join(", "));
    const csv = buildSheetsCsv(one, "2026-10", "Natura").split("\r\n");
    expect(csv[1]).toContain("Rapel (Rp)");
    expect(csv[2].split(",").slice(7, -4)).toEqual(["Rapel", "500", "Rapel", "Rapel"]);
    expect(csv[2].split(",").slice(-4)).toEqual(["0", "0", "500", "1500"]);
    expect(buildRecapCsv(one)).toContain("Rapel (Rp)");
  });

  it("kalender warga dan QR mendapat alokasi rumahnya sendiri tanpa data penerima atau catatan internal", async () => {
    const [house] = await db.select().from(houses).where(eq(houses.id, ids[0]));
    const response = await guest.get("/api/rumah/" + house.token);
    expect(response.status).toBe(200);
    const info = response.data.paymentInfo as Awaited<ReturnType<typeof getHousePaymentInfo>>;
    expect(info.receipts).toHaveLength(1);
    expect(Object.keys(info.receipts[0]).sort()).toEqual(["allocations", "amount", "cadence", "periodEnd", "periodStart", "receivedDate"]);
    expect(info.receipts[0].allocations).toEqual(selected.map((date) => [date, 500]));
    expect(Object.keys(info.cells).sort()).toEqual(selected);
    expect(Object.values(info.cells)).toEqual(selected.map(() => ({ amount: 500, monthlyAmount: 0, weeklyAmount: 0, rapelAmount: 500, paid: true })));
    const resident = await admin.get("/api/warga/rumah/" + ids[0] + "?bulan=2026-10");
    expect((resident.data.paymentInfo as typeof info).cells).toEqual(info.cells);
    expect((resident.data.history as { date: string; status: string; amount: number }[]).filter((night) => selected.includes(night.date))).toEqual(expect.arrayContaining(selected.map((date) => expect.objectContaining({ date, status: "empty", amount: 0 }))));
  });

  it("rapel tetap lunas saat nominal awal berubah dan koreksi catatan mempertahankan tarif yang sudah dibayar", async () => {
    await db.update(settings).set({ defaultAmount: 700 });
    const recap = await getMonthRecap(db, "2026-10");
    const row = summarizeMonth(recap).rows.find((r) => r.house.id === ids[0])!;
    expect(row).toMatchObject({ filledCount: 4, empty: 0, rapelTotal: 1500, total: 2000 });
    expect((await admin.get("/api/admin/pembayaran/rapel/" + ids[0])).data.dates).toEqual([{ date: "2026-09-30", amount: 700 }]);
    expect((await admin.post("/api/admin/pembayaran", make(ids[0], selected, { amount: 2100, allocations: selected.map((date) => [date, 700]) }))).status).toBe(400);
    const [receipt] = await db.select().from(payments).where(eq(payments.houseId, ids[0]));
    const before = await balance();
    const { clientId: _id, ...changed } = make(ids[0], selected, { note: "Koreksi catatan rapel" });
    expect((await admin.patch("/api/admin/pembayaran/" + receipt.id, changed)).status).toBe(200);
    expect(await balance()).toBe(before);
    expect((await db.select().from(payments).where(eq(payments.id, receipt.id)))[0]).toMatchObject({ amount: 1500, allocations: selected.map((date) => [date, 500]), note: "Koreksi catatan rapel" });
  });

  it("petugas biasa tidak dapat mencatat rapel atau melihat pilihan pembayaran", async () => {
    expect((await staff.post("/api/admin/pembayaran", make(ids[8]))).status).toBe(403);
    expect((await staff.get("/api/admin/pembayaran/rapel/" + ids[8])).status).toBe(403);
  });
});

describe("alokasi tanggal rapel", () => {
  it("tanggal sela tidak menerima alokasi dan seluruh rupiah tetap berasal dari satu penerimaan", () => {
    const payment: PeriodPayment = { ...make(1), id: 1, periodEnd: selected[2], cadence: "daily", allocations: [[selected[0], 500], [selected[1], 700], [selected[2], 700]], amount: 1900 };
    expect(allocatePayment(payment)).toEqual(payment.allocations);
    expect(allocatePayment(payment).reduce((sum, [, value]) => sum + value, 0)).toBe(1900);
  });
});
