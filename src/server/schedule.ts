import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { analyzeSchedule, type ScheduleEntry } from "@/lib/schedule";
import { houseKey } from "@/lib/site-plan";
import type { ScheduleDTO } from "@/lib/types";
import { chunk, rowsPerInsert, type Db } from "./db";
import { houses, rondaSchedule } from "./schema";

export async function listSchedule(db: Db): Promise<ScheduleDTO[]> {
  return db
    .select({
      day: rondaSchedule.dayOfWeek,
      position: rondaSchedule.position,
      name: rondaSchedule.name,
      block: rondaSchedule.block,
      number: rondaSchedule.number,
      houseId: houses.id,
      ownerName: houses.ownerName,
    })
    .from(rondaSchedule)
    .leftJoin(houses, and(eq(houses.block, rondaSchedule.block), eq(houses.number, rondaSchedule.number)))
    .orderBy(asc(rondaSchedule.dayOfWeek), asc(rondaSchedule.position));
}

export type ScheduleImportSummary = {
  saved: number;
  days: number;
  namesFilled: number;
  /** Kode rumah di jadwal yang tidak ada di data rumah, mis. "C-1". */
  unknown: string[];
  /** Rumah dengan lebih dari satu nama di jadwal, mis. "A-1 (Kantor, Eko)"; namanya tidak diisi. */
  conflicting: string[];
};

/** Ganti seluruh jadwal; kalau diminta, isi nama KK dari jadwal. */
export async function saveSchedule(
  db: Db,
  entries: ScheduleEntry[],
  options: { fillNames: boolean; overwriteNames: boolean },
): Promise<ScheduleImportSummary> {
  const houseRows = await db
    .select({ id: houses.id, block: houses.block, number: houses.number, ownerName: houses.ownerName })
    .from(houses);
  const byKey = new Map(houseRows.map((h) => [houseKey(h), h]));
  const { unknown, conflicting, uniqueNames } = analyzeSchedule(entries, new Set(byKey.keys()));

  // Satu batch D1 = semua berhasil atau semua batal, seperti transaksi.
  const statements: BatchItem<"sqlite">[] = [db.delete(rondaSchedule)];
  for (const part of chunk(entries, rowsPerInsert(5))) {
    statements.push(
      db
        .insert(rondaSchedule)
        .values(part.map((e) => ({ dayOfWeek: e.day, position: e.position, name: e.name, block: e.block, number: e.number }))),
    );
  }
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
  const namesFilled = names.length;
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  return {
    saved: entries.length,
    days: new Set(entries.map((e) => e.day)).size,
    namesFilled,
    unknown,
    conflicting,
  };
}

export async function clearSchedule(db: Db) {
  await db.delete(rondaSchedule);
}
