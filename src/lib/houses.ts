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

/** "Blok A No. 12", "a-12", "A 12" → "A12" */
function compactLabel(value: string): string {
  return value
    .toUpperCase()
    .replace(/\b(BLOK|BLK|NOMOR|NO)\b\.?/g, "")
    .replace(/[^0-9A-Z]/g, "");
}

/**
 * Cari rumah dari ketikan petugas (cadangan kalau QR gagal di-scan).
 * Menerima "A12", "a-12", "blok a no 12", nomor saja ("12" → semua blok), atau potongan nama KK.
 */
export function searchHouses<T extends HouseRef & { ownerName?: string | null }>(
  houses: T[],
  query: string,
  limit = 30,
): T[] {
  const text = query.trim();
  if (!text) return [];
  const key = compactLabel(text);
  const name = text.toLowerCase();
  const numberOnly = /^\d+[A-Z]?$/.test(key);

  const matches: { house: T; rank: number }[] = [];
  for (const house of houses) {
    const label = compactLabel(`${house.block}${house.number}`);
    let rank = -1;
    if (key && label === key) rank = 0;
    else if (numberOnly && compactLabel(house.number) === key) rank = 1;
    else if (key && label.startsWith(key)) rank = 2;
    else if (name.length >= 2 && house.ownerName?.toLowerCase().includes(name)) rank = 3;
    if (rank >= 0) matches.push({ house, rank });
  }
  return matches
    .sort((a, b) => a.rank - b.rank || compareHouses(a.house, b.house))
    .slice(0, limit)
    .map((m) => m.house);
}
