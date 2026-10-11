import { jsPDF } from "jspdf";
import { autoTable, type Table } from "jspdf-autotable";
import type { RecapReport, ReportTable } from "./recap-report";

/** PDF A4 dengan tabel yang berlanjut antarhalaman dan header kolom berulang. */
export function buildRecapPdf(report: RecapReport): Blob {
  const pdf = new jsPDF({ format: "a4", unit: "mm", compress: true });
  pdf.setProperties({ title: `${report.title} ${report.monthLabel}`, author: report.communityName, subject: "Rekap bulanan jimpitan" });
  const margin = 18;
  const width = 174;
  let y = 23;

  function ensureSpace(height: number) {
    if (y + height > 273) { pdf.addPage(); y = 25; }
  }
  function text(value: string, size = 10, bold = false, color = "#17212B") {
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(color);
    const lines: string[] = pdf.splitTextToSize(value, width);
    const lineHeight = size * 0.45;
    for (const line of lines) {
      ensureSpace(lineHeight); pdf.text(line, margin, y); y += lineHeight;
    }
    y += 3;
  }
  function table(data: ReportTable) {
    autoTable(pdf, {
      startY: y, head: [data.columns.map((c) => c.label)], body: data.rows, foot: data.total ? [data.total] : [],
      showFoot: "lastPage", rowPageBreak: "avoid", margin: { top: 25, right: margin, bottom: 20, left: margin }, tableWidth: width,
      styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 2.5, right: 2.5 }, overflow: "linebreak", valign: "middle", lineColor: "#D9D9D9", lineWidth: 0.15, textColor: "#17212B" },
      headStyles: { fillColor: "#243746", textColor: "#FFFFFF", fontStyle: "bold" },
      footStyles: { fillColor: "#E8EEF2", textColor: "#17212B", fontStyle: "bold" },
      alternateRowStyles: { fillColor: "#F5F7F9" },
      columnStyles: Object.fromEntries(data.columns.map((c, i) => [i, { cellWidth: width * c.width / 100, halign: c.numeric ? "right" : "left" }])),
      didParseCell: ({ cell, column }) => { cell.styles.halign = data.columns[column.index].numeric ? "right" : "left"; },
    });
    y = (pdf as jsPDF & { lastAutoTable: Table }).lastAutoTable.finalY! + 9;
  }
  text(report.title, 21, true, "#000000");
  text(`${report.communityName}\n${report.monthLabel}`, 12, true, "#000000");
  text(report.generatedLabel, 9, false, "#586574");
  text(report.introduction);
  table({ title: "", columns: [{ label: "Ringkasan", width: 65 }, { label: "Nilai", width: 35, numeric: true }], rows: report.metrics.map((m) => [m.label, m.value]), empty: "" });
  text(report.note, 9, false, "#586574");
  for (const data of report.tables) {
    if (data.pageBreak && data.rows.length) { pdf.addPage(); y = 25; }
    ensureSpace(40);
    text(data.title, 13, true, "#000000");
    if (data.description) text(data.description, 9, false, "#586574");
    if (data.rows.length) table(data); else text(data.empty);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor("#586574");
    if (page > 1) pdf.text(`Laporan jimpitan | ${report.monthLabel}`, margin, 14);
    pdf.text(`Halaman ${page} dari ${pages}`, 192, 286, { align: "right" });
  }
  return pdf.output("blob");
}
