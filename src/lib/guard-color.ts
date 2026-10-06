/** Warna baris jadwal, mengikuti warna sel di tabel jadwal asli. Tanpa warna = putih. */
export const GUARD_COLORS = ["green", "yellow", "orange"] as const;
export type GuardColor = (typeof GUARD_COLORS)[number];

export const GUARD_COLOR_LABEL: Record<GuardColor, string> = { green: "Hijau", yellow: "Kuning", orange: "Oranye" };

/** Arti warna di tabel jadwal Natura: seberapa mungkin orangnya ikut ronda. */
export const GUARD_COLOR_MEANING: Record<GuardColor | "white", string> = {
  green: "Aktif",
  yellow: "Kadang ikut",
  orange: "Jarang ikut",
  white: "Tidak ikut",
};

/** Warna khas spreadsheet (Excel, Google Sheets) untuk tiap warna jadwal. */
const REFERENCES: [GuardColor | null, string][] = [
  ["green", "#74aa4e"],
  ["green", "#92d050"],
  ["green", "#93c47d"],
  ["green", "#00b050"],
  ["green", "#b6d7a8"],
  ["green", "#a9d08e"],
  ["yellow", "#fdfc5e"],
  ["yellow", "#ffff00"],
  ["yellow", "#ffe599"],
  ["yellow", "#fff2cc"],
  ["yellow", "#ffd966"],
  ["orange", "#f4b407"],
  ["orange", "#ffc000"],
  ["orange", "#f6b26b"],
  ["orange", "#f9cb9c"],
  ["orange", "#e69138"],
  ["orange", "#ed7d31"],
  [null, "#ffffff"],
  [null, "#f3f3f3"],
];

function toRgb(css: string): [number, number, number] | null {
  const value = css.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (rgb) {
    // Latar transparan = tanpa warna.
    if (rgb[4] !== undefined && parseFloat(rgb[4]) === 0) return null;
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  const named: Record<string, string> = { white: "#ffffff", yellow: "#ffff00", orange: "#ffa500", green: "#00b050", lime: "#00ff00" };
  return named[value] ? toRgb(named[value]) : null;
}

/** Warna latar sel spreadsheet (CSS) → warna jadwal terdekat; null kalau putih/tidak dikenal. */
export function classifyCellColor(css: string | null | undefined): GuardColor | null {
  const rgb = css ? toRgb(css) : null;
  if (!rgb) return null;
  let best: GuardColor | null = null;
  let bestDistance = Infinity;
  for (const [color, ref] of REFERENCES) {
    const [r, g, b] = toRgb(ref)!;
    const distance = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2;
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}
