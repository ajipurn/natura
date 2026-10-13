import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber,
  Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
  ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, TabStopType,
} from "docx";
import { reportAttachments, reportIncomeTable, type RecapReport, type ReportImage, type ReportTable } from "./recap-report";

const WIDTH = 9072; // A4 dengan margin kiri/kanan 25 mm.
const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

function paragraph(text: string, options: { heading?: boolean; pageBreak?: boolean } = {}) {
  return new Paragraph({
    text, heading: options.heading ? HeadingLevel.HEADING_1 : undefined,
    pageBreakBefore: options.pageBreak, spacing: { before: options.heading ? 240 : 0, after: 140 },
  });
}

function reportTable(table: ReportTable) {
  const widths = table.columns.map((c) => Math.round(WIDTH * c.width / 100));
  function row(values: string[], kind: "header" | "body" | "total") {
    return new TableRow({
      tableHeader: kind === "header", cantSplit: true,
      children: values.map((value, i) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        shading: { fill: kind === "body" ? "FFFFFF" : "F2F2F2" },
        margins: { top: 70, bottom: 70, left: 100, right: 100 },
        children: value.split("\n").map((line) => new Paragraph({
          alignment: table.columns[i].numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { before: 0, after: 0, line: 220 },
          children: [new TextRun({ text: line, size: 20, bold: kind !== "body", color: "000000" })],
        })),
      })),
    });
  }
  return new Table({
    width: { size: WIDTH, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders,
    rows: [row(table.columns.map((c) => c.label), "header"), ...table.rows.map((r) => row(r, "body")), ...(table.total ? [row(table.total, "total")] : [])],
  });
}

function floatingImage(image: ReportImage, maxWidth: number, maxHeight: number, offset = 0, description = "Logo paguyuban", topOffset = 0) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return new ImageRun({
    type: "png", data: image.dataUrl,
    transformation: { width: image.width * scale, height: image.height * scale },
    altText: { title: description, description, name: description },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, offset },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: topOffset },
      wrap: { type: TextWrappingType.NONE }, allowOverlap: true,
    },
  });
}

function letterhead(report: RecapReport) {
  const { organization, address, logo } = report.letterhead;
  // Margin yang sama di kedua sisi mempertahankan pusat kop terhadap halaman.
  const indent = logo ? { left: 1300, right: 1300 } : undefined;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, indent, keepNext: true,
      children: [...(logo ? [floatingImage(logo, 68, 52, 0, "Logo paguyuban", 133350)] : []), new TextRun({ text: organization.toUpperCase(), bold: true, size: 28, color: "000000" })],
      spacing: { after: 0, line: 320 },
    }),
    new Paragraph({ text: report.title.toUpperCase(), style: "Title", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 0, line: 260 } }),
    new Paragraph({ children: [new TextRun({ text: `Periode ${report.monthLabel}`, size: 20 })], alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 0, line: 240 } }),
    ...(address ? [new Paragraph({ alignment: AlignmentType.CENTER, indent, keepNext: true, children: [new TextRun({ text: address, size: 20 })], spacing: { after: 0, line: 240 } })] : []),
    new Paragraph({ text: "", keepNext: true, spacing: { before: 100, after: 240, line: 20 }, border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: "000000" } } }),
  ];
}

function approval(report: RecapReport) {
  const { dateLabel, chairName, stamp } = report.approval;
  const right = { alignment: AlignmentType.CENTER, indent: { left: WIDTH / 2 } };
  const stampScale = stamp ? Math.min(128 / stamp.width, 128 / stamp.height) : 0;
  return [
    new Paragraph({ text: dateLabel, ...right, keepNext: true, keepLines: true, spacing: { before: 320, after: 100 } }),
    new Paragraph({ text: "Ketua Paguyuban", ...right, keepNext: true, spacing: { after: 80 } }),
    new Paragraph({
      children: stamp ? [floatingImage(stamp, 128, 128, Math.round((WIDTH * 3 / 4 / 15 - 65 - stamp.width * stampScale / 2) * 9525), "Stempel resmi paguyuban")] : [],
      keepNext: true, spacing: { after: 1900, line: 220 },
    }),
    new Paragraph({ ...right, keepLines: true, children: [new TextRun({ text: chairName || "________________________", bold: true, underline: chairName ? {} : undefined })], spacing: { after: 120 } }),
  ];
}

/** DOCX dengan teks dan tabel yang tetap dapat diedit di Word. */
export async function buildRecapDocx(report: RecapReport): Promise<Blob> {
  const attachments = reportAttachments(report);
  const income = reportIncomeTable(report);
  const document = new Document({
    creator: "Cluster Natura", title: `${report.title} ${report.monthLabel}`, description: `Rekap jimpitan ${report.communityName}`,
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 24, color: "000000" }, paragraph: { spacing: { after: 160, line: 300 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 22, bold: true, color: "000000" }, paragraph: { spacing: { after: 0 }, keepNext: true } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 24, bold: true, color: "000000" }, paragraph: { keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1247, bottom: 1247, left: 1417, right: 1417, footer: 567 } } },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: `${report.monthLabel} | Halaman `, size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18 }), new TextRun({ text: " dari ", size: 18 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 })],
      })] }) },
      children: [
        ...letterhead(report),
        new Paragraph({ text: report.introduction, alignment: AlignmentType.JUSTIFIED, spacing: { after: 240 } }),
        ...report.metrics.filter((metric) => metric.label !== "Total jimpitan").map((metric) => new Paragraph({
          children: [new TextRun(`${metric.label}\t: ${metric.value}${metric.label === "Malam ronda tercatat" ? " malam" : metric.label === "Rumah terdaftar" ? " rumah" : ""}`)],
          tabStops: [{ type: TabStopType.LEFT, position: 2750 }], spacing: { after: 60 }, keepNext: true,
        })),
        paragraph(income.title, { heading: true }), reportTable(income),
        new Paragraph({ children: [new TextRun({ text: report.note, size: 20, italics: true })], spacing: { before: 120, after: 220 } }),
        new Paragraph({ text: `Demikian laporan ini disusun sebagai bentuk pertanggungjawaban pengelolaan jimpitan.${attachments.length ? " Rincian per blok, malam ronda, rumah, dan pembayaran warga disajikan dalam lampiran." : ""}`, alignment: AlignmentType.JUSTIFIED }),
        ...approval(report),
        ...attachments.flatMap((table) => [
          paragraph(table.title, { heading: true, pageBreak: table.pageBreak && table.rows.length > 0 }),
          ...(table.description ? [paragraph(table.description)] : []),
          ...(table.rows.length ? [reportTable(table)] : [paragraph(table.empty)]),
        ]),
      ],
    }],
  });
  return Packer.toBlob(document);
}
