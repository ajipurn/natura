import type { PlanLot, PlanPoint, SitePlan } from "./site-plan";

export type GeoPoint = { lat: number; lng: number };

/** Satu titik acuan kalibrasi: posisi di denah (x, y) dan koordinat GPS-nya. */
export type GeoAnchor = { x: number; y: number; lat: number; lng: number };

export const MIN_ANCHORS = 3;
export const MAX_ANCHORS = 12;

/** Meter per derajat lintang (cukup tepat untuk kawasan seluas satu cluster). */
const METERS_PER_DEGREE = 111_320;

/** Proyeksi datar sederhana ke meter (timur, utara) di sekitar `origin`. */
function toMeters(p: GeoPoint, origin: GeoPoint): [number, number] {
  return [
    (p.lng - origin.lng) * METERS_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180),
    (p.lat - origin.lat) * METERS_PER_DEGREE,
  ];
}

/** Selesaikan sistem 3×3 (eliminasi Gauss). Null kalau tidak punya satu jawaban. */
function solve3(m: number[][], v: number[]): number[] | null {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c < 4; c++) a[r][c] -= f * a[col][c];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

export type GeoTransform = {
  /** Koordinat GPS → titik di denah. */
  toPlan: (p: GeoPoint) => PlanPoint;
  /** Kira-kira berapa meter untuk satu satuan denah. */
  metersPerUnit: number;
  /** Selisih tiap titik acuan setelah kalibrasi, dalam meter (besar = titiknya mungkin salah). */
  residuals: number[];
};

/**
 * Kalibrasi denah dari titik-titik acuan (minimal 3, tidak segaris): transformasi affine
 * meter → denah dengan kuadrat terkecil, jadi denah boleh sedikit miring, berputar, atau tidak
 * sama skala mendatar/tegaknya (digambar dari foto).
 */
export function fitGeoTransform(anchors: readonly GeoAnchor[]): GeoTransform | null {
  if (anchors.length < MIN_ANCHORS) return null;
  const origin = {
    lat: anchors.reduce((s, a) => s + a.lat, 0) / anchors.length,
    lng: anchors.reduce((s, a) => s + a.lng, 0) / anchors.length,
  };
  const rows = anchors.map((a) => toMeters(a, origin));
  // Persamaan normal untuk [e, n, 1]·k = x (dan = y).
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atx = [0, 0, 0];
  const aty = [0, 0, 0];
  rows.forEach(([e, n], i) => {
    const r = [e, n, 1];
    for (let p = 0; p < 3; p++) {
      for (let q = 0; q < 3; q++) ata[p][q] += r[p] * r[q];
      atx[p] += r[p] * anchors[i].x;
      aty[p] += r[p] * anchors[i].y;
    }
  });
  // Titik terlalu berdekatan atau hampir segaris tidak bisa menentukan arah denah: tolak.
  // (e, n sudah berpusat di rata-rata titik acuan, jadi ini momen sebarannya.)
  const [sxx, syy, sxy] = [ata[0][0], ata[1][1], ata[0][1]];
  if (sxx + syy < 25 * anchors.length || sxx * syy - sxy * sxy < 0.01 * sxx * syy) return null;
  const kx = solve3(ata, atx);
  const ky = solve3(ata, aty);
  if (!kx || !ky) return null;
  const det = kx[0] * ky[1] - kx[1] * ky[0];
  if (Math.abs(det) < 1e-9) return null;
  const metersPerUnit = 1 / Math.sqrt(Math.abs(det));

  const toPlan = (p: GeoPoint): PlanPoint => {
    const [e, n] = toMeters(p, origin);
    return [kx[0] * e + kx[1] * n + kx[2], ky[0] * e + ky[1] * n + ky[2]];
  };
  const residuals = anchors.map((a) => {
    const [x, y] = toPlan(a);
    return Math.hypot(x - a.x, y - a.y) * metersPerUnit;
  });
  return { toPlan, metersPerUnit, residuals };
}

/**
 * Baca koordinat yang disalin dari Google Maps ("-6.2088, 106.8456") atau ditulis dengan spasi.
 * Null kalau bukan koordinat yang masuk akal.
 */
export function parseLatLng(text: string): GeoPoint | null {
  const match = text.trim().match(/^\(?\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*\)?$/);
  if (!match) return null;
  // Koma desimal hanya kalau pemisahnya bukan koma ("−6,2 106,8").
  const lat = Number(match[1].replace(",", "."));
  const lng = Number(match[2].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function formatLatLng(p: GeoPoint): string {
  return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
}

function pointInPolygon([x, y]: PlanPoint, polygon: readonly PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment([px, py]: PlanPoint, [ax, ay]: PlanPoint, [bx, by]: PlanPoint): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Jarak titik ke tepi poligon (0 kalau di dalam). */
export function distanceToPolygon(point: PlanPoint, polygon: readonly PlanPoint[]): number {
  if (pointInPolygon(point, polygon)) return 0;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    best = Math.min(best, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return best;
}

export type PlanLocation =
  /** Di dalam kavling. */
  | { kind: "lot"; lot: PlanLot }
  /** Di jalan/taman, dekat kavling ini. */
  | { kind: "near"; lot: PlanLot; meters: number }
  /** Di luar kawasan cluster. */
  | { kind: "outside"; meters: number };

/** Kavling terdekat dari sebuah titik di denah, untuk memberi tahu petugas sedang di mana. */
export function locateOnPlan(plan: SitePlan, point: PlanPoint, metersPerUnit: number): PlanLocation {
  const outside = distanceToPolygon(point, plan.area) * metersPerUnit;
  if (outside > 15) return { kind: "outside", meters: outside };
  let nearest: { lot: PlanLot; distance: number } | null = null;
  for (const lot of plan.lots) {
    const distance = distanceToPolygon(point, lot.points);
    if (distance === 0) return { kind: "lot", lot };
    if (!nearest || distance < nearest.distance) nearest = { lot, distance };
  }
  return nearest ? { kind: "near", lot: nearest.lot, meters: nearest.distance * metersPerUnit } : { kind: "outside", meters: outside };
}
