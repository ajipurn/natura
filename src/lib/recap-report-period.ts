import { daysInMonth, formatMonth, isMonth, shiftMonth } from "./dates";
import type { MonthRecap } from "./types";

export const MAX_REPORT_MONTHS = 24;

export function reportMonths(from: string, to: string): string[] {
  if (!isMonth(from) || !isMonth(to)) throw new Error("Pilih bulan awal dan bulan akhir laporan.");
  if (to < from) throw new Error("Bulan akhir harus sama atau setelah bulan awal.");
  const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
  const count = index(to) - index(from) + 1;
  if (count > MAX_REPORT_MONTHS) throw new Error(`Pilih rentang maksimal ${MAX_REPORT_MONTHS} bulan dalam satu laporan.`);
  return Array.from({ length: count }, (_, i) => shiftMonth(from, i));
}

export function reportPeriodLabel(from: string, to: string): string {
  if (from === to) return formatMonth(from);
  const first = from.slice(0, 4) === to.slice(0, 4) ? formatMonth(from).replace(/ \d{4}$/, "") : formatMonth(from);
  return `${first} - ${formatMonth(to)}`;
}

/** Satukan data sumber tanpa menjumlahkan ulang receipt/tagihan yang melintasi beberapa bulan. */
export function mergeReportRecaps(recaps: MonthRecap[], from: string, to: string): MonthRecap {
  const months = reportMonths(from, to);
  if (recaps.length !== months.length || recaps.some((recap, i) => recap.month !== months[i])) throw new Error("Data periode laporan belum lengkap. Muat ulang lalu coba lagi.");
  const start = `${from}-01`, end = daysInMonth(to).at(-1)!;
  const houses = new Map<number, MonthRecap["houses"][number]>();
  const dates = new Set<string>();
  const cells: MonthRecap["cells"] = {}, paymentCells: NonNullable<MonthRecap["paymentCells"]> = {}, paymentCadences: NonNullable<MonthRecap["paymentCadences"]> = {};
  const periods = new Map<string, NonNullable<MonthRecap["paymentPeriods"]>[number]>(), receipts = new Map<number, NonNullable<MonthRecap["periodPayments"]>[number]>();
  for (const recap of recaps) {
    const withinMonth = (date: string) => date.startsWith(recap.month!) && date >= start && date <= end;
    for (const house of recap.houses) houses.set(house.id, house);
    for (const date of recap.dates) if (withinMonth(date)) dates.add(date);
    for (const [key, cell] of Object.entries(recap.cells)) if (withinMonth(key.split(":")[1])) cells[key] = cell;
    for (const [key, cell] of Object.entries(recap.paymentCells ?? {})) if (withinMonth(key.split(":")[1])) paymentCells[key] = cell;
    for (const [id, cadences] of Object.entries(recap.paymentCadences ?? {})) {
      const all = [...(paymentCadences[Number(id)] ?? []), ...cadences];
      paymentCadences[Number(id)] = all.filter((cadence, i) => i === 0 || cadence !== all[i - 1]);
    }
    for (const period of recap.paymentPeriods ?? []) if (period.start <= end && period.end >= start) periods.set(`${period.houseId}:${period.planId}:${period.cadence}:${period.start}:${period.end}`, period);
    for (const receipt of recap.periodPayments ?? []) if (receipt.periodStart <= end && receipt.periodEnd >= start) receipts.set(receipt.id, receipt);
  }
  return { month: from, houses: [...houses.values()], dates: [...dates].sort(), cells, paymentCells, paymentCadences, paymentPeriods: [...periods.values()], periodPayments: [...receipts.values()] };
}
