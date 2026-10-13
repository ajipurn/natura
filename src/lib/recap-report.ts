import { APP_TIMEZONE, daysInMonth, formatDateLong, formatDateShort, formatMonth, localDate } from "./dates";
import { formatRupiah } from "./format";
import { compareHouses, houseLabel } from "./houses";
import { monthHouseStatusLabel, summarizeMonth } from "./month-summary";
import { PAYMENT_LABEL } from "./payments";
import type { MonthRecap } from "./types";
import { mergeReportRecaps, reportMonths, reportPeriodLabel } from "./recap-report-period";

export type ReportTable = {
  title: string;
  description?: string;
  columns: { label: string; width: number; numeric?: boolean }[];
  rows: string[][];
  total?: string[];
  empty: string;
  pageBreak?: boolean;
};

export type ReportImage = { dataUrl: string; width: number; height: number };
export type ReportDetails = {
  address?: string;
  place?: string;
  chairName?: string;
  logo?: ReportImage;
  stamp?: ReportImage;
};
export const DEFAULT_REPORT_DETAILS = {
  address: "Karangsari, Kebumen",
  place: "Kebumen",
  chairName: "April Bambang Sumariawan",
};

export type RecapReport = {
  title: string;
  communityName: string;
  month: string;
  monthLabel: string;
  generatedLabel: string;
  introduction: string;
  note: string;
  letterhead: { organization: string; address: string; logo?: ReportImage };
  approval: { dateLabel: string; chairName: string; stamp?: ReportImage };
  metrics: { label: string; value: string }[];
  tables: ReportTable[];
  monthlySummary?: ReportTable;
};

/** Ringkasan ditandatangani di depan; rincian tetap lengkap sebagai lampiran. */
export function reportAttachments(report: RecapReport): ReportTable[] {
  const [, blocks, nights, houses, ...payments] = report.tables;
  return [...(report.monthlySummary ? [{ ...report.monthlySummary, pageBreak: true }] : []), { ...nights, pageBreak: !report.monthlySummary && nights.pageBreak }, { ...blocks, pageBreak: true }, { ...houses, pageBreak: blocks.rows.length === 0 }, ...payments.map((table) => ({ ...table, pageBreak: true }))]
    .filter((table) => table.rows.length > 0);
}

export function reportIncomeTable(report: RecapReport): ReportTable {
  const source = report.tables[0];
  return {
    ...source, title: "Rekap penerimaan",
    columns: [{ label: "No", width: 8 }, { label: "Uraian penerimaan", width: 58 }, { label: "Jumlah", width: 34, numeric: true }],
    rows: source.rows.map((row, index) => [String(index + 1), ...row]),
    total: source.total ? ["", ...source.total] : undefined,
  };
}

/** Satu sumber angka untuk Word dan PDF, sama dengan rekap dan tanpa filter tampilan. */
export function buildRecapReport(recap: MonthRecap, communityName: string, month: string, generatedAt = new Date(), details: ReportDetails = {}): RecapReport {
  reportMonths(month, month);
  return buildReport(recap, communityName, month, month, generatedAt, details);
}

export function buildRecapPeriodReport(recaps: MonthRecap[], communityName: string, from: string, to: string, generatedAt = new Date(), details: ReportDetails = {}): RecapReport {
  const report = buildReport(mergeReportRecaps(recaps, from, to), communityName, from, to, generatedAt, details);
  if (from !== to) {
    const totals = recaps.map((recap) => summarizeMonth(mergeReportRecaps([recap], recap.month!, recap.month!)));
    const sum = (field: "collectedTotal" | "monthlyTotal" | "weeklyTotal" | "rapelTotal", i: number) => totals[i].rows.reduce((total, row) => total + row[field], 0);
    const all = (field: "collectedTotal" | "monthlyTotal" | "weeklyTotal" | "rapelTotal") => totals.reduce((total, _, i) => total + sum(field, i), 0);
    report.monthlySummary = {
      title: "Ringkasan per bulan", columns: [{ label: "Bulan", width: 28 }, { label: "Hasil ronda", width: 18, numeric: true }, { label: "Pembayaran periode", width: 18, numeric: true }, { label: "Rapel", width: 16, numeric: true }, { label: "Total", width: 20, numeric: true }],
      rows: recaps.map((recap, i) => [formatMonth(recap.month!), formatRupiah(sum("collectedTotal", i)), formatRupiah(sum("monthlyTotal", i) + sum("weeklyTotal", i)), formatRupiah(sum("rapelTotal", i)), formatRupiah(totals[i].grandTotal)]),
      total: ["Total", formatRupiah(all("collectedTotal")), formatRupiah(all("monthlyTotal") + all("weeklyTotal")), formatRupiah(all("rapelTotal")), formatRupiah(totals.reduce((total, value) => total + value.grandTotal, 0))],
      empty: "Belum ada jimpitan pada periode ini.",
    };
  }
  return report;
}

function buildReport(recap: MonthRecap, communityName: string, month: string, endMonth: string, generatedAt: Date, details: ReportDetails): RecapReport {
  if (recap.month && recap.month !== month) throw new Error("Data rekap belum sesuai bulan laporan. Tunggu sampai bulan yang dipilih selesai dimuat.");
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);
  const sorted = [...rows].sort((a, b) => compareHouses(a.house, b.house));
  const collected = rows.reduce((sum, r) => sum + r.collectedTotal, 0);
  const monthly = rows.reduce((sum, r) => sum + r.monthlyTotal, 0);
  const weekly = rows.reduce((sum, r) => sum + r.weeklyTotal, 0);
  const rapel = rows.reduce((sum, r) => sum + r.rapelTotal, 0);
  const days = daysInMonth(endMonth);
  const periodLabel = reportPeriodLabel(month, endMonth);
  const crossYear = month.slice(0, 4) !== endMonth.slice(0, 4);
  const dateLabel = (date: string) => `${formatDateShort(date)}${crossYear ? ` ${date.slice(0, 4)}` : ""}`;
  const blocks = [...new Set(sorted.map((r) => r.house.block))];
  const sources = [["Hasil ronda", formatRupiah(collected)], ["Pembayaran bulanan", formatRupiah(monthly)], ["Rapel harian", formatRupiah(rapel)]];
  if (weekly > 0) sources.push(["Pembayaran mingguan lama", formatRupiah(weekly)]);
  const houseName = (id: number) => {
    const house = recap.houses.find((h) => h.id === id);
    return house ? `${houseLabel(house)}${house.ownerName ? `\n${house.ownerName}` : ""}` : `Rumah #${id}`;
  };

  const tables: ReportTable[] = [
    {
      title: "Sumber jimpitan", columns: [{ label: "Sumber", width: 65 }, { label: "Jumlah", width: 35, numeric: true }], rows: sources,
      total: ["Total jimpitan", formatRupiah(grandTotal)], empty: "Belum ada jimpitan tercatat.",
    },
    {
      title: "Ringkasan per blok", columns: [{ label: "Blok", width: 20 }, { label: "Rumah", width: 20, numeric: true }, { label: "Dihuni", width: 20, numeric: true }, { label: "Total", width: 40, numeric: true }],
      rows: blocks.map((block) => {
        const group = sorted.filter((r) => r.house.block === block);
        return [block, String(group.length), String(group.filter((r) => r.house.status === "active").length), formatRupiah(group.reduce((sum, r) => sum + r.total, 0))];
      }),
      total: ["Total", String(rows.length), String(rows.filter((r) => r.house.status === "active").length), formatRupiah(grandTotal)],
      empty: "Belum ada rumah terdaftar.",
    },
    {
      title: "Hasil ronda per malam", description: "Nominal berasal dari uang yang diambil saat ronda. Pembayaran bulanan dan rapel disajikan terpisah pada ringkasan sumber jimpitan.", pageBreak: true,
      columns: [{ label: "Malam ronda", width: 32 }, { label: "Ada", width: 12, numeric: true }, { label: "Kosong", width: 14, numeric: true }, { label: "Belum dicek", width: 18, numeric: true }, { label: "Jumlah", width: 24, numeric: true }],
      rows: recap.dates.map((date, i) => [
        dateLabel(date), String(rows.filter((r) => r.cells[i]?.status === "filled").length),
        String(rows.filter((r) => r.house.status === "active" && r.cells[i]?.status === "empty" && !r.nights[i].period && !r.nights[i].rapel).length),
        String(rows.filter((r) => r.house.status === "active" && !r.nights[i].cell && !r.nights[i].period).length), formatRupiah(dateTotals[i]),
      ]), total: ["Total hasil ronda", "", "", "", formatRupiah(collected)], empty: "Belum ada ronda tercatat untuk bulan ini.",
    },
    {
      title: "Rekap per rumah", pageBreak: true,
      description: "Ada mencakup catatan berisi dan hari rapel yang lunas. Rumah dengan pembayaran periode tidak memerlukan pemeriksaan harian. Status mudik mengikuti data rumah saat laporan dibuat.",
      columns: [{ label: "Rumah dan warga", width: 28 }, { label: "Status / cara bayar", width: 20 }, { label: "Ada", width: 8, numeric: true }, { label: "Kosong", width: 10, numeric: true }, { label: "Belum dicek", width: 12, numeric: true }, { label: "Total", width: 22, numeric: true }],
      rows: sorted.map((r) => [houseName(r.house.id), monthHouseStatusLabel(recap, r.house).replaceAll(" → ", " / "), String(r.filledCount), String(r.house.status === "active" ? r.empty : 0), String(r.unchecked), formatRupiah(r.total)]),
      total: ["Total", "", String(rows.reduce((sum, r) => sum + r.filledCount, 0)), String(rows.reduce((sum, r) => sum + (r.house.status === "active" ? r.empty : 0), 0)), String(rows.reduce((sum, r) => sum + r.unchecked, 0)), formatRupiah(grandTotal)], empty: "Belum ada rumah terdaftar.",
    },
  ];
  const bills = recap.paymentPeriods ?? [];
  const place = (details.place ?? DEFAULT_REPORT_DETAILS.place).trim();
  if (bills.length) tables.push({
    title: "Status pembayaran periode",
    description: "Periode dan nominal tagihan ditampilkan utuh. Periode yang melintasi bulan dapat mencakup hari di luar bulan laporan. Sisa di sini hanya tagihan pembayaran periode, bukan hari kosong harian.",
    columns: [{ label: "Rumah dan warga", width: 25 }, { label: "Periode", width: 25 }, { label: "Tagihan", width: 17, numeric: true }, { label: "Terbayar", width: 17, numeric: true }, { label: "Sisa", width: 16, numeric: true }],
    rows: bills.map((p) => [houseName(p.houseId), `${PAYMENT_LABEL[p.cadence]}\n${dateLabel(p.start)} - ${dateLabel(p.end)}\n${p.status === "paid" ? "Lunas" : p.paid > 0 ? "Dibayar sebagian" : "Belum bayar"}`, formatRupiah(p.expected), formatRupiah(p.paid), formatRupiah(p.remaining)]),
    empty: "Belum ada tagihan pembayaran periode.",
  });
  return {
    title: month === endMonth ? "Laporan bulanan jimpitan" : "Laporan jimpitan", communityName, month, monthLabel: periodLabel,
    generatedLabel: `Dibuat ${formatDateLong(localDate(generatedAt))}`,
    introduction: `Berikut kami sampaikan laporan penerimaan jimpitan ${communityName} untuk periode ${periodLabel}. Laporan ini disusun berdasarkan catatan ronda dan pembayaran warga yang dialokasikan pada periode tersebut.`,
    note: "Penerimaan disajikan sesuai periode pembayaran. Laporan ini mencakup jimpitan dan tidak mencerminkan saldo kas paguyuban.",
    letterhead: {
      organization: /^paguyuban\b/i.test(communityName) ? communityName : `Paguyuban ${communityName}`,
      address: (details.address ?? DEFAULT_REPORT_DETAILS.address).trim(), logo: details.logo,
    },
    approval: {
      dateLabel: `${place ? `${place}, ` : ""}${new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIMEZONE, day: "numeric", month: "long", year: "numeric" }).format(generatedAt)}`,
      chairName: (details.chairName ?? DEFAULT_REPORT_DETAILS.chairName).trim(), stamp: details.stamp,
    },
    metrics: [{ label: "Periode laporan", value: month === endMonth ? `1–${days.length} ${formatMonth(month)}` : `1 ${formatMonth(month)} - ${days.length} ${formatMonth(endMonth)}` }, { label: "Total jimpitan", value: formatRupiah(grandTotal) }, { label: "Malam ronda tercatat", value: String(recap.dates.length) }, { label: "Rumah terdaftar", value: String(rows.length) }], tables,
  };
}
