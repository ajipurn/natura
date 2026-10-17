import { and, asc, desc, eq, gte, inArray, isNotNull, lte, max, ne, or, sql } from "drizzle-orm";
import { daysInMonth, localDate, rondaDate, shiftMonth } from "@/lib/dates";
import type { GeoAnchor } from "@/lib/geo";
import { compareHouses } from "@/lib/houses";
import { billingPeriods, planAt, type PaymentCadence } from "@/lib/payments";
import { summarize } from "@/lib/recap";
import type { CollectionDTO, HouseDTO, MonthCell, MonthRecap, RondaSnapshot } from "@/lib/types";
import type { SessionUser } from "./auth";
import type { Db, Executor } from "./db";
import { houseName } from "./house-name";
import { guardDaysByUser, listSchedule } from "./schedule";
import { collectionLogs, collections, duesInvoices, houses, paymentPlans, payments, patrols, residenceMoves, settings, users } from "./schema";
import { getPaymentData, type PaymentData } from "./payments";
import { DEFAULT_RECORDING_WINDOW } from "@/lib/recording-window";
import { listResidents } from "./residents";
import { getDepositSubmission } from "./deposit-submissions";

export const DEFAULT_SETTINGS = { communityName: "Lingkungan Kita", defaultAmount: 500, ...DEFAULT_RECORDING_WINDOW };

/** Kolom untuk `logoUrl`, tanpa memuat gambarnya. */
export const logoColumns = { logoVersion: settings.logoVersion, hasLogo: sql<boolean>`${settings.logo} is not null` };

/** Alamat gambar logo (berganti tiap logo diganti, lihat routes/logo.ts); null = belum ada logo. */
export function logoUrl(row: { logoVersion: number; hasLogo: boolean } | undefined): string | null {
  return row?.hasLogo ? `/api/logo?v=${row.logoVersion}` : null;
}

export async function getSettings(db: Executor) {
  const [row] = await db
    .select({ communityName: settings.communityName, defaultAmount: settings.defaultAmount, recordingStart: settings.recordingStart, recordingEnd: settings.recordingEnd, ...logoColumns })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  return row ? { communityName: row.communityName, defaultAmount: row.defaultAmount, recordingStart: row.recordingStart, recordingEnd: row.recordingEnd, logoUrl: logoUrl(row) } : { ...DEFAULT_SETTINGS, logoUrl: null };
}

/** Titik acuan kalibrasi denah ↔ GPS (kosong = belum dikalibrasi). */
export async function getPlanAnchors(db: Db): Promise<GeoAnchor[]> {
  const [row] = await db.select({ anchors: settings.planAnchors }).from(settings).where(eq(settings.id, 1)).limit(1);
  return row?.anchors ?? [];
}

export async function hasAnyUser(db: Db): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

/** Akun untuk pilihan nama di halaman masuk; rumahnya ikut supaya nama kembar bisa dibedakan. */
export async function listLoginUsers(db: Db) {
  const rows = await db
    .select({ id: users.id, name: users.name, block: houses.block, number: houses.number })
    .from(users)
    .leftJoin(houses, eq(houses.id, users.houseId))
    .where(eq(users.active, true))
    .orderBy(asc(users.name), asc(users.id));
  return rows.map(({ block, number, ...u }) => ({ ...u, house: block && number ? `${block}-${number}` : null }));
}

/** Waktu terakhir tiap petugas mencatat jimpitan (scan/manual; koreksi admin tidak dihitung). */
async function lastRecordedByUser(db: Db): Promise<Map<number, Date>> {
  const rows = await db
    .select({ userId: collectionLogs.userId, last: max(collectionLogs.recordedAt) })
    .from(collectionLogs)
    .where(and(isNotNull(collectionLogs.userId), ne(collectionLogs.method, "koreksi")))
    .groupBy(collectionLogs.userId);
  return new Map(rows.flatMap((r) => (r.userId !== null && r.last ? [[r.userId, r.last] as const] : [])));
}

export async function listUsers(db: Db) {
  const [rows, days, lastRecorded] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        active: users.active,
        lockedUntil: users.lockedUntil,
        houseId: users.houseId,
        block: houses.block,
        number: houses.number,
      })
      .from(users)
      .leftJoin(houses, eq(houses.id, users.houseId))
      .orderBy(asc(users.name), asc(users.id)),
    guardDaysByUser(db),
    lastRecordedByUser(db),
  ]);
  return rows.map(({ block, number, ...u }) => ({
    ...u,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    /** Sedang terkunci karena terlalu banyak PIN salah. */
    locked: u.lockedUntil ? u.lockedUntil.getTime() > Date.now() : false,
    house: block && number ? `${block}-${number}` : null,
    /** Malam jaga di jadwal ronda (0 = Ahad). */
    days: days.get(u.id) ?? [],
    lastRecordedAt: lastRecorded.get(u.id)?.toISOString() ?? null,
  }));
}

const houseColumns = {
  id: houses.id,
  block: houses.block,
  number: houses.number,
  ownerName: houseName,
  token: houses.token,
  status: houses.status,
};

export async function listHouses(db: Executor): Promise<HouseDTO[]> {
  const rows = await db.select(houseColumns).from(houses);
  return rows.sort(compareHouses);
}

/** Rumah beserta cara pembayaran yang sedang berlaku dan jumlah catatan jimpitannya. */
export async function listHousesWithUsage(db: Db, today = localDate(new Date())) {
  const rows = await db
    .select({
      ...houseColumns,
      collectionCount: sql<number>`count(${collections.id})`.mapWith(Number),
      paymentCount: sql<number>`(select count(*) from ${payments} where ${payments.houseId} = ${houses.id})`.mapWith(Number),
      duesCount: sql<number>`(select count(*) from ${duesInvoices} where ${duesInvoices.houseId} = ${houses.id})`.mapWith(Number),
      residenceMoveCount: sql<number>`(select count(*) from ${residenceMoves} where ${residenceMoves.fromHouseId} = ${houses.id} or ${residenceMoves.toHouseId} = ${houses.id})`.mapWith(Number),
      paymentCadence: sql<PaymentCadence>`coalesce((
        select ${paymentPlans.cadence} from ${paymentPlans}
        where ${paymentPlans.houseId} = ${houses.id} and ${paymentPlans.effectiveFrom} <= ${today}
        order by ${paymentPlans.effectiveFrom} desc limit 1
      ), 'daily')`,
    })
    .from(houses)
    .leftJoin(collections, eq(collections.houseId, houses.id))
    .groupBy(houses.id);
  const people = await listResidents(db);
  return rows.sort(compareHouses).map((house) => ({
    ...house,
    residents: people.filter((r) => r.houseId === house.id).map(({ id, name, userId, familyId }) => ({ id, name, userId, familyId })),
  }));
}

export async function getHouseByToken(db: Db, token: string) {
  const [row] = await db
    .select({ ...houseColumns, createdAt: houses.createdAt })
    .from(houses)
    .where(eq(houses.token, token.toUpperCase()))
    .limit(1);
  return row ?? null;
}

export async function getCollectionsForDate(db: Db, date: string): Promise<CollectionDTO[]> {
  const rows = await db
    .select({
      houseId: collections.houseId,
      status: collections.status,
      amount: collections.amount,
      method: collections.method,
      recordedAt: collections.recordedAt,
      collectorName: users.name,
    })
    .from(collections)
    .innerJoin(patrols, eq(patrols.id, collections.patrolId))
    .leftJoin(users, eq(users.id, collections.collectedBy))
    .where(eq(patrols.date, date));
  return rows.map((r) => ({ ...r, recordedAt: r.recordedAt.toISOString() }));
}

/** Tanggal eksplisit dipakai saat antrean offline menyinkronkan malam sebelumnya. */
export async function getRondaSnapshot(db: Db, user: SessionUser, now = new Date(), date = rondaDate(now)): Promise<RondaSnapshot> {
  const days = daysInMonth(date.slice(0, 7));
  const [settingsRow, houseRows, collectionRows, schedule, planAnchors, paymentData, depositSubmission] = await Promise.all([
    getSettings(db),
    listHouses(db),
    getCollectionsForDate(db, date),
    listSchedule(db),
    getPlanAnchors(db),
    getPaymentData(db, undefined, { start: days[0] }),
    getDepositSubmission(db, date),
  ]);
  return {
    date,
    serverTime: now.toISOString(),
    settings: settingsRow,
    user,
    houses: houseRows,
    collections: collectionRows,
    schedule,
    planAnchors,
    depositSubmission,
    // Alokasi bulan ini dan pembayaran mendatang untuk pergantian periode saat HP offline.
    paymentCells: Object.fromEntries(Object.entries(paymentData.cells).filter(([key]) => key.split(":")[1] >= date.slice(0, 7) + "-01")),
    paymentPeriods: billingPeriods(paymentData.plans, paymentData.cells, paymentData.dailyCells, localDate(now), days[0], days[days.length - 1]),
    paymentPlans: paymentData.plans.map(({ id, houseId, effectiveFrom, cadence, ratePerNight, dueTiming, graceDays, weekStart }) =>
      ({ id, houseId, effectiveFrom, cadence, ratePerNight, dueTiming, graceDays, weekStart })),
  };
}

export type PatrolSummary = {
  date: string;
  filled: number;
  empty: number;
  checked: number;
  unchecked: number;
  expected: number;
  /** Rumah dengan uang yang benar-benar diambil saat ronda, untuk rincian setoran kas. */
  collectedHouses: number;
  total: number;
  collectors: string | null;
};

/** Sumber yang dibagi hanya selama satu permintaan, tanpa cache lintas perubahan data. */
type SummarySource = { houses: Promise<HouseDTO[]>; payments: Promise<PaymentData> };

/** Malam-malam ronda terbaru, atau semua malam di satu bulan ("YYYY-MM") kalau `month` diisi. */
export async function listPatrols(db: Db, limit = 90, month?: string, source?: SummarySource): Promise<PatrolSummary[]> {
  const days = month ? daysInMonth(month) : null;
  const nights = await db
    .select({ id: patrols.id, date: patrols.date })
    .from(patrols)
    .where(days ? and(gte(patrols.date, days[0]), lte(patrols.date, days[days.length - 1])) : undefined)
    .orderBy(desc(patrols.date))
    .limit(days ? days.length : limit);
  if (!nights.length) return [];
  const [houseRows, collectionRows, paymentData] = await Promise.all([
    source?.houses ?? listHouses(db),
    db.select({
      patrolId: collections.patrolId,
      houseId: collections.houseId,
      status: collections.status,
      amount: collections.amount,
      collectorName: users.name,
    }).from(collections).leftJoin(users, eq(users.id, collections.collectedBy))
      .where(inArray(collections.patrolId, nights.map((p) => p.id))),
    source?.payments ?? getPaymentData(db),
  ]);
  const byNight = new Map<number, typeof collectionRows>();
  for (const row of collectionRows) {
    const entries = byNight.get(row.patrolId) ?? [];
    entries.push(row);
    byNight.set(row.patrolId, entries);
  }
  const periods = billingPeriods(paymentData.plans, paymentData.cells, paymentData.dailyCells,
    localDate(new Date()), nights[nights.length - 1].date, nights[0].date);
  return nights.map((night) => {
    const entries = byNight.get(night.id) ?? [];
    // Aturan yang sama dengan detail malam: periode dibayar = ada, belum dibayar = kosong.
    const summary = summarize(houseRows, entries, periods.filter((p) => p.start <= night.date && p.end >= night.date));
    return {
      date: night.date,
      filled: summary.filled.length,
      empty: summary.empty.length,
      checked: summary.checked,
      unchecked: summary.unchecked.length,
      expected: summary.expected,
      collectedHouses: entries.filter((c) => c.status === "filled").length,
      total: summary.total,
      collectors: summary.collectors.length ? summary.collectors.join(", ") : null,
    };
  });
}

/**
 * Riwayat jimpitan satu rumah: malam-malam ronda terakhir sejak rumah didaftarkan,
 * juga catatan yang diisi admin untuk tanggal sebelum rumah didaftarkan.
 * Pakai tanggal malam ronda, supaya rumah yang didaftarkan pagi hari tetap ikut malam sebelumnya.
 * Kalender warga dapat memilih bulan beserta dua bulan sebelumnya, tanpa terpotong riwayat terbaru.
 */
export async function getHouseHistory(db: Db, house: { id: number; createdAt: Date }, limit = 30, month?: string) {
  const days = month ? daysInMonth(month) : undefined;
  return db
    .select({
      date: patrols.date,
      status: collections.status,
      amount: collections.amount,
    })
    .from(patrols)
    .leftJoin(collections, and(eq(collections.patrolId, patrols.id), eq(collections.houseId, house.id)))
    .where(month && days
      ? and(gte(patrols.date, daysInMonth(shiftMonth(month, -2))[0]), lte(patrols.date, days[days.length - 1]))
      : or(gte(patrols.date, rondaDate(house.createdAt)), isNotNull(collections.id)))
    .orderBy(desc(patrols.date))
    .limit(limit);
}

/** Data rekap bulanan: matriks rumah × tanggal ronda. */
export async function getMonthRecap(db: Db, month: string, source?: SummarySource): Promise<MonthRecap> {
  const days = daysInMonth(month);
  const [houseRows, rows, paymentData] = await Promise.all([
    source?.houses ?? listHouses(db),
    db
      .select({
        date: patrols.date,
        houseId: collections.houseId,
        status: collections.status,
        amount: collections.amount,
      })
      .from(patrols)
      .leftJoin(collections, eq(collections.patrolId, patrols.id))
      .where(and(gte(patrols.date, days[0]), lte(patrols.date, days[days.length - 1])))
      .orderBy(asc(patrols.date)),
    source?.payments ?? getPaymentData(db, undefined, { start: days[0], end: days[days.length - 1] }),
  ]);

  const dates = [...new Set(rows.map((r) => r.date))];
  const cells: Record<string, MonthCell> = {};
  for (const r of rows) {
    if (r.houseId != null && r.status != null && r.amount != null) {
      cells[`${r.houseId}:${r.date}`] = { status: r.status, amount: r.amount };
    }
  }
  return {
    month, houses: houseRows, dates, cells,
    paymentCadences: Object.fromEntries(houseRows.map((h) => [h.id,
      days.map((date) => planAt(paymentData.plans, h.id, date)?.cadence ?? "daily")
        .filter((cadence, i, cadences) => cadence !== cadences[i - 1]),
    ])),
    paymentCells: Object.fromEntries(Object.entries(paymentData.cells).filter(([key]) => key.split(":")[1].startsWith(month))),
    paymentPeriods: billingPeriods(paymentData.plans, paymentData.cells, paymentData.dailyCells, localDate(new Date()), days[0], days[days.length - 1]),
    periodPayments: paymentData.receipts.filter((p) => p.periodStart <= days[days.length - 1] && p.periodEnd >= days[0])
      .map(({ id, houseId, receivedDate, periodStart, periodEnd, cadence, amount, allocations }) => ({ id, houseId, receivedDate, periodStart, periodEnd, cadence, amount, allocations })),
  };
}

/** Id semua rumah yang terdaftar (jumlahnya kecil, jadi lebih murah daripada query per id). */
export async function getHouseIds(db: Db): Promise<Set<number>> {
  const rows = await db.select({ id: houses.id }).from(houses);
  return new Set(rows.map((r) => r.id));
}
