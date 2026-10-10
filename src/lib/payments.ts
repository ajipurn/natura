import { addDays, daysBetween, daysInMonth, shiftMonth } from "./dates";
import { scheduleDay } from "./schedule";

/** Mingguan hanya dipertahankan untuk membaca dan mengoreksi riwayat lama. */
export type PaymentCadence = "daily" | "weekly" | "monthly";
export const PAYMENT_PLAN_CADENCES = ["daily", "monthly"] as const;
export type CurrentPaymentCadence = typeof PAYMENT_PLAN_CADENCES[number];
export type PaymentPlanDTO = {
  id: number;
  houseId: number;
  effectiveFrom: string;
  cadence: PaymentCadence;
  ratePerNight: number;
  dueTiming: "start" | "end";
  graceDays: number;
  weekStart: number;
};
export type PeriodPayment = {
  id: number;
  houseId: number;
  receivedDate: string;
  periodStart: string;
  periodEnd: string;
  cadence: PaymentCadence;
  amount: number;
  allocations?: [string, number][] | null;
};
export type PaymentCell = { amount: number; monthlyAmount: number; weeklyAmount: number; rapelAmount?: number; paid: boolean };
export type BillingStatus = "paid" | "unpaid";
export type BillingPeriod = {
  houseId: number;
  planId: number;
  cadence: PaymentCadence;
  start: string;
  end: string;
  expected: number;
  paid: number;
  remaining: number;
  status: BillingStatus;
};

export const CADENCE_LABEL: Record<PaymentCadence, string> = { daily: "Harian", weekly: "Mingguan", monthly: "Bulanan" };
export const PAYMENT_LABEL = { ...CADENCE_LABEL, daily: "Rapel" };
export const BILLING_LABEL: Record<BillingStatus, string> = {
  paid: "Sudah bayar", unpaid: "Belum bayar",
};

/** Periode kalender; mingguan dapat dimulai pada hari yang disepakati. */
export function paymentPeriod(date: string, cadence: PaymentCadence, weekStart = 1) {
  if (cadence === "daily") return { start: date, end: date };
  if (cadence === "weekly") {
    const start = addDays(date, -((scheduleDay(date) - weekStart + 7) % 7));
    return { start, end: addDays(start, 6) };
  }
  const days = daysInMonth(date.slice(0, 7));
  return { start: days[0], end: days[days.length - 1] };
}

export function planAt(plans: PaymentPlanDTO[], houseId: number, date: string) {
  return plans.filter((p) => p.houseId === houseId && p.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/** Pembagian rupiah deterministik, termasuk sisa pembulatan, sehingga jumlahnya selalu sama dengan penerimaan. */
export function allocatePayment(payment: PeriodPayment): [string, number][] {
  if (payment.cadence === "daily" && payment.allocations) return payment.allocations;
  const count = daysBetween(payment.periodStart, payment.periodEnd) + 1;
  const base = Math.floor(payment.amount / count);
  const remainder = payment.amount % count;
  return Array.from({ length: count }, (_, i) => [addDays(payment.periodStart, i), base + (i < remainder ? 1 : 0)]);
}

export function paymentCells(payments: PeriodPayment[], plans: PaymentPlanDTO[], fallbackRate: number, start?: string, end?: string) {
  const cells: Record<string, PaymentCell> = {};
  for (const p of payments) for (const [date, amount] of allocatePayment(p)) {
    if ((start && date < start) || (end && date > end)) continue;
    const key = p.houseId + ":" + date;
    const cell = cells[key] ??= { amount: 0, monthlyAmount: 0, weeklyAmount: 0, paid: false };
    cell.amount += amount;
    if (p.cadence === "monthly") cell.monthlyAmount += amount;
    if (p.cadence === "weekly") cell.weeklyAmount += amount;
    if (p.cadence === "daily") cell.rapelAmount = (cell.rapelAmount ?? 0) + amount;
    // Rapel melunasi tanggal pilihan saat dicatat; perubahan tarif berikutnya tidak membuka pembayaran itu lagi.
    cell.paid = (cell.rapelAmount ?? 0) > 0 || cell.amount >= (planAt(plans, p.houseId, date)?.ratePerNight ?? fallbackRate);
  }
  return cells;
}

/** Tidak membuat kewajiban sebelum kesepakatan pertama; perubahan tanggal berlaku membatasi kesepakatan lama. */
export function billingPeriods(
  plans: PaymentPlanDTO[],
  cells: Record<string, PaymentCell>,
  collections: Record<string, { status: string; amount: number }>,
  _today: string,
  start: string,
  end: string,
): BillingPeriod[] {
  const result: BillingPeriod[] = [];
  const sorted = [...plans].sort((a, b) => a.houseId - b.houseId || a.effectiveFrom.localeCompare(b.effectiveFrom));
  sorted.forEach((plan, i) => {
    // Harian kembali ke pemeriksaan wadah; tidak membuat tunggakan per malam.
    if (plan.cadence === "daily") return;
    const next = sorted[i + 1]?.houseId === plan.houseId ? sorted[i + 1].effectiveFrom : undefined;
    const last = next && addDays(next, -1) < end ? addDays(next, -1) : end;
    let cursor = start > plan.effectiveFrom ? start : plan.effectiveFrom;
    while (cursor <= last) {
      const calendar = paymentPeriod(cursor, plan.cadence, plan.weekStart);
      const from = calendar.start < plan.effectiveFrom ? plan.effectiveFrom : calendar.start;
      const to = next && calendar.end >= next ? addDays(next, -1) : calendar.end;
      let paid = 0;
      const count = daysBetween(from, to) + 1;
      for (let d = 0; d < count; d++) {
        const key = plan.houseId + ":" + addDays(from, d);
        const collection = collections[key];
        paid += (cells[key]?.amount ?? 0) + (collection?.status === "filled" ? collection.amount : 0);
      }
      const expected = count * plan.ratePerNight;
      const remaining = Math.max(0, expected - paid);
      const status: BillingStatus = remaining === 0 ? "paid" : "unpaid";
      result.push({ houseId: plan.houseId, planId: plan.id, cadence: plan.cadence, start: from, end: to, expected, paid, remaining, status });
      cursor = addDays(calendar.end, 1);
    }
  });
  return result;
}

/** Status periode dari salinan di HP; pergantian minggu/bulan tetap memakai kesepakatan yang berlaku. */
export function rondaPaymentPeriods(data: { paymentPlans?: PaymentPlanDTO[]; paymentPeriods?: BillingPeriod[]; paymentCells?: Record<string, PaymentCell> }, date: string) {
  const cached = (data.paymentPeriods ?? []).filter((p) => p.start <= date && p.end >= date)
    .map((p): BillingPeriod => ({ ...p, status: p.remaining === 0 ? "paid" : "unpaid" }));
  const calculated = billingPeriods(data.paymentPlans ?? [], data.paymentCells ?? {}, {}, date, date, date);
  return [...cached, ...calculated.filter((p) => !cached.some((c) => c.houseId === p.houseId))];
}

/** Lege kalender bulan berikutnya tetap dihitung dengan jumlah hari sesungguhnya. */
export function nextPaymentPeriod(date: string, cadence: PaymentCadence, weekStart = 1) {
  const current = paymentPeriod(date, cadence, weekStart);
  return paymentPeriod(cadence === "monthly" ? shiftMonth(date.slice(0, 7), 1) + "-01" : addDays(current.end, 1), cadence, weekStart);
}
