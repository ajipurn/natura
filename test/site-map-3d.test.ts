import { describe, expect, it } from "vitest";
import { houseFootprint, toWorld, worldDimensions, WORLD_SIZE } from "@/lib/site-map-3d";

describe("denah 3D", () => {
  it("mempertahankan perbandingan lebar:tinggi denah", () => {
    expect(worldDimensions({ width: 800, height: 1000 })).toEqual({ width: 80, depth: WORLD_SIZE });
    expect(worldDimensions({ width: 2000, height: 1000 })).toEqual({ width: WORLD_SIZE, depth: 50 });
  });

  it("memusatkan denah di titik 0,0", () => {
    const dims = { width: 80, depth: 100 };
    expect(toWorld({ x: 0.5, y: 0.5 }, dims)).toEqual({ x: 0, z: 0 });
    expect(toWorld({ x: 0, y: 1 }, dims)).toEqual({ x: -40, z: 50 });
  });

  it("ukuran rumah mengikuti jarak tetangga yang umum, bukan yang paling dempet", () => {
    const row = Array.from({ length: 10 }, (_, i) => ({ x: i * 5, z: 0 }));
    expect(houseFootprint(row)).toBeCloseTo(3.5);
    // Satu pasang rumah berdempetan tidak mengecilkan semuanya.
    expect(houseFootprint([...row, { x: 0.3, z: 0 }])).toBeCloseTo(3.5);
    expect(houseFootprint([{ x: 0, z: 0 }])).toBe(6);
    expect(houseFootprint([{ x: 0, z: 0 }, { x: 0.1, z: 0 }])).toBe(1.2);
  });
});
