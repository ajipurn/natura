import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db, Executor } from "./db";
import { duesInvoices, duesReceipts, duesTypes, houses, users } from "./schema";
import { houseName } from "./house-name";

export async function getDuesMonth(db: Db, month: string, today: string) {
  const [types, invoices, receipts] = await Promise.all([
    db.select().from(duesTypes).orderBy(asc(duesTypes.name)),
    db
      .select({
        id: duesInvoices.id,
        typeId: duesInvoices.typeId,
        typeName: duesTypes.name,
        houseId: duesInvoices.houseId,
        block: houses.block,
        number: houses.number,
        ownerName: houseName,
        month: duesInvoices.month,
        amount: duesInvoices.amount,
        dueDate: duesInvoices.dueDate,
        cancelledAt: duesInvoices.cancelledAt,
      })
      .from(duesInvoices)
      .innerJoin(duesTypes, eq(duesTypes.id, duesInvoices.typeId))
      .innerJoin(houses, eq(houses.id, duesInvoices.houseId))
      .orderBy(
        asc(duesInvoices.dueDate),
        asc(houses.block),
        asc(houses.number),
      ),
    db
      .select({
        id: duesReceipts.id,
        invoiceId: duesReceipts.invoiceId,
        amount: duesReceipts.amount,
        date: duesReceipts.date,
        method: duesReceipts.method,
        note: duesReceipts.note,
        hasProof: sql<boolean>`${duesReceipts.proof} is not null`,
        cancelledAt: duesReceipts.cancelledAt,
        recordedByName: users.name,
      })
      .from(duesReceipts)
      .leftJoin(users, eq(users.id, duesReceipts.recordedBy))
      .orderBy(desc(duesReceipts.date), desc(duesReceipts.id)),
  ]);
  const amounts = new Map<number, number>();
  for (const receipt of receipts)
    if (!receipt.cancelledAt)
      amounts.set(
        receipt.invoiceId,
        (amounts.get(receipt.invoiceId) ?? 0) + receipt.amount,
      );
  const bills = invoices
    .map((invoice) => {
      const paid = amounts.get(invoice.id) ?? 0;
      const remaining = invoice.amount - paid;
      return {
        ...invoice,
        cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
        paid,
        remaining,
        status: invoice.cancelledAt
          ? "cancelled"
          : remaining === 0
            ? "paid"
            : invoice.dueDate < today
              ? "overdue"
              : paid
                ? "partial"
                : "unpaid",
      };
    })
    .filter(
      (invoice) =>
        invoice.month === month ||
        (invoice.month < month &&
          !invoice.cancelledAt &&
          invoice.remaining > 0) ||
        receipts.some(
          (receipt) =>
            receipt.invoiceId === invoice.id && receipt.date.startsWith(month),
        ),
    );
  const shownIds = new Set(bills.map((invoice) => invoice.id));
  return {
    month,
    today,
    types,
    bills,
    receipts: receipts
      .filter((receipt) => shownIds.has(receipt.invoiceId))
      .map((receipt) => ({
        ...receipt,
        cancelledAt: receipt.cancelledAt?.toISOString() ?? null,
      })),
  };
}

export async function invoicePaid(db: Executor, invoiceId: number) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${duesReceipts.amount}), 0)`.mapWith(
        Number,
      ),
    })
    .from(duesReceipts)
    .where(
      and(
        eq(duesReceipts.invoiceId, invoiceId),
        isNull(duesReceipts.cancelledAt),
      ),
    );
  return row.total;
}
