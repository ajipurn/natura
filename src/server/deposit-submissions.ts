import { and, eq, isNull, sql } from "drizzle-orm";
import { rondaPaymentPeriods } from "@/lib/payments";
import { summarize } from "@/lib/recap";
import { scheduleDay } from "@/lib/schedule";
import type { DepositSubmission, RondaSnapshot } from "@/lib/types";
import type { Db } from "./db";
import { cashDeposits, payments, patrols, users } from "./schema";

/** Pemeriksaan yang sama untuk pengajuan otomatis dan percobaan ulang dari HP. */
export async function requestCompletedDeposit(db: Db, snapshot: RondaSnapshot, now = new Date()) {
  const { date, user } = snapshot;
  if (!snapshot.schedule.some((slot) => slot.userId === user.id && slot.day === scheduleDay(date))) {
    return { error: "Hanya petugas yang dijadwalkan malam ini yang bisa mengajukan setoran.", status: 403 as const };
  }
  const summary = summarize(snapshot.houses, snapshot.collections, rondaPaymentPeriods(snapshot, date));
  if (!summary.checked || summary.unchecked.length) {
    return { error: "Selesaikan dan sinkronkan catatan semua rumah sebelum mengajukan setoran.", status: 409 as const };
  }
  const submission = snapshot.depositSubmission!;
  if (submission.receivedAmount !== summary.total + submission.periodAmount) {
    await db.insert(patrols).values({ date, depositRequestedAt: now, depositRequestedBy: user.id })
      .onConflictDoUpdate({ target: patrols.date, set: { depositRequestedAt: now, depositRequestedBy: user.id }, setWhere: isNull(patrols.depositRequestedAt) });
  }
  return { depositSubmission: await getDepositSubmission(db, date) };
}

/** Pengajuan merupakan penanda serah-terima; hanya cash_deposits yang menambah kas. */
export async function getDepositSubmission(db: Db, date: string): Promise<DepositSubmission> {
  const [[request], [deposit], [period]] = await Promise.all([
    db.select({ requestedAt: patrols.depositRequestedAt, requestedByName: users.name }).from(patrols)
      .leftJoin(users, eq(users.id, patrols.depositRequestedBy)).where(eq(patrols.date, date)),
    db.select({ amount: cashDeposits.amount }).from(cashDeposits).where(eq(cashDeposits.date, date)),
    db.select({ amount: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) }).from(payments)
      .where(and(eq(payments.receivedDate, date), eq(payments.receivedBy, "collector"), isNull(payments.cancelledAt))),
  ]);
  return {
    requestedAt: request?.requestedAt?.toISOString() ?? null,
    requestedByName: request?.requestedByName ?? null,
    receivedAmount: deposit?.amount ?? null,
    periodAmount: period.amount,
  };
}
