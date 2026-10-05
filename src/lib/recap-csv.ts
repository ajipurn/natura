import { summarizeMonth } from "./month-summary";
import type { MonthRecap } from "./types";

function csvCell(value: string | number): string {
  const text = String(value);
  // Cegah formula injection saat dibuka di Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rekap bulanan sebagai CSV (bisa dibuka di Excel / Google Sheets). */
export function buildRecapCsv(recap: MonthRecap): string {
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);
  const lines: (string | number)[][] = [
    ["Blok", "No", "Nama KK", ...recap.dates, "Jumlah Ada", "Total (Rp)"],
    ...rows.map(({ house, cells, filledCount, total }) => [
      house.block,
      house.number,
      house.ownerName ?? "",
      // Angka = nominal, K = kosong, kosong = belum dicek.
      ...cells.map((c) => (c?.status === "filled" ? c.amount : c?.status === "empty" ? "K" : "")),
      filledCount,
      total,
    ]),
    ["", "", "Total", ...dateTotals, "", grandTotal],
  ];
  // BOM supaya Excel membaca UTF-8.
  return "\uFEFF" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
