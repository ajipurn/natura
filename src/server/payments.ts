import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";
import { addDays, daysInMonth, localDate } from "@/lib/dates";
import { billingPeriods, paymentCells, planAt, type PaymentPlanDTO } from "@/lib/payments";
import type { Db, Executor } from "./db";
import { collections, houses, paymentLogs, paymentPlans, payments, patrols, settings, users } from "./schema";

export async function getPaymentData(db: Executor) {
  const [plans, receipts, daily, [config]] = await Promise.all([
    db.select().from(paymentPlans).orderBy(asc(paymentPlans.effectiveFrom)),
    db.select({
      id: payments.id, houseId: payments.houseId, clientId: payments.clientId,
      receivedDate: payments.receivedDate, periodStart: payments.periodStart, periodEnd: payments.periodEnd,
      cadence: payments.cadence, amount: payments.amount, receivedBy: payments.receivedBy,
      allocations: payments.allocations,
      collectorId: payments.collectorId, collectorName: users.name, note: payments.note,
      updatedAt: payments.updatedAt,
    }).from(payments).leftJoin(users, eq(users.id, payments.collectorId))
      .where(isNull(payments.cancelledAt)).orderBy(desc(payments.receivedDate), desc(payments.id)),
    db.select({ houseId: collections.houseId, date: patrols.date, status: collections.status, amount: collections.amount })
      .from(collections).innerJoin(patrols, eq(patrols.id, collections.patrolId)).where(eq(collections.status, "filled")),
    db.select({ defaultAmount: settings.defaultAmount }).from(settings).limit(1),
  ]);
  const cells = paymentCells(receipts, plans, config?.defaultAmount ?? 500);
  const dailyCells = Object.fromEntries(daily.map((c) => [c.houseId + ":" + c.date, c]));
  return { plans, receipts, cells, dailyCells, defaultAmount: config?.defaultAmount ?? 500 };
}

/** Hari kosong yang dapat dibayar rapel. Tidak membuat tagihan untuk rumah harian. */
export async function getRapelDates(db: Executor, houseId: number, before: string, excludePaymentId?: number) {
  const [data, empty] = await Promise.all([
    getPaymentData(db),
    db.select({ date: patrols.date }).from(collections)
      .innerJoin(patrols, eq(patrols.id, collections.patrolId))
      .innerJoin(houses, eq(houses.id, collections.houseId))
      .where(and(eq(collections.houseId, houseId), eq(collections.status, "empty"), eq(houses.status, "active"), lte(patrols.date, before)))
      .orderBy(asc(patrols.date)),
  ]);
  const cells = excludePaymentId === undefined ? data.cells
    : paymentCells(data.receipts.filter((p) => p.id !== excludePaymentId), data.plans, data.defaultAmount);
  return empty.flatMap(({ date }) => {
    const plan = planAt(data.plans, houseId, date);
    if (plan && plan.cadence !== "daily") return [];
    const cell = cells[houseId + ":" + date];
    if ((cell?.rapelAmount ?? 0) > 0) return [];
    const remaining = Math.max(0, (plan?.ratePerNight ?? data.defaultAmount) - (cell?.amount ?? 0));
    return remaining > 0 ? [{ date, amount: remaining }] : [];
  });
}

export async function getPaymentMonth(db: Db, month: string, today = localDate(new Date())) {
  const data = await getPaymentData(db);
  const days = daysInMonth(month);
  const bills = billingPeriods(data.plans, data.cells, data.dailyCells, today, days[0], days[days.length - 1]);
  const first = data.plans.reduce((date, p) => p.effectiveFrom < date ? p.effectiveFrom : date, today);
  const previousUnpaidBills = billingPeriods(data.plans, data.cells, data.dailyCells, today, first, addDays(days[0], -1))
    .filter((b) => b.end < days[0] && b.status === "unpaid");
  return { ...data, bills, previousUnpaidBills };
}

export async function getPaymentOverview(db: Db, today: string, month = today.slice(0, 7)) {
  const data = await getPaymentData(db);
  const bills = billingPeriods(data.plans, data.cells, data.dailyCells, today, today, today);
  const active = new Set((await db.select({ id: houses.id }).from(houses).where(eq(houses.status, "active"))).map((h) => h.id));
  const unpaid = bills.filter((b) => b.status === "unpaid" && active.has(b.houseId));
  return {
    unpaidHouses: new Set(unpaid.map((b) => b.houseId)).size,
    unpaidAmount: unpaid.reduce((sum, b) => sum + b.remaining, 0),
    receivedToday: data.receipts.filter((p) => p.receivedDate === today).reduce((sum, p) => sum + p.amount, 0),
    receivedMonth: data.receipts.filter((p) => p.receivedDate.startsWith(month)).reduce((sum, p) => sum + p.amount, 0),
  };
}

/** Tampilan publik tidak membawa nama pencatat, penerima, catatan internal, maupun clientId. */
export async function getHousePaymentInfo(db: Db, houseId: number, today: string) {
  const data = await getPaymentData(db);
  const plans: PaymentPlanDTO[] = data.plans.filter((p) => p.houseId === houseId).map(({ id, houseId, effectiveFrom, cadence, ratePerNight, dueTiming, graceDays, weekStart }) =>
    ({ id, houseId, effectiveFrom, cadence, ratePerNight, dueTiming, graceDays, weekStart }));
  const first = plans.reduce((date, p) => p.effectiveFrom < date ? p.effectiveFrom : date, today);
  const periods = billingPeriods(plans, data.cells, data.dailyCells, today, first, today);
  const receipts = data.receipts.filter((p) => p.houseId === houseId).map(({ receivedDate, periodStart, periodEnd, cadence, amount, allocations }) =>
    ({ receivedDate, periodStart, periodEnd, cadence, amount, ...(allocations ? { allocations } : {}) }));
  const cells = Object.fromEntries(Object.entries(data.cells).filter(([key]) => key.startsWith(houseId + ":")).map(([key, cell]) => [key.split(":")[1], cell]));
  return { plans, periods, receipts, cells, tonight: data.cells[houseId + ":" + today] ?? null };
}

export async function getPaymentPlansForHouse(db: Db, houseId: number) {
  return db.select().from(paymentPlans).where(eq(paymentPlans.houseId, houseId)).orderBy(asc(paymentPlans.effectiveFrom));
}

export async function paymentLogsFor(db: Db, paymentId: number) {
  return db.select({ id: paymentLogs.id, action: paymentLogs.action, payload: paymentLogs.payload, createdAt: paymentLogs.createdAt, name: users.name })
    .from(paymentLogs).leftJoin(users, eq(users.id, paymentLogs.userId)).where(eq(paymentLogs.paymentId, paymentId))
    .orderBy(desc(paymentLogs.id));
}
