/**
 * Merapikan tampilan rekap jimpitan dari link Google Sheets Natura. Cukup sekali per lembar: format
 * sel tetap ada saat IMPORTDATA memperbarui isinya. Aman dijalankan ulang.
 *
 * Di spreadsheet: Ekstensi → Apps Script, ganti isi editornya dengan kode ini, simpan, lalu tekan
 * Jalankan (fungsi `rapikanRekap`). Pertama kali, Google meminta izin untuk spreadsheet ini.
 * Format dipasang di lembar yang sedang dibuka; untuk lembar lain, buka lembarnya lalu jalankan lagi.
 *
 * Tata letaknya mengikuti CSV dari Natura (`buildSheetsCsv` di src/lib/recap-csv.ts): baris 1 judul,
 * baris 2 kepala kolom, baris 3 total, rumah mulai baris 4; kolom A–G rumah dan ringkasan, kolom H
 * dan seterusnya satu kolom per malam ronda.
 *
 * `@OnlyCurrentDoc` membatasi izinnya ke spreadsheet ini saja, bukan semua spreadsheet di Drive.
 */

/** @OnlyCurrentDoc */

function rapikanRekap() {
  const FIRST_NIGHT = 8; // kolom H
  const COLUMNS = FIRST_NIGHT - 1 + 31;
  const nights = COLUMNS - FIRST_NIGHT + 1;
  const sheet = SpreadsheetApp.getActiveSheet();
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
