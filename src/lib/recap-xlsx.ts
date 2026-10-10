import { formatDateLong, formatMonth } from "./dates";
import { monthHouseStatusLabel, summarizeMonth } from "./month-summary";
import type { MonthRecap } from "./types";
import { CADENCE_LABEL } from "./payments";

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
 * Rekap bulanan sebagai tiga lembar Excel: per rumah, per malam, dan transaksi periode.
 * Hanya menyusun data; file dibuat oleh `write-excel-file` di browser.
 */
export function buildRecapSheets(recap: MonthRecap, communityName: string): XlsxSheet[] {
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);
  const month = recap.month ?? recap.dates[0]?.slice(0, 7);
  const title = `Rekap jimpitan ${communityName}${month ? ` · ${formatMonth(month)}` : ""}`;
  const dateCount = recap.dates.length;
  const lead = 4; // Blok, No, Nama KK, Status
  const tail = 7; // Ada, Kosong, Tidak dicek, Harian, Mingguan, Bulanan, Total

  let emptyTotal = 0;
  let uncheckedTotal = 0;
  const houseRows = rows.map(({ house, cells, filledCount, empty, unchecked, total, collectedTotal, monthlyTotal, weeklyTotal }) => {
    emptyTotal += empty;
    uncheckedTotal += unchecked;
    return [
      text(house.block),
      text(house.number),
      text(house.ownerName ?? ""),
      text(monthHouseStatusLabel(recap, house)),
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
      num(collectedTotal, { format: RUPIAH }),
      num(weeklyTotal, { format: RUPIAH }),
      num(monthlyTotal, { format: RUPIAH, textColor: "#1d4ed8", backgroundColor: "#dbeafe" }),
      num(total, { format: RUPIAH, fontWeight: "bold" }),
    ];
  });

  const perHouse: XlsxSheet = {
    sheet: "Per rumah",
    data: [
      [text(title, { fontWeight: "bold", fontSize: 14, columnSpan: lead + dateCount + tail })],
      [text("Tanggal dan Harian = hasil ronda. Mingguan dan Bulanan = pembayaran sesuai periode. Total = Harian + Mingguan + Bulanan.", { columnSpan: lead + dateCount + tail })],
      [
        ...["Blok", "No", "Nama KK", "Status"].map((h) => text(h, HEADER)),
        ...recap.dates.map((d) => text(String(Number(d.slice(8))), { ...HEADER, align: "center" })),
        ...["Ada", "Kosong", "Tidak dicek", "Harian (Rp)", "Mingguan (Rp)", "Bulanan (Rp)", "Total (Rp)"].map((h) => text(h, { ...HEADER, align: "right" })),
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
        num(rows.reduce((sum, r) => sum + r.collectedTotal, 0), { format: RUPIAH, fontWeight: "bold" }),
        num(rows.reduce((sum, r) => sum + r.weeklyTotal, 0), { format: RUPIAH, fontWeight: "bold" }),
        num(rows.reduce((sum, r) => sum + r.monthlyTotal, 0), { format: RUPIAH, fontWeight: "bold" }),
        num(grandTotal, { format: RUPIAH, fontWeight: "bold" }),
      ],
    ],
    columns: [{ width: 6 }, { width: 6 }, { width: 24 }, { width: 24 }, ...recap.dates.map(() => ({ width: 7 })), { width: 6 }, { width: 8 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }],
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
        const unchecked = active.filter((r) => !r.nights[i].cell && !r.nights[i].period).length;
        return [text(formatDateLong(date)), num(filled), num(empty), num(unchecked), num(dateTotals[i], { format: RUPIAH })];
      }),
      [text("Total hasil ronda", { fontWeight: "bold" }), null, null, null, num(dateTotals.reduce((sum, n) => sum + n, 0), { format: RUPIAH, fontWeight: "bold" })],
    ],
    columns: [{ width: 28 }, { width: 11 }, { width: 9 }, { width: 12 }, { width: 13 }],
    stickyRowsCount: 3,
  };

  const periodPayments: XlsxSheet = {
    sheet: "Pembayaran periode",
    data: [
      [text(title, { fontWeight: "bold", fontSize: 14, columnSpan: 7 })],
      [text("Nominal adalah uang diterima sekali; periode yang dibayar bisa berbeda dari bulan penerimaan.", { columnSpan: 7 })],
      ["Rumah", "Nama KK", "Jenis", "Tanggal diterima", "Periode dari", "Periode sampai", "Nominal (Rp)"].map((h) => text(h, HEADER)),
      ...(recap.periodPayments ?? []).map((p) => {
        const house = recap.houses.find((h) => h.id === p.houseId);
        return [text(house ? house.block + "-" + house.number : "#" + p.houseId), text(house?.ownerName ?? ""), text(CADENCE_LABEL[p.cadence]), text(p.receivedDate), text(p.periodStart), text(p.periodEnd), num(p.amount, { format: RUPIAH })];
      }),
    ],
    columns: [{ width: 10 }, { width: 24 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 15 }],
    stickyRowsCount: 3,
  };
  return [perHouse, perNight, periodPayments];
}
