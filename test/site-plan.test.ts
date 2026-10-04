import { describe, expect, it } from "vitest";
import { lotKey, lotRow, matchPlan, polygonArea, polygonCentroid, type PlanLot } from "@/lib/site-plan";
import { NATURA_PLAN as plan } from "@/site-plan/natura";

const keyOf = (lot: PlanLot) => (lot.number ? lotKey(lot.block, lot.number) : null);

describe("denah Natura", () => {
  it("berisi 95 kavling dengan nomor yang tidak dobel", () => {
    expect(plan.lots).toHaveLength(95);
    const keys = plan.lots.map(keyOf).filter((k): k is string => k !== null);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rumah yang sudah berdiri sesuai denah (kavling dicoret tidak ikut)", () => {
    const built = plan.lots.filter((l) => l.built).map(keyOf);
    const expected = [
      ...["1", "3", "4", "5"].map((n) => `A-${n}`),
      ...range(7, 18).map((n) => `AA-${n}`),
      ...range(1, 11).map((n) => `AB-${n}`),
      ...range(1, 10).map((n) => `AC-${n}`),
      ...[...range(1, 9), 12, 13, 14, 15].map((n) => `AD-${n}`),
      ...[...range(1, 6), 10, 11, 12].map((n) => `AE-${n}`),
      ...[...range(1, 8), 11, 12, 13, 14, ...range(18, 22)].map((n) => `AF-${n}`),
    ];
    expect([...built].sort()).toEqual([...expected].sort());
    expect(built).toHaveLength(76);
  });

  it("setiap kavling berupa poligon wajar di dalam batas gambar", () => {
    const [x0, y0, w, h] = plan.viewBox;
    for (const lot of plan.lots) {
      const name = `${lot.block}-${lot.number ?? "?"}`;
      expect(lot.points.length, name).toBeGreaterThanOrEqual(3);
      expect(polygonArea(lot.points), name).toBeGreaterThan(500);
      for (const [x, y] of lot.points) {
        expect(x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h, name).toBe(true);
      }
    }
  });

  it("kavling tanpa nomor selalu kavling kosong", () => {
    for (const lot of plan.lots.filter((l) => l.number === null)) expect(lot.built).toBe(false);
  });
});

describe("geometri denah", () => {
  it("menghitung pusat dan luas poligon", () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
    expect(polygonCentroid([...square])).toEqual([5, 5]);
    expect(polygonArea([...square])).toBe(100);
  });

  it("lotRow membagi deretan dan menolak jumlah titik yang salah", () => {
    const lots = lotRow("X", ["1", "2"], [[0, 0], [10, 0], [20, 0]], [[0, 10], [10, 10], [20, 10]], {
      unbuilt: ["2"],
      labels: { "1": "1-2" },
    });
    expect(lots.map((l) => [l.number, l.label, l.built])).toEqual([
      ["1", "1-2", true],
      ["2", undefined, false],
    ]);
    expect(lots[1].points).toEqual([[10, 0], [20, 0], [20, 10], [10, 10]]);
    expect(() => lotRow("X", ["1"], [[0, 0]], [[0, 1]])).toThrow();
  });

  it("mencocokkan kavling dengan data rumah", () => {
    const houses = [
      { id: 1, block: "aa", number: "7" },
      { id: 2, block: "C", number: "1" },
    ];
    const { lotHouse, missing, notOnPlan } = matchPlan(plan, houses);
    expect([...lotHouse.entries()].map(([lot, h]) => [keyOf(lot), h.id])).toEqual([["AA-7", 1]]);
    expect(missing).toHaveLength(75);
    expect(notOnPlan.map((h) => h.id)).toEqual([2]);
  });
});

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
