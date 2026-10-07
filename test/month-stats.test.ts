import { describe, expect, it } from "vitest";
import { monthStats } from "@/lib/month-stats";
import { monthHouseNights } from "@/lib/month-summary";
import type { BillingPeriod } from "@/lib/payments";
import type { MonthRecap } from "@/lib/types";

const dates = Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`);
const house = { id: 1, block: "A", number: "5", ownerName: null, token: "TEST", status: "active" as const };
const period: BillingPeriod = { houseId: 1, planId: 1, cadence: "monthly", start: dates[0], end: "2026-10-31", expected: 15500, paid: 0, remaining: 15500, status: "unpaid" };
const recap: MonthRecap = { houses: [house], dates, cells: { [`1:${dates[5]}`]: { status: "empty", amount: 0 }, [`1:${dates[6]}`]: { status: "empty", amount: 0 } }, paymentPeriods: [period] };

describe("ringkasan bulanan dengan status periode otomatis", () => {
  it("periode belum dibayar tidak dihitung sebagai malam yang tidak dicek", () => {
    const stats = monthStats(recap);
    expect(stats.perHouse[0]).toMatchObject({ filled: 0, empty: 7, unchecked: 0, total: 0 });
    expect(stats.perNight.every((n) => n.empty === 1 && n.total === 0)).toBe(true);
  });

  it("periode lunas menimpa kosong lama, tanpa menggandakan uang di setiap malam", () => {
    const paymentCells = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`1:2026-10-${String(i + 1).padStart(2, "0")}`, { amount: 500, monthlyAmount: 500, weeklyAmount: 0, paid: true }]));
    const stats = monthStats({ ...recap, paymentCells, paymentPeriods: [{ ...period, status: "paid", paid: 15500, remaining: 0 }] });
    expect(stats.perHouse[0]).toMatchObject({ filled: 7, empty: 0, unchecked: 0, total: 15500, periodTotal: 15500 });
    expect(stats.total).toBe(15500);
    expect(stats.perNight.every((n) => n.filled === 1 && n.total === 0)).toBe(true);
  });

  it("catatan isi lama tetap diakui sebagai uang dan status, walaupun periode belum lunas", () => {
    const stats = monthStats({ ...recap, cells: { ...recap.cells, [`1:${dates[4]}`]: { status: "filled", amount: 500 } }, paymentPeriods: [{ ...period, paid: 500, remaining: 15000 }] });
    expect(stats.perHouse[0]).toMatchObject({ filled: 1, empty: 6, unchecked: 0, total: 500 });
    expect(stats.total).toBe(500);
    expect(stats.perNight[4]).toMatchObject({ filled: 1, total: 500 });
  });

  it("perubahan periode hanya berlaku di tanggal terkait dan rumah mudik tidak diotomatisasi", () => {
    const weekly: BillingPeriod = { ...period, cadence: "weekly", start: dates[2], end: dates[4], expected: 1500, paid: 1500, remaining: 0, status: "paid" };
    const data = { ...recap, paymentPeriods: [weekly, { ...period, start: dates[5] }] };
    expect(monthHouseNights(data, house).map((n) => n.status)).toEqual(["unchecked", "unchecked", "filled", "filled", "filled", "empty", "empty"]);
    expect(monthStats(data).perHouse[0]).toMatchObject({ filled: 3, empty: 2, unchecked: 2, total: 0 });
    expect(monthStats({ ...data, houses: [{ ...house, status: "vacant" }] }).perHouse[0]).toMatchObject({ filled: 0, empty: 2, unchecked: 5, total: 0 });
  });

  it("rumah harian tetap mengikuti catatan asli", () => {
    expect(monthStats({ ...recap, paymentPeriods: [] }).perHouse[0]).toMatchObject({ filled: 0, empty: 2, unchecked: 5, total: 0 });
  });
});
