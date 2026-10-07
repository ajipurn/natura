import { asc, desc, eq, isNull } from "drizzle-orm";
import { addDays, daysInMonth, localDate } from "@/lib/dates";
import { billingPeriods, paymentCells, type PaymentPlanDTO } from "@/lib/payments";
import type { Db } from "./db";
import { collections, houses, paymentLogs, paymentPlans, payments, patrols, settings, users } from "./schema";

export async function getPaymentData(db: Db) {
  const [plans, receipts, daily, [config]] = await Promise.all([
    db.select().from(paymentPlans).orderBy(asc(paymentPlans.effectiveFrom)),
    db.select({
      id: payments.id, houseId: payments.houseId, clientId: payments.clientId,
      receivedDate: payments.receivedDate, periodStart: payments.periodStart, periodEnd: payments.periodEnd,
      cadence: payments.cadence, amount: payments.amount, receivedBy: payments.receivedBy,
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
  return { plans, receipts, cells, dailyCells };
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
  const receipts = data.receipts.filter((p) => p.houseId === houseId).map(({ receivedDate, periodStart, periodEnd, cadence, amount }) =>
    ({ receivedDate, periodStart, periodEnd, cadence, amount }));
  return { plans, periods, receipts, tonight: data.cells[houseId + ":" + today] ?? null };
}

export async function getPaymentPlansForHouse(db: Db, houseId: number) {
  return db.select().from(paymentPlans).where(eq(paymentPlans.houseId, houseId)).orderBy(asc(paymentPlans.effectiveFrom));
}

export async function paymentLogsFor(db: Db, paymentId: number) {
  return db.select({ id: paymentLogs.id, action: paymentLogs.action, payload: paymentLogs.payload, createdAt: paymentLogs.createdAt, name: users.name })
    .from(paymentLogs).leftJoin(users, eq(users.id, paymentLogs.userId)).where(eq(paymentLogs.paymentId, paymentId))
    .orderBy(desc(paymentLogs.id));
}
