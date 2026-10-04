export type HouseRef = { block: string; number: string };

const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

/** Urut alami: A-2 sebelum A-10, blok A sebelum blok B. */
export function compareHouses(a: HouseRef, b: HouseRef): number {
  return collator.compare(a.block, b.block) || collator.compare(a.number, b.number);
}

/** "A-12" */
export function houseLabel(h: HouseRef): string {
  return `${h.block}-${h.number}`;
}

/** "Blok A No. 12" */
export function houseLabelLong(h: HouseRef): string {
  return `Blok ${h.block} No. ${h.number}`;
}

export function groupByBlock<T extends HouseRef>(houses: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const h of [...houses].sort(compareHouses)) {
    const list = groups.get(h.block) ?? [];
    list.push(h);
    groups.set(h.block, list);
  }
  return [...groups];
}

/**
 * Mengurai daftar nomor rumah: "1-10", "1, 3, 5", "1-5, 7, 10A".
 * Mengembalikan null kalau formatnya salah atau terlalu banyak.
 */
export function parseNumberList(input: string, max = 500): string[] | null {
  const result: string[] = [];
  const parts = input
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  for (const part of parts) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to || to - from + 1 > max) return null;
      for (let n = from; n <= to; n++) result.push(String(n));
    } else if (/^[0-9A-Za-z]{1,10}$/.test(part)) {
      result.push(part.toUpperCase());
    } else {
      return null;
    }
    if (result.length > max) return null;
  }
  return [...new Set(result)];
}

/** Rapikan input blok/nomor: trim, huruf besar, tanpa spasi ganda. */
export function normalizeHouseField(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}
