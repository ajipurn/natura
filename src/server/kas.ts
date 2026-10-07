import { and, asc, desc, eq, gte, isNull, lt, lte, min, sql } from "drizzle-orm";
import { daysInMonth } from "@/lib/dates";
import type { Db } from "./db";
import { listPatrols } from "./queries";
import { cashDeposits, cashEntries, collections, payments, patrols, settings, users } from "./schema";

/** Batas satu catatan kas (Rp). */
export const MAX_CASH = 100_000_000;

/**
 * Jumlah kas: saldo sebelum bulan itu, setoran/pemasukan lain/pengeluaran di bulan itu, saldo akhir
 * bulan, dan saldo sekarang (semua catatan).
 */
async function cashTotals(db: Db, month: string) {
  const days = daysInMonth(month);
  const [start, end] = [days[0], days[days.length - 1]];
  const [[dep], [ent], [direct]] = await Promise.all([
    db
      .select({
        before: sql<number>`coalesce(sum(${cashDeposits.amount}) filter (where ${cashDeposits.date} < ${start}), 0)`.mapWith(Number),
        during: sql<number>`coalesce(sum(${cashDeposits.amount}) filter (where ${cashDeposits.date} between ${start} and ${end}), 0)`.mapWith(Number),
        all: sql<number>`coalesce(sum(${cashDeposits.amount}), 0)`.mapWith(Number),
      })
      .from(cashDeposits),
    db
      .select({
        beforeIn: sql<number>`coalesce(sum(${cashEntries.amount}) filter (where ${cashEntries.direction} = 'in' and ${cashEntries.date} < ${start}), 0)`.mapWith(Number),
        beforeOut: sql<number>`coalesce(sum(${cashEntries.amount}) filter (where ${cashEntries.direction} = 'out' and ${cashEntries.date} < ${start}), 0)`.mapWith(Number),
        income: sql<number>`coalesce(sum(${cashEntries.amount}) filter (where ${cashEntries.direction} = 'in' and ${cashEntries.date} between ${start} and ${end}), 0)`.mapWith(Number),
        expenses: sql<number>`coalesce(sum(${cashEntries.amount}) filter (where ${cashEntries.direction} = 'out' and ${cashEntries.date} between ${start} and ${end}), 0)`.mapWith(Number),
        allIn: sql<number>`coalesce(sum(${cashEntries.amount}) filter (where ${cashEntries.direction} = 'in'), 0)`.mapWith(Number),
        allOut: sql<number>`coalesce(sum(${cashEntries.amount}) filter (where ${cashEntries.direction} = 'out'), 0)`.mapWith(Number),
      })
      .from(cashEntries),
    db.select({
      before: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.receivedDate} < ${start}), 0)`.mapWith(Number),
      during: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.receivedDate} between ${start} and ${end}), 0)`.mapWith(Number),
      all: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    }).from(payments).where(and(eq(payments.receivedBy, "treasurer"), isNull(payments.cancelledAt))),
  ]);
  const opening = dep.before + ent.beforeIn - ent.beforeOut + direct.before;
  return {
    opening,
    deposits: dep.during,
    income: ent.income,
    directPayments: direct.during,
    expenses: ent.expenses,
    closing: opening + dep.during + ent.income + direct.during - ent.expenses,
    balance: dep.all + ent.allIn + direct.all - ent.allOut,
  };
}

/** Pemasukan lain dan pengeluaran di satu bulan, terbaru dulu. */
function monthEntries(db: Db, month: string) {
  const days = daysInMonth(month);
  return db
    .select({
      id: cashEntries.id,
      date: cashEntries.date,
      direction: cashEntries.direction,
      amount: cashEntries.amount,
      description: cashEntries.description,
      recordedByName: users.name,
    })
    .from(cashEntries)
    .leftJoin(users, eq(users.id, cashEntries.recordedBy))
    .where(and(gte(cashEntries.date, days[0]), lte(cashEntries.date, days[days.length - 1])))
    .orderBy(desc(cashEntries.date), desc(cashEntries.id));
}

/**
 * Malam-malam yang uangnya sudah lewat tapi belum dicatat setorannya, sebelum malam ini. Baru dihitung
 * sejak setoran pertama dicatat, supaya malam-malam sebelum kas dipakai tidak ikut ditagih.
 */
export async function undepositedNights(db: Db, tonight: string): Promise<string[]> {
  const [first] = await db.select({ date: min(cashDeposits.date) }).from(cashDeposits);
  if (!first?.date) return [];
  const rows = await db
    .select({ date: patrols.date })
    .from(patrols)
    .innerJoin(collections, and(eq(collections.patrolId, patrols.id), eq(collections.status, "filled")))
    .leftJoin(cashDeposits, eq(cashDeposits.date, patrols.date))
    .where(and(gte(patrols.date, first.date), lt(patrols.date, tonight), sql`${cashDeposits.id} is null`))
    .groupBy(patrols.date)
    .having(sql`sum(${collections.amount}) > 0`)
    .orderBy(asc(patrols.date));
  const periodRows = await db.select({ date: payments.receivedDate }).from(payments)
    .leftJoin(cashDeposits, eq(cashDeposits.date, payments.receivedDate))
    .where(and(eq(payments.receivedBy, "collector"), isNull(payments.cancelledAt), gte(payments.receivedDate, first.date), lt(payments.receivedDate, tonight), isNull(cashDeposits.id)));
  return [...new Set([...rows, ...periodRows].map((r) => r.date))].sort();
}

/**
 * Kas satu bulan untuk admin: jumlah-jumlahnya, setoran tiap malam dibanding jimpitan yang tercatat
 * petugas malam itu, serta pemasukan lain dan pengeluaran.
 */
export async function getCashMonth(db: Db, month: string, tonight: string) {
  const days = daysInMonth(month);
  const [totals, patrolRows, depositRows, entries, undeposited, periodRows] = await Promise.all([
    cashTotals(db, month),
    listPatrols(db, days.length, month),
    db
      .select({
        date: cashDeposits.date,
        amount: cashDeposits.amount,
        note: cashDeposits.note,
        recordedByName: users.name,
        updatedAt: cashDeposits.updatedAt,
      })
      .from(cashDeposits)
      .leftJoin(users, eq(users.id, cashDeposits.recordedBy))
      .where(and(gte(cashDeposits.date, days[0]), lte(cashDeposits.date, days[days.length - 1]))),
    monthEntries(db, month),
    undepositedNights(db, tonight),
    db.select({
      id: payments.id, date: payments.receivedDate, amount: payments.amount, receivedBy: payments.receivedBy,
      periodStart: payments.periodStart, periodEnd: payments.periodEnd, houseId: payments.houseId,
    }).from(payments).where(and(isNull(payments.cancelledAt), gte(payments.receivedDate, days[0]), lte(payments.receivedDate, days[days.length - 1]))),
  ]);

  const recorded = new Map(patrolRows.map((p) => [p.date, { total: p.total, filled: p.collectedHouses }]));
  const heldByCollectors = new Map<string, number>();
  for (const p of periodRows.filter((p) => p.receivedBy === "collector")) {
    heldByCollectors.set(p.date, (heldByCollectors.get(p.date) ?? 0) + p.amount);
  }
  const deposits = new Map(depositRows.map((d) => [d.date, { ...d, updatedAt: d.updatedAt.toISOString() }]));
  // Malam yang ada uangnya atau sudah ada setorannya, terbaru dulu.
  const dates = [...new Set([...patrolRows.filter((p) => p.total > 0).map((p) => p.date), ...deposits.keys(), ...heldByCollectors.keys()])].sort().reverse();
  return {
    month,
    tonight,
    ...totals,
    nights: dates.map((date) => ({
      date,
      recorded: (recorded.get(date)?.total ?? 0) + (heldByCollectors.get(date) ?? 0),
      periodPayments: heldByCollectors.get(date) ?? 0,
      filled: recorded.get(date)?.filled ?? 0,
      deposit: deposits.get(date) ?? null,
    })),
    entries,
    directReceipts: periodRows.filter((p) => p.receivedBy === "treasurer"),
    /** Semua malam (bulan mana pun) yang belum dicatat setorannya. */
    undeposited,
  };
}

/** Ringkasan kas untuk Ringkasan admin. */
export async function getCashOverview(db: Db, tonight: string) {
  const [totals, undeposited] = await Promise.all([cashTotals(db, tonight.slice(0, 7)), undepositedNights(db, tonight)]);
  return { balance: totals.balance, undeposited: undeposited.length };
}

/**
 * Kas untuk halaman warga: saldo, jumlah bulan ini, dan rincian pemasukan lain/pengeluaran bulan ini.
 * Null kalau pengurus mematikannya atau belum ada catatan kas sama sekali.
 */
export async function getCashPublic(db: Db, tonight: string) {
  const month = tonight.slice(0, 7);
  const [[row], [anyDeposit], [anyEntry], [anyPayment]] = await Promise.all([
    db.select({ cashPublic: settings.cashPublic }).from(settings).where(eq(settings.id, 1)).limit(1),
    db.select({ id: cashDeposits.id }).from(cashDeposits).limit(1),
    db.select({ id: cashEntries.id }).from(cashEntries).limit(1),
    db.select({ id: payments.id }).from(payments).where(and(isNull(payments.cancelledAt), eq(payments.receivedBy, "treasurer"))).limit(1),
  ]);
  if (row?.cashPublic === false || (!anyDeposit && !anyEntry && !anyPayment)) return null;
  const [totals, entries] = await Promise.all([cashTotals(db, month), monthEntries(db, month)]);
  return {
    month,
    ...totals,
    // Tanpa nama pencatat.
    entries: entries.map(({ recordedByName: _name, ...e }) => e),
  };
}

export type CashMonth = Awaited<ReturnType<typeof getCashMonth>>;
export type CashPublic = NonNullable<Awaited<ReturnType<typeof getCashPublic>>>;
