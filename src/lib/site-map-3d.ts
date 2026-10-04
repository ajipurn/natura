import type { MapPoint, MapSize } from "./site-map";

/** Sisi terpanjang denah dalam satuan dunia 3D. */
export const WORLD_SIZE = 100;

export type WorldDimensions = { width: number; depth: number };
export type WorldPoint = { x: number; z: number };

/** Ukuran alas 3D dengan perbandingan sama seperti denah 2D. */
export function worldDimensions(size: MapSize): WorldDimensions {
  const scale = WORLD_SIZE / Math.max(size.width, size.height);
  return { width: size.width * scale, depth: size.height * scale };
}

/** Titik denah (0–1, y ke bawah) → titik di alas 3D (pusat di 0,0; z ke arah penonton). */
export function toWorld(point: MapPoint, dims: WorldDimensions): WorldPoint {
  return { x: (point.x - 0.5) * dims.width, z: (point.y - 0.5) * dims.depth };
}

/**
 * Lebar rumah 3D: 70% dari jarak tetangga terdekat yang umum (median), supaya rumah
 * tidak saling menempel tapi tetap terlihat. Satu-dua rumah yang berdempetan tidak
 * membuat semua rumah mengecil.
 */
export function houseFootprint(points: WorldPoint[], min = 1.2, max = 6): number {
  if (points.length < 2) return max;
  const nearest = points.map((p, i) => {
    let best = Infinity;
    points.forEach((q, j) => {
      if (i !== j) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
    });
    return best;
  });
  nearest.sort((a, b) => a - b);
  const median = nearest[Math.floor(nearest.length / 2)];
  return Math.min(max, Math.max(min, median * 0.7));
}
