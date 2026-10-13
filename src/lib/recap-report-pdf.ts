import { jsPDF } from "jspdf";
import { autoTable, type Table } from "jspdf-autotable";
import { reportAttachments, reportIncomeTable, type RecapReport, type ReportImage, type ReportTable } from "./recap-report";

/** PDF A4 dengan tabel yang berlanjut antarhalaman dan header kolom berulang. */
export function buildRecapPdf(report: RecapReport): Blob {
  const pdf = new jsPDF({ format: "a4", unit: "mm", compress: true });
  pdf.setProperties({ title: `${report.title} ${report.monthLabel}`, author: report.communityName, subject: "Rekap bulanan jimpitan" });
  const margin = 25;
  const width = 160;
  let y = 26;

  function ensureSpace(height: number) {
    if (y + height > 273) { pdf.addPage(); y = 25; }
  }
  function text(value: string, size = 12, bold = false) {
    pdf.setFont("times", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor("#000000");
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
      styles: { font: "times", fontSize: 10, cellPadding: { top: 1.3, bottom: 1.3, left: 2, right: 2 }, overflow: "linebreak", valign: "middle", lineColor: "#D9D9D9", lineWidth: 0.2, textColor: "#000000" },
      headStyles: { fillColor: "#F2F2F2", textColor: "#000000", fontStyle: "bold" },
      footStyles: { fillColor: "#F2F2F2", textColor: "#000000", fontStyle: "bold" },
      alternateRowStyles: { fillColor: "#FFFFFF" },
      columnStyles: Object.fromEntries(data.columns.map((c, i) => [i, { cellWidth: width * c.width / 100, halign: c.numeric ? "right" : "left" }])),
      didParseCell: ({ cell, column }) => { cell.styles.halign = data.columns[column.index].numeric ? "right" : "left"; },
    });
    y = (pdf as jsPDF & { lastAutoTable: Table }).lastAutoTable.finalY! + 6;
  }
  function centered(value: string, size: number, bold = false, start = margin, available = width, after = 0) {
    pdf.setFont("times", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor("#000000");
    const lines: string[] = pdf.splitTextToSize(value, available);
    for (const line of lines) { pdf.text(line, start + available / 2, y, { align: "center" }); y += size * 0.4; }
    y += after;
  }
  function image(value: ReportImage, centerX: number, top: number, maxWidth: number, maxHeight: number) {
    const scale = Math.min(maxWidth / value.width, maxHeight / value.height);
    const w = value.width * scale, h = value.height * scale;
    pdf.addImage(value.dataUrl, "PNG", centerX - w / 2, top, w, h);
  }
  const kopTop = y - 5;
  const logo = report.letterhead.logo;
  // Ruang logo diimbangi di kanan supaya pusat teks tetap di tengah halaman.
  const kopInset = logo ? 23 : 0;
  centered(report.letterhead.organization.toUpperCase(), 14, true, margin + kopInset, width - kopInset * 2);
  y += 1.5;
  centered(report.title.toUpperCase(), 11, true);
  centered(`Periode ${report.monthLabel}`, 10);
  if (report.letterhead.address) centered(report.letterhead.address, 10, false, margin + kopInset, width - kopInset * 2);
  if (logo) {
    const height = logo.height * Math.min(18 / logo.width, 16 / logo.height);
    image(logo, margin + 9, (kopTop + y - height) / 2, 18, 16);
  }
  y = Math.max(y + 2, kopTop + (logo ? 20 : 15));
  pdf.setDrawColor("#000000"); pdf.setLineWidth(0.6); pdf.line(margin, y, margin + width, y);
  pdf.setLineWidth(0.2); pdf.line(margin, y + 1, margin + width, y + 1);
  y += 10;
  text(report.introduction);
  y += 2;
  for (const metric of report.metrics.filter((value) => value.label !== "Total jimpitan")) {
    pdf.text(metric.label, margin, y);
    pdf.text(`: ${metric.value}${metric.label === "Malam ronda tercatat" ? " malam" : metric.label === "Rumah terdaftar" ? " rumah" : ""}`, margin + 57, y);
    y += 6.5;
  }
  y += 5;
  const income = reportIncomeTable(report);
  text(income.title, 12, true);
  table(income);
  pdf.setFont("times", "italic"); pdf.setFontSize(10);
  const noteLines: string[] = pdf.splitTextToSize(report.note, width);
  for (const line of noteLines) { pdf.text(line, margin, y); y += 4.5; }
  y += 5;
  const attachments = reportAttachments(report);
  text(`Demikian laporan ini disusun sebagai bentuk pertanggungjawaban pengelolaan jimpitan.${attachments.length ? " Rincian per blok, malam ronda, rumah, dan pembayaran warga disajikan dalam lampiran." : ""}`);
  // Tanggal, cap, ruang tanda tangan, dan nama selalu berada pada satu halaman.
  pdf.setFont("times", "normal"); pdf.setFontSize(12);
  const approval = report.approval;
  const dateLines: string[] = pdf.splitTextToSize(approval.dateLabel, 80);
  pdf.setFont("times", "bold");
  const nameLines: string[] = pdf.splitTextToSize(approval.chairName || "________________________", 80);
  ensureSpace(5 + dateLines.length * 5.4 + 2 + 38 + nameLines.length * 5.4);
  y += 5;
  const signatureCenter = margin + width * 0.75;
  const stampCenter = signatureCenter - 20;
  pdf.setFont("times", "normal"); pdf.setFontSize(12); pdf.setTextColor("#000000");
  for (const line of dateLines) { pdf.text(line, signatureCenter, y, { align: "center" }); y += 5.4; }
  y += 2;
  pdf.text("Ketua Paguyuban", signatureCenter, y, { align: "center" });
  if (approval.stamp) image(approval.stamp, stampCenter, y + 4, 32, 32);
  y += 38;
  pdf.setFont("times", "bold");
  for (const line of nameLines) { pdf.text(line, signatureCenter, y, { align: "center" }); y += 5.4; }
  if (approval.chairName) {
    const underlineWidth = Math.min(80, Math.max(...nameLines.map((line) => pdf.getTextWidth(line))));
    pdf.setLineWidth(0.2); pdf.line(signatureCenter - underlineWidth / 2, y - 3.8, signatureCenter + underlineWidth / 2, y - 3.8);
  }
  for (const data of attachments) {
    if (data.pageBreak) { pdf.addPage(); y = 25; }
    // Lampiran pendek (misalnya tagihan bulanan) tetap utuh jika muat pada halaman baru.
    pdf.setFont("times", "normal"); pdf.setFontSize(10);
    const rowHeight = (values: string[]) => Math.max(...values.map((value, i) => pdf.splitTextToSize(value, width * data.columns[i].width / 100 - 4).length)) * 4 + 2.6;
    const compactHeight = data.rows.reduce((sum, row) => sum + rowHeight(row), 0) + 9 + (data.total ? rowHeight(data.total) : 0);
    ensureSpace(data.rows.length <= 8 ? Math.min(200, compactHeight + 28) : 40);
    text(data.title, 12, true);
    if (data.description) text(data.description, 11);
    table(data);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont("times", "normal"); pdf.setFontSize(9); pdf.setTextColor("#000000");
    if (page > 1) pdf.text(`Lampiran laporan jimpitan ${report.monthLabel}`, margin, 14);
    pdf.text(`Halaman ${page} dari ${pages}`, margin + width, 286, { align: "right" });
  }
  return pdf.output("blob");
}
