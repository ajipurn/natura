import { daysInMonth, formatDateLong, formatDateShort, formatMonth, localDate } from "./dates";
import { formatRupiah } from "./format";
import { compareHouses, houseLabel } from "./houses";
import { monthHouseStatusLabel, summarizeMonth } from "./month-summary";
import { PAYMENT_LABEL } from "./payments";
import type { MonthRecap } from "./types";

export type ReportTable = {
  title: string;
  description?: string;
  columns: { label: string; width: number; numeric?: boolean }[];
  rows: string[][];
  total?: string[];
  empty: string;
  pageBreak?: boolean;
};

export type RecapReport = {
  title: string;
  communityName: string;
  month: string;
  monthLabel: string;
  generatedLabel: string;
  introduction: string;
  note: string;
  metrics: { label: string; value: string }[];
  tables: ReportTable[];
};

/** Satu sumber angka untuk Word dan PDF, sama dengan rekap dan tanpa filter tampilan. */
export function buildRecapReport(recap: MonthRecap, communityName: string, month: string, generatedAt = new Date()): RecapReport {
  if (recap.month && recap.month !== month) throw new Error("Data rekap belum sesuai bulan laporan. Tunggu sampai bulan yang dipilih selesai dimuat.");
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);
  const sorted = [...rows].sort((a, b) => compareHouses(a.house, b.house));
  const collected = rows.reduce((sum, r) => sum + r.collectedTotal, 0);
  const monthly = rows.reduce((sum, r) => sum + r.monthlyTotal, 0);
  const weekly = rows.reduce((sum, r) => sum + r.weeklyTotal, 0);
  const rapel = rows.reduce((sum, r) => sum + r.rapelTotal, 0);
  const days = daysInMonth(month);
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
        formatDateShort(date), String(rows.filter((r) => r.cells[i]?.status === "filled").length),
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
  if (bills.length) tables.push({
    title: "Status pembayaran periode",
    description: "Periode dan nominal tagihan ditampilkan utuh. Periode yang melintasi bulan dapat mencakup hari di luar bulan laporan. Sisa di sini hanya tagihan pembayaran periode, bukan hari kosong harian.",
    columns: [{ label: "Rumah dan warga", width: 25 }, { label: "Periode", width: 25 }, { label: "Tagihan", width: 17, numeric: true }, { label: "Terbayar", width: 17, numeric: true }, { label: "Sisa", width: 16, numeric: true }],
    rows: bills.map((p) => [houseName(p.houseId), `${PAYMENT_LABEL[p.cadence]}\n${formatDateShort(p.start)} - ${formatDateShort(p.end)}\n${p.status === "paid" ? "Lunas" : p.paid > 0 ? "Dibayar sebagian" : "Belum bayar"}`, formatRupiah(p.expected), formatRupiah(p.paid), formatRupiah(p.remaining)]),
    empty: "Belum ada tagihan pembayaran periode.",
  });
  return {
    title: "Laporan bulanan jimpitan", communityName, month, monthLabel: formatMonth(month),
    generatedLabel: `Dibuat ${formatDateLong(localDate(generatedAt))}`,
    introduction: `Jimpitan untuk ${formatMonth(month)} tercatat sebesar ${formatRupiah(grandTotal)} dari ${recap.dates.length} malam ronda dan pembayaran yang dialokasikan ke bulan ini. Laporan mencakup seluruh ${rows.length} rumah terdaftar.`,
    note: "Total mengikuti periode yang dibayar, bukan tanggal uang diterima atau disetor. Pembayaran periode dihitung satu kali; status otomatis tidak menambah uang baru. Laporan ini merupakan rekap jimpitan, bukan saldo kas.",
    metrics: [{ label: "Periode laporan", value: `${formatDateShort(days[0])} - ${formatDateShort(days.at(-1)!)}` }, { label: "Total jimpitan", value: formatRupiah(grandTotal) }, { label: "Malam ronda tercatat", value: String(recap.dates.length) }, { label: "Rumah terdaftar", value: String(rows.length) }], tables,
  };
}
