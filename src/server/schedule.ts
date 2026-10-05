import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { GuardColor } from "@/lib/guard-color";
import { analyzeSchedule, guardName, matchGuardAccount, type ScheduleEntry } from "@/lib/schedule";
import { houseKey } from "@/lib/site-plan";
import type { ScheduleDTO } from "@/lib/types";
import { chunk, rowsPerInsert, runBatch, type Db } from "./db";
import { houses, rondaSchedule, users } from "./schema";

type Statement = BatchItem<"sqlite">;

export async function listSchedule(db: Db): Promise<ScheduleDTO[]> {
  const rows = await db
    .select({
      id: rondaSchedule.id,
      day: rondaSchedule.dayOfWeek,
      position: rondaSchedule.position,
      slotName: rondaSchedule.name,
      block: rondaSchedule.block,
      number: rondaSchedule.number,
      houseId: houses.id,
      ownerName: houses.ownerName,
      userId: rondaSchedule.userId,
      userName: users.name,
      userActive: users.active,
      color: rondaSchedule.color,
    })
    .from(rondaSchedule)
    .leftJoin(houses, and(eq(houses.block, rondaSchedule.block), eq(houses.number, rondaSchedule.number)))
    .leftJoin(users, eq(users.id, rondaSchedule.userId))
    .orderBy(asc(rondaSchedule.dayOfWeek), asc(rondaSchedule.position));
  return rows.map(({ slotName, userName, ...r }) => ({ ...r, name: guardName(userName ?? slotName, r) }));
}

/** Baris jadwal yang akan disimpan; urutan dalam satu malam mengikuti urutan daftar. */
export type SlotInput = {
  day: number;
  name: string | null;
  block: string;
  number: string;
  userId: number | null;
  color?: GuardColor | null;
};

function insertSlots(db: Db, slots: SlotInput[]): Statement[] {
  const counts = new Array(7).fill(0);
  const rows = slots.map((s) => ({
    dayOfWeek: s.day,
    position: counts[s.day]++,
    name: s.name,
    block: s.block,
    number: s.number,
    userId: s.userId,
    color: s.color ?? null,
  }));
  return chunk(rows, rowsPerInsert(7)).map((part) => db.insert(rondaSchedule).values(part));
}

/** Ganti seluruh jadwal dengan hasil edit admin. Mengembalikan id akun yang tidak dikenal (kalau ada). */
export async function replaceSlots(db: Db, slots: SlotInput[]): Promise<number[]> {
  const ids = [...new Set(slots.flatMap((s) => (s.userId ? [s.userId] : [])))];
  const known = new Set((await db.select({ id: users.id }).from(users)).map((u) => u.id));
  const unknownUsers = ids.filter((id) => !known.has(id));
  if (unknownUsers.length === 0) await runBatch(db, [db.delete(rondaSchedule), ...insertSlots(db, slots)]);
  return unknownUsers;
}

/**
 * Atur malam jaga satu petugas: malam yang tidak dipilih dihapus, malam baru ditambahkan di urutan
 * terakhir. Kalau `house` diisi, semua baris jadwalnya ikut memakai rumah itu.
 */
export function userDaysStatements(
  db: Db,
  userId: number,
  days: number[],
  house: { block: string; number: string } | null,
  currentDays: number[],
): Statement[] {
  const keep = [...new Set(days)];
  const statements: Statement[] = [
    keep.length
      ? db.delete(rondaSchedule).where(and(eq(rondaSchedule.userId, userId), notInArray(rondaSchedule.dayOfWeek, keep)))
      : db.delete(rondaSchedule).where(eq(rondaSchedule.userId, userId)),
  ];
  if (house) {
    statements.push(
      db.update(rondaSchedule).set({ block: house.block, number: house.number }).where(eq(rondaSchedule.userId, userId)),
    );
  }
  for (const day of keep.filter((d) => !currentDays.includes(d))) {
    statements.push(
      db.insert(rondaSchedule).values({
        dayOfWeek: day,
        position: sql`(select coalesce(max(${rondaSchedule.position}), -1) + 1 from ${rondaSchedule} where ${rondaSchedule.dayOfWeek} = ${day})`,
        name: null,
        block: house?.block ?? "",
        number: house?.number ?? "",
        userId,
      }),
    );
  }
  return statements;
}

/** Malam jaga tiap petugas (userId → hari-hari, urut). */
export async function guardDaysByUser(db: Db): Promise<Map<number, number[]>> {
  const rows = await db
    .select({ userId: rondaSchedule.userId, day: rondaSchedule.dayOfWeek })
    .from(rondaSchedule)
    .where(sql`${rondaSchedule.userId} is not null`);
  const map = new Map<number, number[]>();
  for (const r of rows) {
    const list = map.get(r.userId!) ?? [];
    if (!list.includes(r.day)) list.push(r.day);
    map.set(r.userId!, list);
  }
  for (const list of map.values()) list.sort((a, b) => a - b);
  return map;
}

export type ScheduleImportSummary = {
  saved: number;
  days: number;
  namesFilled: number;
  /** Nama di jadwal yang terhubung ke akun petugas. */
  linked: number;
  /** Kode rumah di jadwal yang tidak ada di data rumah, mis. "C-1". */
  unknown: string[];
  /** Rumah dengan lebih dari satu nama di jadwal, mis. "A-1 (Kantor, Eko)"; namanya tidak diisi. */
  conflicting: string[];
};

/** Ganti seluruh jadwal dari hasil impor; nama dihubungkan ke akun petugas, dan nama KK bisa ikut diisi. */
export async function saveSchedule(
  db: Db,
  entries: (ScheduleEntry & { color?: GuardColor | null })[],
  options: { fillNames: boolean; overwriteNames: boolean },
): Promise<ScheduleImportSummary> {
  const [houseRows, accounts] = await Promise.all([
    db.select({ id: houses.id, block: houses.block, number: houses.number, ownerName: houses.ownerName }).from(houses),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const byKey = new Map(houseRows.map((h) => [houseKey(h), h]));
  const { unknown, conflicting, uniqueNames } = analyzeSchedule(entries, new Set(byKey.keys()));

  const slots: SlotInput[] = [...entries]
    .sort((a, b) => a.day - b.day || a.position - b.position)
    .map(({ cell: _cell, ...e }) => ({ ...e, userId: matchGuardAccount(accounts, e)?.id ?? null }));

  // Satu batch D1 = semua berhasil atau semua batal, seperti transaksi.
  const statements: Statement[] = [db.delete(rondaSchedule), ...insertSlots(db, slots)];
  const names: { id: number; name: string }[] = [];
  if (options.fillNames) {
    for (const [key, name] of uniqueNames) {
      const house = byKey.get(key);
      if (!house || house.ownerName === name) continue;
      if (house.ownerName && !options.overwriteNames) continue;
      names.push({ id: house.id, name });
    }
  }
  // Satu UPDATE untuk banyak rumah (CASE id ...), 3 parameter per rumah.
  for (const part of chunk(names, rowsPerInsert(3))) {
    const cases = sql.join(
      part.map((n) => sql`when ${n.id} then ${n.name}`),
      sql` `,
    );
    statements.push(
      db
        .update(houses)
        .set({ ownerName: sql`case ${houses.id} ${cases} end` })
        .where(inArray(houses.id, part.map((n) => n.id))),
    );
  }
  await runBatch(db, statements);

  return {
    saved: entries.length,
    days: new Set(entries.map((e) => e.day)).size,
    namesFilled: names.length,
    linked: slots.filter((s) => s.userId).length,
    unknown,
    conflicting,
  };
}

export async function clearSchedule(db: Db) {
  await db.delete(rondaSchedule);
}
