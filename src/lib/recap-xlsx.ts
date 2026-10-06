import { formatDateLong, formatMonth } from "./dates";
import { summarizeMonth } from "./month-summary";
import type { MonthRecap } from "./types";

/** Isi sel xlsx (sama dengan bentuk sel `write-excel-file`, tanpa perlu memuat pustakanya). */
type XlsxCell = {
  value?: string | number;
  type?: StringConstructor | NumberConstructor;
  format?: string;
  fontWeight?: "bold";
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
  columnSpan?: number;
} | null;

export type XlsxSheet = {
  sheet: string;
  data: XlsxCell[][];
  columns: { width: number }[];
  stickyRowsCount?: number;
  stickyColumnsCount?: number;
};

const RUPIAH = "#,##0";
const FILLED = { textColor: "#15803d", backgroundColor: "#dcfce7" };
const EMPTY = { textColor: "#be123c", backgroundColor: "#ffe4e6" };
const HEADER = { fontWeight: "bold", backgroundColor: "#e2e8f0" } as const;

const text = (value: string, style: Omit<NonNullable<XlsxCell>, "value" | "type"> = {}): XlsxCell => ({ value, type: String, ...style });
const num = (value: number, style: Omit<NonNullable<XlsxCell>, "value" | "type"> = {}): XlsxCell => ({ value, type: Number, ...style });

/**
 * Rekap bulanan sebagai dua lembar Excel: per rumah (nominal tiap malam, berwarna seperti di
 * dashboard) dan per malam. Hanya menyusun data; file dibuat oleh `write-excel-file` di browser.
 */
export function buildRecapSheets(recap: MonthRecap, communityName: string): XlsxSheet[] {
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);
  const month = recap.dates[0]?.slice(0, 7);
  const title = `Rekap jimpitan ${communityName}${month ? ` · ${formatMonth(month)}` : ""}`;
  const dateCount = recap.dates.length;
  const lead = 4; // Blok, No, Nama KK, Status
  const tail = 4; // Ada, Kosong, Tidak dicek, Total

  let emptyTotal = 0;
  let uncheckedTotal = 0;
  const houseRows = rows.map(({ house, cells, filledCount, total }) => {
    const empty = cells.filter((c) => c?.status === "empty").length;
    const unchecked = house.status === "active" ? cells.filter((c) => !c).length : 0;
    emptyTotal += empty;
    uncheckedTotal += unchecked;
    return [
      text(house.block),
      text(house.number),
      text(house.ownerName ?? ""),
      text(house.status === "vacant" ? "Mudik" : "Dihuni"),
      ...cells.map((c) =>
        c?.status === "filled"
          ? num(c.amount, { format: RUPIAH, ...FILLED })
          : c?.status === "empty"
            ? text("kosong", { align: "center", ...EMPTY })
            : null,
      ),
      num(filledCount),
      num(empty),
      num(unchecked),
      num(total, { format: RUPIAH, fontWeight: "bold" }),
    ];
  });

  const perHouse: XlsxSheet = {
    sheet: "Per rumah",
    data: [
      [text(title, { fontWeight: "bold", fontSize: 14, columnSpan: lead + dateCount + tail })],
      [text("Angka = nominal jimpitan; \"kosong\" = wadah kosong; sel kosong = rumah itu tidak dicek malam itu.", { columnSpan: lead + dateCount + tail })],
      [
        ...["Blok", "No", "Nama KK", "Status"].map((h) => text(h, HEADER)),
        ...recap.dates.map((d) => text(String(Number(d.slice(8))), { ...HEADER, align: "center" })),
        ...["Ada", "Kosong", "Tidak dicek", "Total (Rp)"].map((h) => text(h, { ...HEADER, align: "right" })),
      ],
      ...houseRows,
      [
        text("Total", { fontWeight: "bold" }),
        null,
        null,
        null,
        ...dateTotals.map((t) => num(t, { format: RUPIAH, fontWeight: "bold" })),
        num(rows.reduce((sum, r) => sum + r.filledCount, 0), { fontWeight: "bold" }),
        num(emptyTotal, { fontWeight: "bold" }),
        num(uncheckedTotal, { fontWeight: "bold" }),
        num(grandTotal, { format: RUPIAH, fontWeight: "bold" }),
      ],
    ],
    columns: [{ width: 6 }, { width: 6 }, { width: 24 }, { width: 9 }, ...recap.dates.map(() => ({ width: 7 })), { width: 6 }, { width: 8 }, { width: 11 }, { width: 13 }],
    stickyRowsCount: 3,
    stickyColumnsCount: 3,
  };

  const perNight: XlsxSheet = {
    sheet: "Per malam",
    data: [
      [text(title, { fontWeight: "bold", fontSize: 14, columnSpan: 5 })],
      [],
      ["Malam", "Ada isinya", "Kosong", "Tidak dicek", "Total (Rp)"].map((h, i) => text(h, { ...HEADER, align: i ? "right" : "left" })),
      ...recap.dates.map((date, i) => {
        const active = rows.filter((r) => r.house.status === "active");
        const filled = rows.filter((r) => r.cells[i]?.status === "filled").length;
        const empty = active.filter((r) => r.cells[i]?.status === "empty").length;
        const unchecked = active.filter((r) => !r.cells[i]).length;
        return [text(formatDateLong(date)), num(filled), num(empty), num(unchecked), num(dateTotals[i], { format: RUPIAH })];
      }),
      [text("Total", { fontWeight: "bold" }), null, null, null, num(grandTotal, { format: RUPIAH, fontWeight: "bold" })],
    ],
    columns: [{ width: 28 }, { width: 11 }, { width: 9 }, { width: 12 }, { width: 13 }],
    stickyRowsCount: 3,
  };

  return [perHouse, perNight];
}
