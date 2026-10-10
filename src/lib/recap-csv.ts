import { formatMonth } from "./dates";
import { monthHouseStatusLabel, summarizeMonth } from "./month-summary";
import type { MonthRecap } from "./types";

function csvCell(value: string | number): string {
  const text = String(value);
  // Cegah formula injection saat dibuka di Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const toCsv = (lines: (string | number)[][]) => lines.map((row) => row.map(csvCell).join(",")).join("\r\n");

/**
 * Rekap bulanan sebagai CSV (bisa dibuka di Excel / Google Sheets). Tanpa BOM; file unduhan
 * menambahkannya sendiri supaya Excel membaca UTF-8.
 */
export function buildRecapCsv(recap: MonthRecap): string {
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);
  return toCsv([
    ["Blok", "No", "Nama KK", ...recap.dates, "Jumlah Ada", "Harian (Rp)", "Mingguan (Rp)", "Bulanan (Rp)", "Total (Rp)"],
    ...rows.map(({ house, cells, filledCount, total, collectedTotal, monthlyTotal, weeklyTotal }) => [
      house.block,
      house.number,
      house.ownerName ?? "",
      // Angka = nominal, K = kosong, kosong = belum dicek.
      ...cells.map((c) => (c?.status === "filled" ? c.amount : c?.status === "empty" ? "K" : "")),
      filledCount,
      collectedTotal,
      weeklyTotal,
      monthlyTotal,
      total,
    ]),
    ["", "", "Total", ...dateTotals, "", rows.reduce((sum, r) => sum + r.collectedTotal, 0), rows.reduce((sum, r) => sum + r.weeklyTotal, 0), rows.reduce((sum, r) => sum + r.monthlyTotal, 0), grandTotal],
  ]);
}

/**
 * Rekap bulanan untuk link Google Sheets (`=IMPORTDATA(...)`), tanpa nama warga. Posisinya tetap
 * supaya format yang dipasang sekali di Sheet tidak bergeser (lihat scripts/google-sheets.gs):
 * baris 1 judul, baris 2 kepala kolom, rumah mulai baris 3, total di paling bawah; kolom A–G rumah dan
 * ringkasan, kolom H dan seterusnya satu kolom per malam ronda (kepalanya angka tanggal; tanggal
 * lengkap akan diubah Sheets menjadi nomor seri).
 */
export function buildSheetsCsv(recap: MonthRecap, month: string, communityName: string): string {
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);
  let filledTotal = 0;
  let emptyTotal = 0;
  let uncheckedTotal = 0;
  const houseLines = rows.map(({ house, nights, filledCount, empty, unchecked, total, collectedTotal, monthlyTotal, weeklyTotal }) => {
    filledTotal += filledCount;
    emptyTotal += empty;
    uncheckedTotal += unchecked;
    return [
      house.block,
      house.number,
      monthHouseStatusLabel(recap, house),
      total,
      filledCount,
      empty,
      unchecked,
      // Catatan isi didahulukan seperti di dashboard, termasuk selama periode belum lunas.
      // Penanda periode dipakai aturan warna di Sheets; bukan penerimaan harian baru.
      ...nights.map(({ cell, period }) => cell?.status === "filled" ? cell.amount
        : period?.cadence === "monthly" ? period.status === "paid" ? "Lunas" : "Belum"
          : cell?.status === "empty" ? "kosong" : ""),
      monthlyTotal,
      weeklyTotal,
      collectedTotal,
    ];
  });
  return toCsv([
    [`Rekap jimpitan ${communityName} · ${formatMonth(month)}`],
    ["Blok", "No", "Status", "Total (Rp)", "Ada", "Kosong", "Tidak dicek", ...recap.dates.map((d) => Number(d.slice(8))), "Bulanan (Rp)", "Mingguan (Rp)", "Harian (Rp)"],
    ...houseLines,
    ["Total", "", "", grandTotal, filledTotal, emptyTotal, uncheckedTotal, ...dateTotals, rows.reduce((sum, r) => sum + r.monthlyTotal, 0), rows.reduce((sum, r) => sum + r.weeklyTotal, 0), rows.reduce((sum, r) => sum + r.collectedTotal, 0)],
  ]);
}
