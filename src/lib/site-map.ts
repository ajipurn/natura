import { groupByBlock, type HouseRef } from "./houses";

export type MapPoint = { x: number; y: number };
export type MapSize = { width: number; height: number };

/** Ukuran denah kosong (tanpa gambar). Tegak supaya pas di layar HP. */
export const DEFAULT_MAP_SIZE: MapSize = { width: 1000, height: 1300 };

/** Rumah per baris pada denah skematis. */
const MAX_COLUMNS = 8;
/** Ukuran satu sel (px) saat denah skematis menentukan ukurannya sendiri. */
const CELL = 100;
/** Tinggi ruang judul blok dan jarak antarblok, dalam satuan sel. */
const BLOCK_LABEL_ROWS = 0.8;
const BLOCK_GAP_ROWS = 0.5;

/**
 * Susun rumah secara skematis: tiap blok satu kelompok, rumah berjajar maksimal 8 per baris.
 * Tanpa `fitInto`, ukuran denah mengikuti susunan (cocok untuk denah tanpa gambar).
 * Dengan `fitInto`, susunan diletakkan di tengah denah berukuran itu (mis. gambar yang sudah ada).
 */
export function autoLayout<T extends HouseRef & { id: number }>(
  houses: T[],
  fitInto?: MapSize,
): { positions: Map<number, MapPoint>; size: MapSize } {
  const groups = groupByBlock(houses);
  const positions = new Map<number, MapPoint>();
  if (groups.length === 0) return { positions, size: fitInto ?? DEFAULT_MAP_SIZE };

  const columns = Math.min(MAX_COLUMNS, Math.max(...groups.map(([, list]) => list.length)));
  const cells: { id: number; col: number; row: number }[] = [];
  let row = 0;
  for (const [, list] of groups) {
    row += BLOCK_LABEL_ROWS;
    list.forEach((h, i) => cells.push({ id: h.id, col: i % columns, row: row + Math.floor(i / columns) }));
    row += Math.ceil(list.length / columns) + BLOCK_GAP_ROWS;
  }

  // Satuan sel; setengah sel margin di kiri-kanan.
  const gridW = columns + 1;
  const gridH = row;
  const size = fitInto ?? { width: Math.round(gridW * CELL), height: Math.round(gridH * CELL) };
  const scale = Math.min(size.width / gridW, size.height / gridH);
  const offsetX = (size.width - gridW * scale) / 2;
  const offsetY = (size.height - gridH * scale) / 2;

  for (const c of cells) {
    positions.set(c.id, {
      x: round((offsetX + (c.col + 1) * scale) / size.width),
      y: round((offsetY + (c.row + 0.5) * scale) / size.height),
    });
  }
  return { positions, size };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Titik dari klik/ketukan pada elemen denah, 0–1 dan dibatasi ke dalam denah. */
export function pointFromEvent(
  event: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
): MapPoint {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return {
    x: round(clamp((event.clientX - rect.left) / rect.width)),
    y: round(clamp((event.clientY - rect.top) / rect.height)),
  };
}
