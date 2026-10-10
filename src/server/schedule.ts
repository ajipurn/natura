import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { NEW_SLOT_COLOR, type GuardColor } from "@/lib/guard-color";
import { analyzeSchedule, resolveEntry, type ScheduleEntry, type SlotSource } from "@/lib/schedule";
import { houseKey } from "@/lib/site-plan";
import type { ScheduleDTO } from "@/lib/types";
import { canRonda } from "@/lib/permissions";
import type { Db, Executor, Statement } from "./db";
import { houseName } from "./house-name";
import { houses, residents, rondaSchedule, settings, users } from "./schema";
import { listResidents, setHouseResident } from "./residents";

/** Jadwal menunjuk orang; nama, alamat, dan akses akun dibaca dari relasi profilnya. */
export async function listSchedule(db: Db): Promise<ScheduleDTO[]> {
  const rows = await db.select({
    id: rondaSchedule.id,
    day: rondaSchedule.dayOfWeek,
    position: rondaSchedule.position,
    residentId: rondaSchedule.residentId,
    slotName: rondaSchedule.name,
    residentName: sql<string | null>`coalesce(${users.name}, ${residents.name})`,
    userId: residents.userId,
    userActive: sql<boolean | null>`case when ${users.role} = 'warga' then false else ${users.active} end`,
    houseId: houses.id,
    block: houses.block,
    number: houses.number,
    ownerName: houseName,
    color: rondaSchedule.color,
  }).from(rondaSchedule)
    .leftJoin(residents, eq(residents.id, rondaSchedule.residentId))
    .leftJoin(users, eq(users.id, residents.userId))
    .leftJoin(houses, eq(houses.id, sql`coalesce(${users.houseId}, ${residents.houseId}, ${rondaSchedule.houseId})`))
    .orderBy(asc(rondaSchedule.dayOfWeek), asc(rondaSchedule.position));
  return rows.map(({ slotName, residentName, block, number, ...r }) => ({
    ...r, name: residentName ?? slotName, block: block ?? "", number: number ?? "",
  }));
}

export type SlotInput = SlotSource & { day: number; color?: GuardColor | null };
/** `userId` hanya diterima untuk editor/cache versi lama, lalu diubah ke profil warga. */
export type SlotEditInput = { day: number; residentId?: number | null; userId?: number | null; houseId: number | null; name: string | null; color?: GuardColor | null };

function insertSlots(db: Executor, slots: SlotInput[]): Statement[] {
  if (!slots.length) return [];
  const counts = new Array(7).fill(0);
  return [db.insert(rondaSchedule).values(slots.map((s) => ({
    dayOfWeek: s.day, position: counts[s.day]++, residentId: s.residentId,
    houseId: s.houseId, name: s.name, color: s.color ?? null,
  })))];
}

/** Mengganti jadwal tidak menebak petugas dari rumah atau mengubah data tempat tinggal. */
export async function replaceSlots(db: Db, slots: SlotEditInput[]): Promise<string | null> {
  return db.transaction(async (tx) => {
    // Perubahan peran/pembuatan akun memakai kunci yang sama: Warga tidak dapat diberi tugas
    // dari hasil baca peran lama ketika kedua tindakan berjalan bersamaan.
    await tx.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).for("update");
    const [people, houseRows] = await Promise.all([
      listResidents(tx), tx.select({ id: houses.id }).from(houses),
    ]);
    const byId = new Map(people.map((r) => [r.id, r]));
    const byAccount = new Map(people.filter((r) => r.userId).map((r) => [r.userId!, r]));
    const knownHouses = new Set(houseRows.map((h) => h.id));
    const normalized: SlotInput[] = [];
    for (const slot of slots) {
      const person = slot.residentId ? byId.get(slot.residentId) : slot.userId ? byAccount.get(slot.userId) : undefined;
      if (((slot.residentId || slot.userId) && !person) || (slot.houseId && !knownHouses.has(slot.houseId))) {
        return "Ada warga atau rumah yang sudah tidak ada. Muat ulang halaman lalu coba lagi.";
      }
      if (person?.role && !canRonda(person.role)) return "Akun Warga tidak dapat dijadwalkan ronda.";
      normalized.push({ day: slot.day, color: slot.color, residentId: person?.id ?? null, houseId: person ? null : slot.houseId, name: person || slot.houseId ? null : slot.name });
    }
    await tx.delete(rondaSchedule);
    for (const statement of insertSlots(tx, normalized)) await statement;
    return null;
  });
}

/** Atur hari warga yang dipilih secara eksplisit; tempat tinggal tidak memengaruhi tugas. */
export function residentDaysStatements(db: Executor, residentId: number, days: number[], currentDays: number[]): Statement[] {
  const keep = [...new Set(days)];
  const statements: Statement[] = [keep.length
    ? db.delete(rondaSchedule).where(and(eq(rondaSchedule.residentId, residentId), notInArray(rondaSchedule.dayOfWeek, keep)))
    : db.delete(rondaSchedule).where(eq(rondaSchedule.residentId, residentId))];
  for (const day of keep.filter((d) => !currentDays.includes(d))) statements.push(db.insert(rondaSchedule).values({
    dayOfWeek: day,
    position: sql`(select coalesce(max(${rondaSchedule.position}), -1) + 1 from ${rondaSchedule} where ${rondaSchedule.dayOfWeek} = ${day})`,
    residentId, color: NEW_SLOT_COLOR,
  }));
  return statements;
}

/** Profil untuk akun lama harus sudah dibentuk saat setup, pembuatan akun, seed, atau migrasi. */
export async function residentIdForUser(db: Executor, userId: number): Promise<number | null> {
  const [row] = await db.select({ id: residents.id }).from(residents).where(eq(residents.userId, userId));
  return row?.id ?? null;
}

/** Malam jaga akun dibaca melalui warga yang ditugaskan. */
export async function guardDaysByUser(db: Executor): Promise<Map<number, number[]>> {
  const rows = await db.select({ userId: residents.userId, day: rondaSchedule.dayOfWeek }).from(rondaSchedule)
    .innerJoin(residents, eq(residents.id, rondaSchedule.residentId))
    .innerJoin(users, eq(users.id, residents.userId)).where(sql`${users.role} <> 'warga'`);
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
  saved: number; days: number; namesFilled: number; linked: number;
  /** Impor tidak mengubah tempat tinggal; dipertahankan untuk respons versi lama. */
  housesLinked: number;
  unknown: string[]; conflicting: string[];
};

/** Impor menghubungkan orang yang namanya cocok. Pendataan nama hanya dilakukan bila diminta. */
export async function saveSchedule(db: Db, entries: (ScheduleEntry & { color?: GuardColor | null })[], options: { fillNames: boolean; overwriteNames: boolean }): Promise<ScheduleImportSummary> {
  return db.transaction(async (tx) => {
    await tx.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).for("update");
    const houseRows = await tx.select({ id: houses.id, block: houses.block, number: houses.number, ownerName: houseName }).from(houses);
    const byKey = new Map(houseRows.map((h) => [houseKey(h), h]));
    const { unknown, conflicting, uniqueNames } = analyzeSchedule(entries, new Set(byKey.keys()));
    const peopleBefore = await listResidents(tx);
    let namesFilled = 0;
    if (options.fillNames) for (const [key, name] of uniqueNames) {
      const house = byKey.get(key);
      if (!house) continue;
      const occupants = peopleBefore.filter((r) => r.houseId === house.id);
      // Nama lain di alamat yang sama dapat berarti orang lain. Impor tidak mengganti identitas
      // profil yang sudah ada, juga tidak membuat salinan warga beralamat kosong/berbeda.
      if (occupants.length || peopleBefore.some((r) => r.name.toLowerCase() === name.toLowerCase())) continue;
      if (house.ownerName && !options.overwriteNames) continue;
      await setHouseResident(tx, house.id, name);
      namesFilled++;
    }
    const people = await listResidents(tx);
    const eligible = people.filter((r) => !r.role || (canRonda(r.role) && r.accountActive));
    const slots: SlotInput[] = [...entries].sort((a, b) => a.day - b.day || a.position - b.position)
      .map((e) => ({ day: e.day, color: e.color, ...resolveEntry(e, byKey, eligible) }));
    await tx.delete(rondaSchedule);
    for (const statement of insertSlots(tx, slots)) await statement;
    return { saved: entries.length, days: new Set(entries.map((e) => e.day)).size, namesFilled,
      linked: slots.filter((s) => s.residentId).length, housesLinked: 0, unknown, conflicting };
  });
}

/** Kondisi jadwal akun dipakai untuk otorisasi tanpa menyamakan akun dengan identitas warga. */
export function scheduledAccount(userId: number) {
  return inArray(rondaSchedule.residentId, sql`(select ${residents.id} from ${residents} where ${residents.userId} = ${userId})`);
}

export async function clearSchedule(db: Db) { await db.delete(rondaSchedule); }
