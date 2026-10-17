import { getTableName } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/dates";
import { rondaPaymentPeriods } from "@/lib/payments";
import type { Db } from "@/server/db";
import { getPaymentData, getPaymentMonth } from "@/server/payments";
import { getMonthRecap, getRondaSnapshot, listHouses } from "@/server/queries";
import { collections, houses, paymentPlans, payments, patrols, settings } from "@/server/schema";
import { createTestEnv } from "./helpers/db";

type MeasuredDb = Db & { $client: { query: (statement: string | { text: string }, params?: unknown[]) => Promise<{ rows: unknown[] }> } };
let db: MeasuredDb;
let monthly: number;
let weekly: number;
let daily: number;
const now = new Date("2026-10-17T14:00:00Z");
const guard = { id: 1, name: "Petugas uji", role: "petugas" as const };

beforeAll(async () => {
  db = (await createTestEnv()).db as MeasuredDb;
  await db.insert(settings).values({ communityName: "Natura" });
  const rows = await db.insert(houses).values(["1", "2", "3"].map((number) => ({ block: "Q", number, token: `SCOPE${number}` }))).returning();
  [monthly, weekly, daily] = rows.map((row) => row.id);
  await db.insert(paymentPlans).values([
    { houseId: monthly, effectiveFrom: "2026-01-01", cadence: "monthly", ratePerNight: 500, dueTiming: "end" },
    { houseId: monthly, effectiveFrom: "2026-10-16", cadence: "monthly", ratePerNight: 700, dueTiming: "end" },
    { houseId: monthly, effectiveFrom: "2026-11-01", cadence: "monthly", ratePerNight: 900, dueTiming: "end" },
    { houseId: weekly, effectiveFrom: "2026-09-25", cadence: "weekly", weekStart: 5, ratePerNight: 500, dueTiming: "end" },
    { houseId: weekly, effectiveFrom: "2026-10-15", cadence: "weekly", weekStart: 6, ratePerNight: 500, dueTiming: "end" },
    { houseId: daily, effectiveFrom: "2026-01-01", cadence: "daily", ratePerNight: 500, dueTiming: "end" },
  ]);
  const oldNights = await db.insert(patrols).values(Array.from({ length: 120 }, (_, i) => ({ date: addDays("2026-01-01", i) }))).returning();
  await db.insert(collections).values(oldNights.flatMap((night) => rows.map((house) => ({
    patrolId: night.id, houseId: house.id, status: "filled" as const, amount: 500, method: "scan" as const, recordedAt: new Date(`${night.date}T14:00:00Z`),
  }))));
  for (const [date, houseId, amount] of [
    ["2026-09-25", weekly, 3000], ["2026-10-01", weekly, 500],
    ["2026-10-10", daily, 0], ["2026-10-15", monthly, 500], ["2026-11-06", weekly, 3500],
  ] as const) {
    const [night] = await db.insert(patrols).values({ date }).returning();
    await db.insert(collections).values({ patrolId: night.id, houseId, status: amount ? "filled" : "empty", amount, method: "scan", recordedAt: new Date(`${date}T14:00:00Z`) });
  }
  await db.insert(payments).values([
    { houseId: monthly, periodStart: "2026-01-01", periodEnd: "2026-01-31", cadence: "monthly" as const, amount: 15500 },
    // Pembagian rupiah harus memakai rentang asli, meskipun hanya satu bulan yang diminta.
    { houseId: monthly, periodStart: "2026-09-20", periodEnd: "2026-11-10", cadence: "monthly" as const, amount: 26003 },
    { houseId: monthly, periodStart: "2026-12-01", periodEnd: "2026-12-31", cadence: "monthly" as const, amount: 27900 },
    { houseId: weekly, periodStart: "2026-09-24", periodEnd: "2026-09-24", cadence: "weekly" as const, amount: 500 },
    { houseId: weekly, periodStart: "2026-11-06", periodEnd: "2026-11-06", cadence: "weekly" as const, amount: 500 },
    { houseId: daily, periodStart: "2026-08-01", periodEnd: "2026-10-20", cadence: "daily" as const, amount: 1777, allocations: [["2026-08-01", 500], ["2026-10-10", 777], ["2026-10-20", 500]] as [string, number][] },
    { houseId: monthly, periodStart: "2026-10-01", periodEnd: "2026-10-31", cadence: "monthly" as const, amount: 100000, cancelledAt: now },
  ].map((receipt, i) => ({ ...receipt, clientId: `scope-${i}`, receivedDate: "2026-10-17", receivedBy: "treasurer" as const })));
});

describe("query pembayaran untuk Ronda dan rekap", () => {
  it.each(["2026-09", "2026-10", "2026-11"])("rekap %s sama dengan perhitungan memakai riwayat lengkap", async (month) => {
    const full = await getMonthRecap(db, month, { houses: listHouses(db), payments: getPaymentData(db) });
    expect(await getMonthRecap(db, month)).toEqual(full);
  });

  it("periode lintas bulan, perubahan tarif, dan rapel tetap dihitung lengkap", async () => {
    const recap = await getMonthRecap(db, "2026-10");
    expect(recap.paymentPeriods).toEqual(expect.arrayContaining([
      expect.objectContaining({ houseId: weekly, start: "2026-09-25", end: "2026-10-01", paid: 3500, status: "paid" }),
      expect.objectContaining({ houseId: weekly, start: "2026-10-31", end: "2026-11-06", paid: 4000, status: "paid" }),
      expect.objectContaining({ houseId: monthly, start: "2026-10-01", end: "2026-10-15", expected: 7500 }),
      expect.objectContaining({ houseId: monthly, start: "2026-10-16", end: "2026-10-31", expected: 11200 }),
    ]));
    expect(recap.paymentCells?.[`${daily}:2026-10-10`]).toMatchObject({ amount: 777, rapelAmount: 777, paid: true });
    expect(recap.periodPayments).toEqual(expect.arrayContaining([
      expect.objectContaining({ houseId: monthly, periodStart: "2026-09-20", periodEnd: "2026-11-10", amount: 26003 }),
    ]));
    expect(recap.periodPayments?.some((payment) => payment.amount === 100000)).toBe(false);
  });

  it("snapshot Ronda menyimpan pembayaran dan kesepakatan mendatang untuk pergantian bulan offline", async () => {
    const full = await getPaymentMonth(db, "2026-10", "2026-10-17");
    const snapshot = await getRondaSnapshot(db, guard, now);
    expect(snapshot.paymentPeriods).toEqual(full.bills);
    expect(snapshot.paymentCells).toEqual(Object.fromEntries(Object.entries(full.cells).filter(([key]) => key.split(":")[1] >= "2026-10-01")));
    expect(snapshot.paymentPlans).toEqual(full.plans.map(({ id, houseId, effectiveFrom, cadence, ratePerNight, dueTiming, graceDays, weekStart }) => ({ id, houseId, effectiveFrom, cadence, ratePerNight, dueTiming, graceDays, weekStart })));
    expect(rondaPaymentPeriods(snapshot, "2026-12-01")).toEqual(expect.arrayContaining([
      expect.objectContaining({ houseId: monthly, start: "2026-12-01", expected: 27900, paid: 27900, status: "paid" }),
    ]));
  });

  it("sinkronisasi malam sebelumnya tetap membaca bulan tanggal antrean", async () => {
    const snapshot = await getRondaSnapshot(db, guard, new Date("2026-11-01T14:00:00Z"), "2026-10-31");
    const full = await getPaymentMonth(db, "2026-10", "2026-11-01");
    expect(snapshot.date).toBe("2026-10-31");
    expect(snapshot.paymentPeriods).toEqual(full.bills);
    expect(snapshot.paymentCells?.[`${daily}:2026-10-10`]).toMatchObject({ rapelAmount: 777, paid: true });
  });

  it.each(["Ronda", "Rekap"])("%s tidak menarik seluruh catatan lama dari database", async (page) => {
    const query = vi.spyOn(db.$client, "query");
    try {
      if (page === "Ronda") await getRondaSnapshot(db, guard, now);
      else await getMonthRecap(db, "2026-10");
      const returned = await Promise.all(query.mock.results.map((result) => result.value as Promise<{ rows: unknown[] }>));
      // Ukur baris yang benar-benar keluar dari driver, bukan sesudah disaring di JavaScript.
      expect(returned.reduce((count, result) => count + result.rows.length, 0)).toBeLessThan(80);
      const receiptIndex = query.mock.calls.findIndex(([statement]) => {
        const text = typeof statement === "string" ? statement : statement.text;
        return text.includes('"client_id"') && text.includes(`from "${getTableName(payments)}"`);
      });
      expect(receiptIndex).toBeGreaterThanOrEqual(0);
      expect(returned[receiptIndex].rows.length).toBeLessThanOrEqual(page === "Ronda" ? 4 : 3);
    } finally {
      query.mockRestore();
    }
  });

  it("halaman pembayaran tetap membawa tunggakan dan pelunasan lama", async () => {
    const data = await getPaymentMonth(db, "2026-10", "2026-10-17");
    expect(data.dailyCells[`${monthly}:2026-01-01`]).toMatchObject({ amount: 500 });
    expect(data.receipts.some((receipt) => receipt.periodStart === "2026-01-01")).toBe(true);
    expect(data.previousUnpaidBills).toEqual(expect.arrayContaining([
      expect.objectContaining({ houseId: monthly, start: "2026-05-01", remaining: 15500, status: "unpaid" }),
    ]));
    expect(data.previousUnpaidBills.some((bill) => bill.houseId === monthly && bill.start === "2026-01-01")).toBe(false);
  });
});
