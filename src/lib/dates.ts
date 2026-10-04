export const APP_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Jakarta";

/** Jam 00:00–11:59 masih dihitung ronda malam sebelumnya. */
const CUTOFF_HOURS = 12;

/** Tanggal lokal (YYYY-MM-DD) dari sebuah waktu di zona waktu tertentu. */
export function localDate(at: Date, timeZone = APP_TIMEZONE): string {
  // en-CA memformat tanggal sebagai YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Tanggal malam ronda untuk sebuah waktu. Lewat tengah malam tetap ikut malam sebelumnya. */
export function rondaDate(at: Date, timeZone = APP_TIMEZONE): string {
  return localDate(
    new Date(at.getTime() - CUTOFF_HOURS * 60 * 60 * 1000),
    timeZone,
  );
}

function parseIsoDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return parseIsoDate(value).toISOString().slice(0, 10) === value;
}

/** "Sabtu, 4 Oktober 2026" */
export function formatDateLong(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseIsoDate(isoDate));
}

/** "Sab, 4 Okt" */
export function formatDateShort(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parseIsoDate(isoDate));
}

/** "Oktober 2026" dari "2026-10" */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(parseIsoDate(`${month}-01`));
}

/** "22.15" dalam zona waktu aplikasi. */
export function formatTime(at: Date | string, timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof at === "string" ? new Date(at) : at);
}

export function addDays(isoDate: string, days: number): string {
  const d = parseIsoDate(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Semua tanggal (YYYY-MM-DD) dalam bulan "YYYY-MM". */
export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
