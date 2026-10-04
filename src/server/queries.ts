import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { daysInMonth, localDate, rondaDate } from "@/lib/dates";
import { compareHouses } from "@/lib/houses";
import type { CollectionDTO, HouseDTO, RondaSnapshot } from "@/lib/types";
import type { SessionUser } from "./auth";
import { getDb } from "./db";
import { collections, houses, patrols, settings, users } from "./schema";

export const DEFAULT_SETTINGS = { communityName: "Lingkungan Kita", defaultAmount: 500 };

export async function getSettings() {
  const db = await getDb();
  const [row] = await db
    .select({ communityName: settings.communityName, defaultAmount: settings.defaultAmount })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  return row ?? DEFAULT_SETTINGS;
}

export async function hasAnyUser(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

export async function listLoginUsers() {
  const db = await getDb();
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
}

export async function listUsers() {
  const db = await getDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      active: users.active,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .orderBy(asc(users.name));
}

const houseColumns = {
  id: houses.id,
  block: houses.block,
  number: houses.number,
  ownerName: houses.ownerName,
  token: houses.token,
  status: houses.status,
};

export async function listHouses(): Promise<HouseDTO[]> {
  const db = await getDb();
  const rows = await db.select(houseColumns).from(houses);
  return rows.sort(compareHouses);
}

/** Rumah beserta jumlah catatan jimpitannya (untuk tahu boleh dihapus atau tidak). */
export async function listHousesWithUsage() {
  const db = await getDb();
  const rows = await db
    .select({
      ...houseColumns,
      collectionCount: sql<number>`count(${collections.id})`.mapWith(Number),
    })
    .from(houses)
    .leftJoin(collections, eq(collections.houseId, houses.id))
    .groupBy(houses.id);
  return rows.sort(compareHouses);
}

export async function getHouseByToken(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({ ...houseColumns, createdAt: houses.createdAt })
    .from(houses)
    .where(eq(houses.token, token.toUpperCase()))
    .limit(1);
  return row ?? null;
}

async function collectionsForPatrol(patrolId: number): Promise<CollectionDTO[]> {
  const db = await getDb();
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
    .leftJoin(users, eq(users.id, collections.collectedBy))
    .where(eq(collections.patrolId, patrolId));
  return rows.map((r) => ({ ...r, recordedAt: r.recordedAt.toISOString() }));
}

export async function getCollectionsForDate(date: string): Promise<CollectionDTO[]> {
  const db = await getDb();
  const [patrol] = await db
    .select({ id: patrols.id })
    .from(patrols)
    .where(eq(patrols.date, date))
    .limit(1);
  return patrol ? collectionsForPatrol(patrol.id) : [];
}

export async function getRondaSnapshot(user: SessionUser, now = new Date()): Promise<RondaSnapshot> {
  const date = rondaDate(now);
  const [settingsRow, houseRows, collectionRows] = await Promise.all([
    getSettings(),
    listHouses(),
    getCollectionsForDate(date),
  ]);
  return {
    date,
    serverTime: now.toISOString(),
    settings: settingsRow,
    user,
    houses: houseRows,
    collections: collectionRows,
  };
}

export async function listPatrols(limit = 90) {
  const db = await getDb();
  return db
    .select({
      date: patrols.date,
      filled: sql<number>`count(${collections.id}) filter (where ${collections.status} = 'filled')`.mapWith(Number),
      empty: sql<number>`count(${collections.id}) filter (where ${collections.status} = 'empty' and ${houses.status} = 'active')`.mapWith(Number),
      total: sql<number>`coalesce(sum(${collections.amount}) filter (where ${collections.status} = 'filled'), 0)`.mapWith(Number),
      collectors: sql<string | null>`string_agg(distinct ${users.name}, ', ' order by ${users.name})`,
    })
    .from(patrols)
    .leftJoin(collections, eq(collections.patrolId, patrols.id))
    .leftJoin(houses, eq(houses.id, collections.houseId))
    .leftJoin(users, eq(users.id, collections.collectedBy))
    .groupBy(patrols.id)
    .orderBy(desc(patrols.date))
    .limit(limit);
}

/** Riwayat jimpitan satu rumah: malam-malam ronda terakhir sejak rumah didaftarkan. */
export async function getHouseHistory(house: { id: number; createdAt: Date }, limit = 30) {
  const db = await getDb();
  const rows = await db
    .select({
      date: patrols.date,
      status: collections.status,
      amount: collections.amount,
    })
    .from(patrols)
    .leftJoin(
      collections,
      and(eq(collections.patrolId, patrols.id), eq(collections.houseId, house.id)),
    )
    .where(gte(patrols.date, localDate(house.createdAt)))
    .orderBy(desc(patrols.date))
    .limit(limit);
  return rows;
}

export type MonthCell = { status: "filled" | "empty"; amount: number };

/** Data rekap bulanan: matriks rumah × tanggal ronda. */
export async function getMonthRecap(month: string) {
  const days = daysInMonth(month);
  const db = await getDb();
  const [houseRows, rows] = await Promise.all([
    listHouses(),
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
  ]);

  const dates = [...new Set(rows.map((r) => r.date))];
  const cells: Record<string, MonthCell> = {};
  for (const r of rows) {
    if (r.houseId != null && r.status != null && r.amount != null) {
      cells[`${r.houseId}:${r.date}`] = { status: r.status, amount: r.amount };
    }
  }
  return { houses: houseRows, dates, cells };
}

export async function getHousesByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db.select({ id: houses.id }).from(houses).where(inArray(houses.id, ids));
}
