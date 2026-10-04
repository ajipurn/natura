import { describe, expect, it } from "vitest";
import { autoLayout, pointFromEvent } from "@/lib/site-map";

const house = (id: number, block: string, number: string) => ({ id, block, number });

describe("autoLayout", () => {
  const houses = [
    ...Array.from({ length: 12 }, (_, i) => house(i + 1, "A", String(i + 1))),
    ...Array.from({ length: 3 }, (_, i) => house(100 + i, "B", String(i + 1))),
  ];

  it("menaruh semua rumah di dalam denah tanpa tumpang tindih", () => {
    const { positions, size } = autoLayout(houses);
    expect(positions.size).toBe(15);
    const keys = new Set([...positions.values()].map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(15);
    for (const p of positions.values()) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
    }
    // Maksimal 8 rumah per baris (+ setengah sel margin kiri-kanan) × 100 px per sel.
    expect(size.width).toBe(900);
  });

  it("mengurutkan per blok dan nomor", () => {
    const { positions } = autoLayout(houses);
    const a1 = positions.get(1)!;
    const a2 = positions.get(2)!;
    const a9 = positions.get(9)!;
    const b1 = positions.get(100)!;
    expect(a2.x).toBeGreaterThan(a1.x);
    expect(a2.y).toBe(a1.y);
    expect(a9.y).toBeGreaterThan(a1.y); // baris kedua
    expect(a9.x).toBe(a1.x);
    expect(b1.y).toBeGreaterThan(a9.y); // blok B di bawah blok A
  });

  it("menyesuaikan ke ukuran gambar yang sudah ada", () => {
    const fit = { width: 2000, height: 1000 };
    const { positions, size } = autoLayout(houses, fit);
    expect(size).toEqual(fit);
    for (const p of positions.values()) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
    }
  });

  it("aman untuk daftar kosong", () => {
    expect(autoLayout([]).positions.size).toBe(0);
  });
});

describe("pointFromEvent", () => {
  it("mengubah ketukan menjadi titik 0–1 dan membatasinya", () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    expect(pointFromEvent({ clientX: 110, clientY: 70 }, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointFromEvent({ clientX: 0, clientY: 500 }, rect)).toEqual({ x: 0, y: 1 });
  });
});
