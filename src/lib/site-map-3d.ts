/** Sisi terpanjang denah dalam satuan dunia 3D. */
export const WORLD_SIZE = 100;

export type WorldPoint = { x: number; z: number };

/** Proyeksi koordinat denah kode (piksel) ke dunia 3D: pusat viewBox di 0,0, sisi terpanjang = WORLD_SIZE. */
export function planProjection(viewBox: readonly [number, number, number, number]) {
  const [x, y, w, h] = viewBox;
  const scale = WORLD_SIZE / Math.max(w, h);
  return {
    scale,
    toWorld: ([px, py]: readonly [number, number]): WorldPoint => ({
      x: (px - (x + w / 2)) * scale,
      z: (py - (y + h / 2)) * scale,
    }),
  };
}
