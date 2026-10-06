/**
 * Apps Script untuk spreadsheet rekap jimpitan dari link Google Sheets Natura.
 *
 * Pasang: di spreadsheet buka Ekstensi → Apps Script, ganti isi editornya dengan kode ini, lalu simpan.
 * Pilih fungsinya di sebelah tombol Jalankan, lalu tekan Jalankan. Pertama kali, Google meminta izin.
 *
 * - `rapikanRekap`: warna dan format untuk lembar yang sedang dibuka. Cukup sekali per lembar: format
 *   sel tetap ada saat IMPORTDATA memperbarui isinya.
 * - `pasangArsipBulanan`: jalankan sekali. Tiap pagi skrip memeriksa apakah bulan sudah berganti; kalau
 *   ya, lembar bulan berjalan disalin menjadi tab arsip bulan yang baru lewat (mis. "Oktober 2026")
 *   dengan rumus `?bulan=` untuk bulan itu, jadi isinya tetap ada dan ikut koreksi admin.
 *
 * Tata letaknya mengikuti CSV dari Natura (`buildSheetsCsv` di src/lib/recap-csv.ts): baris 1 judul,
 * baris 2 kepala kolom, baris 3 total, rumah mulai baris 4; kolom A–G rumah dan ringkasan, kolom H
 * dan seterusnya satu kolom per malam ronda. Rumus IMPORTDATA ada di A1.
 *
 * `@OnlyCurrentDoc` membatasi izinnya ke spreadsheet ini saja, bukan semua spreadsheet di Drive.
 */

/** @OnlyCurrentDoc */

const FIRST_NIGHT = 8; // kolom H
const COLUMNS = FIRST_NIGHT - 1 + 31;
const TIME_ZONE = "Asia/Jakarta";
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** Rumus di A1: link Natura, dengan `?bulan=YYYY-MM` untuk tab arsip. */
const IMPORT_FORMULA = /IMPORTDATA\("([^"?]+)(?:\?bulan=(\d{4}-\d{2}))?"\)/i;
/** Bulan terakhir yang sudah dibuatkan tab arsip (disimpan di spreadsheet ini). */
const LAST_ARCHIVED = "arsipTerakhir";

function rapikanRekap() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const nights = COLUMNS - FIRST_NIGHT + 1;
  // Tempat untuk 31 malam, supaya bulan yang panjang tidak terpotong.
  if (sheet.getMaxColumns() < COLUMNS) sheet.insertColumnsAfter(sheet.getMaxColumns(), COLUMNS - sheet.getMaxColumns());
  const rows = sheet.getMaxRows();

  sheet.getRange(1, 1).setFontSize(14).setFontWeight("bold");
  sheet.getRange(2, 1, 2, COLUMNS).setFontWeight("bold").setBackground("#e2e8f0");
  sheet.getRange(3, 1, 1, COLUMNS).setBackground("#f1f5f9");
  sheet.getRange(4, 4, rows - 3, 1).setFontWeight("bold"); // Total per rumah
  sheet.getRange(2, 4, rows - 1, COLUMNS - 3).setNumberFormat("#,##0");
  sheet.getRange(2, FIRST_NIGHT, rows - 1, nights).setHorizontalAlignment("center");
  // Rumah dan ringkasannya tetap terlihat saat malam-malamnya digulir. Kolom A–G sekaligus, karena
  // judul di A1 terpotong di batas kolom yang dibekukan.
  sheet.setFrozenRows(3);
  sheet.setFrozenColumns(FIRST_NIGHT - 1);
  [48, 48, 64, 84, 48, 60, 84].forEach((width, i) => sheet.setColumnWidth(i + 1, width));
  sheet.setColumnWidths(FIRST_NIGHT, nights, 52);

  const night = sheet.getRange(4, FIRST_NIGHT, rows - 3, nights);
  const house = sheet.getRange(4, 1, rows - 3, FIRST_NIGHT - 1);
  // Mengganti semua aturan format bersyarat di lembar ini. Warnanya sama dengan file Excel dari Natura.
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("kosong").setFontColor("#be123c").setBackground("#ffe4e6").setRanges([night]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor("#15803d").setBackground("#dcfce7").setRanges([night]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C4="Mudik"').setFontColor("#94a3b8").setRanges([house]).build(),
  ]);
}

/** Pasang (atau pasang ulang) pemeriksaan harian. Arsip pertama: bulan ini, dibuat saat bulan berganti. */
function pasangArsipBulanan() {
  currentSheet(); // berhenti dengan pesan yang jelas kalau lembar bulan berjalan belum ada
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === "arsipkanBulan") ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger("arsipkanBulan").timeBased().everyDays(1).atHour(7).inTimezone(TIME_ZONE).create();
  PropertiesService.getDocumentProperties().setProperty(LAST_ARCHIVED, shiftMonth(thisMonth(), -1));
}

/**
 * Dijalankan tiap pagi. Membuat tab arsip untuk bulan yang sudah lewat (juga yang terlewat kalau
 * pemeriksaan sempat gagal), tepat di kanan lembar bulan berjalan. Tab arsip yang dihapus tidak dibuat
 * lagi. Kalau link di lembar bulan berjalan diganti (link baru dari Natura), tab arsip ikut memakainya.
 */
function arsipkanBulan() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const { sheet: current, link } = currentSheet();
  const props = PropertiesService.getDocumentProperties();
  const lastMonth = shiftMonth(thisMonth(), -1);
  let month = props.getProperty(LAST_ARCHIVED);
  if (!month) return; // pasangArsipBulanan belum dijalankan

  while (month < lastMonth) {
    month = shiftMonth(month, 1);
    const name = monthName(month);
    if (!spreadsheet.getSheetByName(name)) {
      // Salinan lembar bulan berjalan: warna, lebar kolom, dan bagian yang dibekukan ikut tersalin.
      const archive = spreadsheet.insertSheet(name, current.getIndex(), { template: current });
      archive.getRange("A1").setFormula(`=IMPORTDATA("${link}?bulan=${month}")`);
    }
    props.setProperty(LAST_ARCHIVED, month);
  }

  for (const sheet of spreadsheet.getSheets()) {
    const match = sheet.getRange("A1").getFormula().match(IMPORT_FORMULA);
    if (match && match[2] && match[1] !== link) sheet.getRange("A1").setFormula(`=IMPORTDATA("${link}?bulan=${match[2]}")`);
  }
}

/** Lembar bulan berjalan: rumus IMPORTDATA di A1 tanpa `?bulan=`. */
function currentSheet() {
  for (const sheet of SpreadsheetApp.getActiveSpreadsheet().getSheets()) {
    const match = sheet.getRange("A1").getFormula().match(IMPORT_FORMULA);
    if (match && !match[2]) return { sheet, link: match[1] };
  }
  throw new Error("Tidak ada lembar bulan berjalan: tempel rumus IMPORTDATA dari Natura (pilihan \"Selalu bulan berjalan\") di A1 salah satu lembar.");
}

function thisMonth() {
  return Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM");
}

function shiftMonth(month, delta) {
  const [year, m] = month.split("-").map(Number);
  return Utilities.formatDate(new Date(Date.UTC(year, m - 1 + delta, 1)), "UTC", "yyyy-MM");
}

/** "2026-10" → "Oktober 2026" (nama tab arsip). */
function monthName(month) {
  return `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
}
