import { lotKey } from "./site-plan";

/**
 * Jadwal ronda: siapa jaga di malam apa. Hari dihitung dari tanggal ronda (malamnya),
 * jadi "Ahad (malam Senin)" = jaga hari Minggu malam = hari 0.
 */
export const DAY_NAMES = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

export type ScheduleEntry = {
  day: number;
  /** Urutan di jadwal (mulai 0) supaya tampil sama seperti aslinya. */
  position: number;
  name: string | null;
  block: string;
  number: string;
  /** Asal sel di tabel (baris, kolom) untuk tabel tempelan, dipakai untuk mencocokkan warna sel. */
  cell?: { row: number; col: number };
};

/** Nama malamnya, mengikuti kebiasaan jadwal: Sabtu = "malam Minggu". */
const NIGHT_OF = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;

/** "Ahad (malam Senin)", "Sabtu (malam Minggu)" */
export function dayLabel(day: number): string {
  return `${DAY_NAMES[day]} (malam ${NIGHT_OF[day]})`;
}

/** Hari ronda (0 = Ahad) dari tanggal ronda "YYYY-MM-DD". */
export function scheduleDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const DAY_WORDS: Record<string, number> = {
  AHAD: 0,
  MINGGU: 0,
  SENIN: 1,
  SELASA: 2,
  RABU: 3,
  KAMIS: 4,
  JUMAT: 5,
  SABTU: 6,
};

/**
 * Baca nama hari dari judul kolom/baris: "AHAD (MALAM SENIN)" → 0, "Senin:" → 1,
 * "Malam Minggu" → 6 (malamnya hari Sabtu). Null kalau bukan judul hari.
 */
export function parseDayHeading(text: string): number | null {
  const plain = text
    .replace(/\([^)]*\)/g, " ")
    .toUpperCase()
    .replace(/JUM'?A'?T/g, "JUMAT")
    .replace(/[^A-Z ]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const night = plain.match(/^MALAM ([A-Z]+)$/);
  if (night) {
    const day = DAY_WORDS[night[1]];
    return day === undefined ? null : (day + 6) % 7;
  }
  const day = DAY_WORDS[plain];
  return day === undefined ? null : day;
}

/** "BU ROS" → "Bu Ros", "ARIF/WARIS" → "Arif/Waris". */
export function titleCaseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s/\-.'])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

// "YUSUF (AD-3)", "(AB-1)", "1. Arif/Waris (AE 2)"
const ENTRY_PATTERN = /([^()\t,;]*?)\s*\(\s*([A-Za-z]{1,3})\s*[-–.\s]?\s*(\d{1,3}[A-Za-z]?)\s*\)/g;

function parseEntries(text: string): Omit<ScheduleEntry, "day" | "position">[] {
  const result: Omit<ScheduleEntry, "day" | "position">[] = [];
  for (const match of text.matchAll(ENTRY_PATTERN)) {
    const name = match[1]
      .replace(/^[\s\-•*]*\d*[.)]?\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    result.push({
      name: name ? titleCaseName(name) : null,
      block: match[2].toUpperCase(),
      number: match[3].toUpperCase(),
    });
  }
  return result;
}

/** Tabel hasil salin dari Excel/Google Sheets (dipisah tab; sel bisa diapit tanda kutip). */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/**
 * Baca jadwal dari teks. Dua bentuk yang diterima:
 * 1. Tabel disalin dari spreadsheet: baris judul berisi nama hari, tiap kolom satu malam.
 * 2. Teks per hari: baris judul hari ("Ahad (malam Senin)" atau "Senin:"), lalu "Nama (BLOK-NO)"
 *    di baris yang sama atau baris-baris berikutnya.
 */
export function parseSchedule(text: string): { entries: ScheduleEntry[]; warnings: string[] } {
  const entries: ScheduleEntry[] = [];
  const warnings: string[] = [];
  const counts = new Array(7).fill(0);
  const add = (day: number, items: Omit<ScheduleEntry, "day" | "position">[], cell?: ScheduleEntry["cell"]) => {
    for (const item of items) entries.push({ ...item, day, position: counts[day]++, ...(cell && { cell }) });
  };

  if (text.includes("\t")) {
    const rows = parseTsv(text);
    const headerIndex = rows.findIndex((r) => r.filter((c) => parseDayHeading(c) !== null).length >= 2);
    if (headerIndex !== -1) {
      const columnDays = rows[headerIndex].map(parseDayHeading);
      rows.forEach((row, rowIndex) => {
        if (rowIndex <= headerIndex) return;
        row.forEach((cell, col) => {
          const day = columnDays[col];
          if (day != null) add(day, parseEntries(cell), { row: rowIndex, col });
        });
      });
      return { entries, warnings };
    }
  }

  let day: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    // "Senin: Nino (AB-3), ..." atau judul hari sendirian. Baris berisi kode rumah tanpa titik dua
    // bukan judul, meski namanya kebetulan nama hari ("Kamis (AB-2)").
    const colon = line.indexOf(":");
    const afterColon = colon === -1 ? "" : line.slice(colon + 1);
    const items = parseEntries(line);
    const headingDay =
      colon !== -1 ? parseDayHeading(line.slice(0, colon)) : items.length === 0 ? parseDayHeading(line) : null;
    if (headingDay !== null) {
      day = headingDay;
      add(day, parseEntries(afterColon));
      continue;
    }
    if (items.length === 0) continue;
    if (day === null) {
      warnings.push(`Baris tanpa judul hari dilewati: "${line.trim().slice(0, 60)}"`);
      continue;
    }
    add(day, items);
  }
  return { entries, warnings };
}

/** Rangkuman nama per rumah dari jadwal (tanpa menyimpan apa pun). */
export function analyzeSchedule(entries: ScheduleEntry[], knownKeys: Set<string>) {
  const names = new Map<string, Map<string, string>>();
  for (const e of entries) {
    if (!e.name) continue;
    const key = lotKey(e.block, e.number);
    const byLower = names.get(key) ?? new Map<string, string>();
    byLower.set(e.name.toLowerCase(), e.name);
    names.set(key, byLower);
  }
  const keys = [...new Set(entries.map((e) => lotKey(e.block, e.number)))];
  const unknown = keys.filter((k) => !knownKeys.has(k)).sort();
  const conflicting = [...names]
    .filter(([, set]) => set.size > 1)
    .map(([key, set]) => `${key} (${[...set.values()].join(", ")})`)
    .sort();
  const uniqueNames = new Map(
    [...names].filter(([, set]) => set.size === 1).map(([key, set]) => [key, [...set.values()][0]]),
  );
  return { unknown, conflicting, uniqueNames };
}

/** Kode rumah di jadwal ("AD-3"), atau "" untuk petugas tanpa rumah. */
export function slotHouseLabel(slot: { block: string; number: string }): string {
  return slot.block ? lotKey(slot.block, slot.number) : "";
}

/**
 * Nama tampilan petugas di jadwal. Akun dengan nama kembar dibedakan rumahnya ("Wawan (AD-5)");
 * di jadwal rumahnya sudah tertulis, jadi akhiran itu dibuang.
 */
export function guardName(name: string | null, slot: { block: string; number: string }): string | null {
  if (!name) return null;
  const suffix = ` (${slotHouseLabel(slot)})`;
  return slot.block && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

/** Akun petugas untuk nama di jadwal: nama sama persis, atau "Nama (BLOK-NO)" untuk nama kembar. */
export function matchGuardAccount<U extends { id: number; name: string }>(
  accounts: U[],
  slot: { name: string | null; block: string; number: string },
): U | undefined {
  if (!slot.name) return undefined;
  const plain = slot.name.toLowerCase();
  const withHouse = `${plain} (${slotHouseLabel(slot).toLowerCase()})`;
  return accounts.find((a) => a.name.toLowerCase() === withHouse) ?? accounts.find((a) => a.name.toLowerCase() === plain);
}
