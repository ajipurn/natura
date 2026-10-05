import { describe, expect, it } from "vitest";
import { planProjection, WORLD_SIZE } from "@/lib/site-map-3d";
import { ribbonPolygon } from "@/lib/site-plan";

describe("proyeksi denah kode", () => {
  it("memusatkan viewBox dan menskalakan sisi terpanjang", () => {
    const { scale, toWorld } = planProjection([100, 50, 200, 100]);
    expect(scale).toBe(WORLD_SIZE / 200);
    expect(toWorld([200, 100])).toEqual({ x: 0, z: 0 });
    expect(toWorld([300, 150])).toEqual({ x: 50, z: 25 });
  });

  it("membentuk pita dari garis", () => {
    expect(ribbonPolygon([[0, 0], [10, 0]], 4)).toEqual([[0, 2], [10, 2], [10, -2], [0, -2]]);
  });
});
