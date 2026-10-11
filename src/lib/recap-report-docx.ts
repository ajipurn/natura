import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber,
  Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import type { RecapReport, ReportTable } from "./recap-report";

const WIDTH = 9638; // A4 dengan margin 20 mm.
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
  function row(values: string[], kind: "header" | "body" | "total", index = 0) {
    return new TableRow({
      tableHeader: kind === "header", cantSplit: true,
      children: values.map((value, i) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        shading: { fill: kind === "header" ? "243746" : kind === "total" ? "E8EEF2" : index % 2 ? "F5F7F9" : "FFFFFF" },
        margins: { top: 70, bottom: 70, left: 110, right: 110 },
        children: value.split("\n").map((line) => new Paragraph({
          alignment: table.columns[i].numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { before: 0, after: 0, line: 220 },
          children: [new TextRun({ text: line, size: 19, bold: kind !== "body", color: kind === "header" ? "FFFFFF" : "17212B" })],
        })),
      })),
    });
  }
  return new Table({
    width: { size: WIDTH, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders,
    rows: [row(table.columns.map((c) => c.label), "header"), ...table.rows.map((r, i) => row(r, "body", i)), ...(table.total ? [row(table.total, "total")] : [])],
  });
}

/** DOCX dengan teks dan tabel yang tetap dapat diedit di Word. */
export async function buildRecapDocx(report: RecapReport): Promise<Blob> {
  const summary: ReportTable = {
    title: "Ringkasan", columns: [{ label: "Ringkasan", width: 65 }, { label: "Nilai", width: 35, numeric: true }],
    rows: report.metrics.map((m) => [m.label, m.value]), empty: "",
  };
  const document = new Document({
    creator: "Cluster Natura", title: `${report.title} ${report.monthLabel}`, description: `Rekap jimpitan ${report.communityName}`,
    styles: {
      default: { document: { run: { font: "Arial", size: 21, color: "17212B" }, paragraph: { spacing: { after: 140, line: 280 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 44, bold: true, color: "000000" }, paragraph: { spacing: { after: 160 }, keepNext: true } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 28, bold: true, color: "000000" }, paragraph: { keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, footer: 567 } } },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: `${report.monthLabel} | Halaman `, size: 17, color: "586574" }), new TextRun({ children: [PageNumber.CURRENT], size: 17 }), new TextRun({ text: " dari ", size: 17 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17 })],
      })] }) },
      children: [
        new Paragraph({ text: report.title, style: "Title" }),
        new Paragraph({ children: [new TextRun({ text: report.communityName, size: 25, bold: true, color: "000000" })], spacing: { after: 60 } }),
        new Paragraph({ children: [new TextRun({ text: report.monthLabel, size: 25, bold: true, color: "000000" })], spacing: { after: 160 } }),
        new Paragraph({ children: [new TextRun({ text: report.generatedLabel, size: 18, color: "586574" })], spacing: { after: 240 } }),
        paragraph(report.introduction), reportTable(summary), new Paragraph({ spacing: { after: 60 } }), paragraph(report.note),
        ...report.tables.flatMap((table) => [
          paragraph(table.title, { heading: true, pageBreak: table.pageBreak && table.rows.length > 0 }),
          ...(table.description ? [paragraph(table.description)] : []),
          ...(table.rows.length ? [reportTable(table)] : [paragraph(table.empty)]),
        ]),
      ],
    }],
  });
  return Packer.toBlob(document);
}
