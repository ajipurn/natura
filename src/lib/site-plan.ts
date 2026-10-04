import type { HouseRef } from "./houses";

/** Titik di denah, dalam satuan piksel gambar sumber denah. */
export type PlanPoint = readonly [x: number, y: number];

export type PlanLot = {
  block: string;
  /** Nomor rumah untuk dicocokkan dengan data rumah; null kalau nomornya tidak diketahui. */
  number: string | null;
  /** Teks di denah kalau berbeda dari nomor rumahnya (mis. "1-2" untuk kavling gabungan). */
  label?: string;
  /** false = kavling kosong / belum ada rumah (dicoret di denah asli). */
  built: boolean;
  points: PlanPoint[];
};

export type SitePlan = {
  name: string;
  /** Batas gambar: [x, y, lebar, tinggi]. */
  viewBox: readonly [number, number, number, number];
  /** Kawasan cluster (jalan dan lahan di dalam batas). */
  area: PlanPoint[];
  /** Taman / ruang terbuka hijau. */
  greens: PlanPoint[][];
  /** Saluran air, digambar sebagai garis. */
  channels: { points: PlanPoint[]; width: number }[];
  lots: PlanLot[];
  labels: { text: string; at: PlanPoint; size?: number }[];
};

export function lotKey(block: string, number: string): string {
  return `${block.trim().toUpperCase()}-${number.trim().toUpperCase()}`;
}

export function houseKey(house: HouseRef): string {
  return lotKey(house.block, house.number);
}

/** Pusat massa poligon (untuk meletakkan nomor kavling dan rumah 3D). */
export function polygonCentroid(points: readonly PlanPoint[]): PlanPoint {
  let area = 0;
  let cx = 0;
  let cy = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  });
  if (Math.abs(area) < 1e-9) {
    const n = points.length;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

export function polygonArea(points: readonly PlanPoint[]): number {
  let sum = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  });
  return Math.abs(sum) / 2;
}

export function polygonBounds(points: readonly PlanPoint[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Ukuran huruf nomor kavling: sebanding dengan sisi pendek kavling. */
export function lotFontSize(lot: PlanLot): number {
  const { minX, minY, maxX, maxY } = polygonBounds(lot.points);
  const short = Math.min(maxX - minX, maxY - minY);
  const text = lot.label ?? lot.number ?? "";
  return Math.max(10, Math.min(22, short * (text.length > 2 ? 0.32 : 0.45)));
}

/** Poligon diperkecil ke arah pusatnya (jarak antar-rumah di 3D, sela antar-kavling di 2D). */
export function shrinkPolygon(points: readonly PlanPoint[], factor: number): PlanPoint[] {
  const [cx, cy] = polygonCentroid(points);
  return points.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor] as const);
}

export function pointsAttr(points: readonly PlanPoint[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/**
 * Deretan kavling dari dua garis: titik-titik batas di sisi atas dan di sisi bawah
 * (urut sama, jumlahnya = jumlah kavling + 1). Kavling ke-i = atas[i], atas[i+1], bawah[i+1], bawah[i].
 */
export function lotRow(
  block: string,
  numbers: (string | null)[],
  top: PlanPoint[],
  bottom: PlanPoint[],
  options: { unbuilt?: (string | null)[]; labels?: Record<string, string> } = {},
): PlanLot[] {
  if (top.length !== numbers.length + 1 || bottom.length !== numbers.length + 1) {
    throw new Error(`lotRow ${block}: butuh ${numbers.length + 1} titik di tiap sisi`);
  }
  return numbers.map((number, i) => ({
    block,
    number,
    ...(number && options.labels?.[number] ? { label: options.labels[number] } : {}),
    built: number !== null && !(options.unbuilt ?? []).includes(number),
    points: [top[i], top[i + 1], bottom[i + 1], bottom[i]],
  }));
}

/** Kecocokan antara kavling di denah dan data rumah. */
export function matchPlan<H extends HouseRef & { id: number }>(plan: SitePlan, houses: H[]) {
  const byKey = new Map(houses.map((h) => [houseKey(h), h]));
  const lotHouse = new Map<PlanLot, H>();
  const missing: PlanLot[] = [];
  for (const lot of plan.lots) {
    if (!lot.number) continue;
    const house = byKey.get(lotKey(lot.block, lot.number));
    if (house) lotHouse.set(lot, house);
    else if (lot.built) missing.push(lot);
  }
  const onPlan = new Set([...lotHouse.values()].map((h) => h.id));
  const notOnPlan = houses.filter((h) => !onPlan.has(h.id));
  return { lotHouse, missing, notOnPlan };
}

/** Garis bertebal → poligon (untuk saluran di 3D). Arah normal dirata-rata di tiap titik. */
export function ribbonPolygon(points: readonly PlanPoint[], width: number): PlanPoint[] {
  const half = width / 2;
  const left: PlanPoint[] = [];
  const right: PlanPoint[] = [];
  points.forEach(([x, y], i) => {
    const [px, py] = points[Math.max(0, i - 1)];
    const [nx, ny] = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(nx - px, ny - py) || 1;
    const normalX = -(ny - py) / len;
    const normalY = (nx - px) / len;
    left.push([x + normalX * half, y + normalY * half]);
    right.push([x - normalX * half, y - normalY * half]);
  });
  return [...left, ...right.reverse()];
}
