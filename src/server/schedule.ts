import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { analyzeSchedule, type ScheduleEntry } from "@/lib/schedule";
import { houseKey } from "@/lib/site-plan";
import type { ScheduleDTO } from "@/lib/types";
import { getDb } from "./db";
import { houses, rondaSchedule } from "./schema";

export async function listSchedule(): Promise<ScheduleDTO[]> {
  const db = await getDb();
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
  entries: ScheduleEntry[],
  options: { fillNames: boolean; overwriteNames: boolean },
): Promise<ScheduleImportSummary> {
  const db = await getDb();
  const houseRows = await db
    .select({ id: houses.id, block: houses.block, number: houses.number, ownerName: houses.ownerName })
    .from(houses);
  const byKey = new Map(houseRows.map((h) => [houseKey(h), h]));
  const { unknown, conflicting, uniqueNames } = analyzeSchedule(entries, new Set(byKey.keys()));

  let namesFilled = 0;
  await db.transaction(async (tx) => {
    await tx.delete(rondaSchedule);
    if (entries.length > 0) {
      await tx.insert(rondaSchedule).values(
        entries.map((e) => ({ dayOfWeek: e.day, position: e.position, name: e.name, block: e.block, number: e.number })),
      );
    }
    if (!options.fillNames) return;
    for (const [key, name] of uniqueNames) {
      const house = byKey.get(key);
      if (!house || house.ownerName === name) continue;
      if (house.ownerName && !options.overwriteNames) continue;
      await tx.update(houses).set({ ownerName: name }).where(eq(houses.id, house.id));
      namesFilled++;
    }
  });

  return {
    saved: entries.length,
    days: new Set(entries.map((e) => e.day)).size,
    namesFilled,
    unknown,
    conflicting,
  };
}

export async function clearSchedule() {
  const db = await getDb();
  await db.delete(rondaSchedule);
}
