import { describe, expect, it } from "vitest";
import { houseWatch } from "@/lib/house-watch";
import type { BillingPeriod } from "@/lib/payments";
import type { MonthRecap } from "@/lib/types";

const house = (id: number) => ({ id, block: "AA", number: String(id), ownerName: `Warga ${id}`, token: `TOKEN${id}`, status: "active" as const });
const period = (houseId: number, start: string, end: string): BillingPeriod => ({ houseId, start, end, planId: houseId, cadence: "monthly", expected: 15500, paid: 0, remaining: 15500, status: "unpaid" });
const data: MonthRecap = {
  houses: [house(1), house(2), house(3)], dates: ["2026-10-04", "2026-10-06", "2026-10-07"],
  cells: {
    "1:2026-10-06": { status: "empty", amount: 0 }, "1:2026-10-07": { status: "empty", amount: 0 },
    "2:2026-10-04": { status: "empty", amount: 0 }, "2:2026-10-06": { status: "empty", amount: 0 },
    "3:2026-10-04": { status: "empty", amount: 0 }, "3:2026-10-06": { status: "filled", amount: 500 },
  },
};
describe("pantauan jimpitan harian", () => {
  it("mengurutkan rangkaian kosong dan memberi tanggal terakhir, termasuk saat malam ini belum dicek", () => {
    const rows = houseWatch(data, "2026-10-08");
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ ownerName: "Warga 1", empty: 2, nights: 2, emptyStreak: 2, lastChecked: "2026-10-07" });
    expect(rows[0].recent.map((r) => r.status)).toEqual(["unchecked", "unchecked", "unchecked", "unchecked", "unchecked", "empty", "empty"]);
    expect(rows[0].recent.at(-1)?.date).toBe("2026-10-07");
  });
  it("malam yang tidak diperiksa memutus rangkaian, dan hasil terisi mengakhiri rangkaian kosong", () => {
    const rows = houseWatch(data, "2026-10-08");
    expect(rows[1]).toMatchObject({ empty: 2, nights: 2, emptyStreak: 1 });
    expect(rows[2]).toMatchObject({ empty: 1, nights: 2, emptyStreak: 0 });
  });
  it("mengabaikan rumah mudik dan mingguan/bulanan yang aktif sekarang", () => {
    expect(houseWatch({ ...data, houses: data.houses.map((h) => h.id === 1 ? { ...h, status: "vacant" } : h), paymentPeriods: [period(2, "2026-10-01", "2026-10-31")] }, "2026-10-08").map((r) => r.id)).toEqual([3]);
  });
  it("periode lama memutus rangkaian dan tidak dihitung sebagai pemeriksaan harian", () => {
    const [row] = houseWatch({ ...data, houses: [house(1)], paymentPeriods: [period(1, "2026-10-01", "2026-10-06")] }, "2026-10-08");
    expect(row).toMatchObject({ empty: 1, nights: 1, emptyStreak: 1 });
    expect(row.recent[5].status).toBe("period");
  });
  it("tidak membuat hasil kosong dari hari yang belum dicatat atau belum tiba", () => {
    expect(houseWatch({ ...data, cells: {} }, "2026-10-08")).toEqual([]);
    const [row] = houseWatch({ ...data, houses: [house(1)], cells: { "1:2026-10-01": { status: "empty", amount: 0 }, "1:2026-10-09": { status: "empty", amount: 0 } } }, "2026-10-08");
    expect(row).toMatchObject({ empty: 1, nights: 1, emptyStreak: 1, recent: [{ date: "2026-10-01", status: "empty" }] });
  });
});
