import { and, asc, desc, eq, gte, isNotNull, lte, max, ne, or, sql } from "drizzle-orm";
import { daysInMonth, rondaDate } from "@/lib/dates";
import type { GeoAnchor } from "@/lib/geo";
import { compareHouses } from "@/lib/houses";
import type { CollectionDTO, HouseDTO, MonthCell, MonthRecap, RondaSnapshot } from "@/lib/types";
import type { SessionUser } from "./auth";
import type { Db } from "./db";
import { houseName } from "./house-name";
import { guardDaysByUser, listSchedule } from "./schedule";
import { collectionLogs, collections, houses, payments, patrols, settings, users } from "./schema";
import { getPaymentMonth } from "./payments";

export const DEFAULT_SETTINGS = { communityName: "Lingkungan Kita", defaultAmount: 500 };

/** Kolom untuk `logoUrl`, tanpa memuat gambarnya. */
export const logoColumns = { logoVersion: settings.logoVersion, hasLogo: sql<boolean>`${settings.logo} is not null` };

/** Alamat gambar logo (berganti tiap logo diganti, lihat routes/logo.ts); null = belum ada logo. */
export function logoUrl(row: { logoVersion: number; hasLogo: boolean } | undefined): string | null {
  return row?.hasLogo ? `/api/logo?v=${row.logoVersion}` : null;
}

export async function getSettings(db: Db) {
  const [row] = await db
    .select({ communityName: settings.communityName, defaultAmount: settings.defaultAmount, ...logoColumns })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  return row ? { communityName: row.communityName, defaultAmount: row.defaultAmount, logoUrl: logoUrl(row) } : { ...DEFAULT_SETTINGS, logoUrl: null };
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

export async function listHouses(db: Db): Promise<HouseDTO[]> {
  const rows = await db.select(houseColumns).from(houses);
  return rows.sort(compareHouses);
}

/** Rumah beserta jumlah catatan jimpitannya (untuk tahu boleh dihapus atau tidak). */
export async function listHousesWithUsage(db: Db) {
  const rows = await db
    .select({
      ...houseColumns,
      collectionCount: sql<number>`count(${collections.id})`.mapWith(Number),
      paymentCount: sql<number>`(select count(*) from ${payments} where ${payments.houseId} = ${houses.id})`.mapWith(Number),
    })
    .from(houses)
    .leftJoin(collections, eq(collections.houseId, houses.id))
    .groupBy(houses.id);
  return rows.sort(compareHouses);
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

export async function getRondaSnapshot(db: Db, user: SessionUser, now = new Date()): Promise<RondaSnapshot> {
  const date = rondaDate(now);
  const [settingsRow, houseRows, collectionRows, schedule, planAnchors, paymentData] = await Promise.all([
    getSettings(db),
    listHouses(db),
    getCollectionsForDate(db, date),
    listSchedule(db),
    getPlanAnchors(db),
    getPaymentMonth(db, date.slice(0, 7)),
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
    paymentCells: Object.fromEntries(Object.entries(paymentData.cells).filter(([key]) => key.endsWith(":" + date))),
    paymentPeriods: paymentData.bills.filter((b) => b.start <= date && b.end >= date),
  };
}

export type PatrolSummary = {
  date: string;
  filled: number;
  empty: number;
  total: number;
  collectors: string | null;
};

/** Malam-malam ronda terbaru, atau semua malam di satu bulan ("YYYY-MM") kalau `month` diisi. */
export async function listPatrols(db: Db, limit = 90, month?: string): Promise<PatrolSummary[]> {
  const days = month ? daysInMonth(month) : null;
  const rows = await db
    .select({
      date: patrols.date,
      filled: sql<number>`count(${collections.id}) filter (where ${collections.status} = 'filled')`.mapWith(Number),
      empty: sql<number>`count(${collections.id}) filter (where ${collections.status} = 'empty' and ${houses.status} = 'active')`.mapWith(Number),
      total: sql<number>`coalesce(sum(${collections.amount}) filter (where ${collections.status} = 'filled'), 0)`.mapWith(Number),
      // Array JSON supaya nama yang mengandung koma tetap utuh.
      collectors: sql<string[] | null>`json_agg(distinct ${users.name}) filter (where ${users.name} is not null)`,
    })
    .from(patrols)
    .leftJoin(collections, eq(collections.patrolId, patrols.id))
    .leftJoin(houses, eq(houses.id, collections.houseId))
    .leftJoin(users, eq(users.id, collections.collectedBy))
    .where(days ? and(gte(patrols.date, days[0]), lte(patrols.date, days[days.length - 1])) : undefined)
    .groupBy(patrols.id)
    .orderBy(desc(patrols.date))
    .limit(days ? days.length : limit);
  return rows.map((r) => {
    const names = [...(r.collectors ?? [])].sort((a, b) => a.localeCompare(b, "id"));
    return { ...r, collectors: names.length ? names.join(", ") : null };
  });
}

/**
 * Riwayat jimpitan satu rumah: malam-malam ronda terakhir sejak rumah didaftarkan,
 * juga catatan yang diisi admin untuk tanggal sebelum rumah didaftarkan.
 * Pakai tanggal malam ronda, supaya rumah yang didaftarkan pagi hari tetap ikut malam sebelumnya.
 */
export async function getHouseHistory(db: Db, house: { id: number; createdAt: Date }, limit = 30) {
  return db
    .select({
      date: patrols.date,
      status: collections.status,
      amount: collections.amount,
    })
    .from(patrols)
    .leftJoin(collections, and(eq(collections.patrolId, patrols.id), eq(collections.houseId, house.id)))
    .where(or(gte(patrols.date, rondaDate(house.createdAt)), isNotNull(collections.id)))
    .orderBy(desc(patrols.date))
    .limit(limit);
}

/** Data rekap bulanan: matriks rumah × tanggal ronda. */
export async function getMonthRecap(db: Db, month: string): Promise<MonthRecap> {
  const days = daysInMonth(month);
  const [houseRows, rows, paymentData] = await Promise.all([
    listHouses(db),
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
    getPaymentMonth(db, month),
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
    paymentCells: Object.fromEntries(Object.entries(paymentData.cells).filter(([key]) => key.split(":")[1].startsWith(month))),
    paymentPeriods: paymentData.bills,
    periodPayments: paymentData.receipts.filter((p) => p.periodStart <= days[days.length - 1] && p.periodEnd >= days[0])
      .map(({ id, houseId, receivedDate, periodStart, periodEnd, cadence, amount }) => ({ id, houseId, receivedDate, periodStart, periodEnd, cadence, amount })),
  };
}

/** Id semua rumah yang terdaftar (jumlahnya kecil, jadi lebih murah daripada query per id). */
export async function getHouseIds(db: Db): Promise<Set<number>> {
  const rows = await db.select({ id: houses.id }).from(houses);
  return new Set(rows.map((r) => r.id));
}
