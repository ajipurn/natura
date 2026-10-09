import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { NEW_SLOT_COLOR, type GuardColor } from "@/lib/guard-color";
import { analyzeSchedule, matchGuardAccount, resolveEntry, type ScheduleEntry, type SlotSource } from "@/lib/schedule";
import { houseKey } from "@/lib/site-plan";
import type { ScheduleDTO } from "@/lib/types";
import { runBatch, type Db, type Executor, type Statement } from "./db";
import { houseName } from "./house-name";
import { houses, rondaSchedule, users } from "./schema";
import { setHouseResident } from "./residents";

/** Jadwal lengkap dengan nama dan rumah dari akun petugas atau data rumah. */
export async function listSchedule(db: Db): Promise<ScheduleDTO[]> {
  const rows = await db
    .select({
      id: rondaSchedule.id,
      day: rondaSchedule.dayOfWeek,
      position: rondaSchedule.position,
      slotName: rondaSchedule.name,
      userId: rondaSchedule.userId,
      userName: users.name,
      userActive: users.active,
      houseId: houses.id,
      block: houses.block,
      number: houses.number,
      ownerName: houseName,
      color: rondaSchedule.color,
    })
    .from(rondaSchedule)
    .leftJoin(users, eq(users.id, rondaSchedule.userId))
    // Rumah baris petugas = rumah di akunnya.
    .leftJoin(houses, eq(houses.id, sql`coalesce(${users.houseId}, ${rondaSchedule.houseId})`))
    .orderBy(asc(rondaSchedule.dayOfWeek), asc(rondaSchedule.position));
  return rows.map(({ slotName, userName, block, number, ...r }) => ({
    ...r,
    name: userName ?? slotName,
    block: block ?? "",
    number: number ?? "",
  }));
}

/** Baris jadwal yang akan disimpan; urutan dalam satu malam mengikuti urutan daftar. */
export type SlotInput = SlotSource & { day: number; color?: GuardColor | null };

function insertSlots(db: Executor, slots: SlotInput[]): Statement[] {
  if (slots.length === 0) return [];
  const counts = new Array(7).fill(0);
  const rows = slots.map((s) => ({
    dayOfWeek: s.day,
    position: counts[s.day]++,
    userId: s.userId,
    houseId: s.houseId,
    name: s.name,
    color: s.color ?? null,
  }));
  return [db.insert(rondaSchedule).values(rows)];
}

/**
 * Ganti seluruh jadwal dengan hasil edit admin. Baris rumah yang dihuni satu petugas disimpan sebagai
 * baris petugas itu. Mengembalikan pesan kesalahan kalau ada akun/rumah yang sudah tidak ada.
 */
export async function replaceSlots(db: Db, slots: SlotInput[]): Promise<string | null> {
  const [accounts, houseRows] = await Promise.all([
    db.select({ id: users.id, houseId: users.houseId }).from(users),
    db.select({ id: houses.id }).from(houses),
  ]);
  const knownUsers = new Set(accounts.map((u) => u.id));
  const knownHouses = new Set(houseRows.map((h) => h.id));
  if (slots.some((s) => (s.userId && !knownUsers.has(s.userId)) || (s.houseId && !knownHouses.has(s.houseId)))) {
    return "Ada petugas atau rumah yang sudah tidak ada. Muat ulang halaman lalu coba lagi.";
  }
  const normalized = slots.map((s) => {
    if (!s.houseId) return s;
    const residents = accounts.filter((u) => u.houseId === s.houseId);
    return residents.length === 1 ? { ...s, userId: residents[0].id, houseId: null } : s;
  });
  await runBatch(db, (tx) => [tx.delete(rondaSchedule), ...insertSlots(tx, normalized)]);
  return null;
}

/**
 * Atur malam jaga satu petugas: malam yang tidak dipilih dihapus, malam baru ditambahkan di urutan
 * terakhir. Baris jadwal rumahnya (dari sebelum rumah itu punya akun) jadi milik petugas ini kalau
 * malamnya dipilih, dan dihapus kalau tidak, supaya rumahnya tidak tercatat dua kali.
 */
export function userDaysStatements(
  db: Executor,
  userId: number,
  days: number[],
  currentDays: number[],
  houseSlots: { id: number; day: number }[] = [],
): Statement[] {
  const keep = [...new Set(days)];
  const covered = new Set(currentDays);
  const statements: Statement[] = [
    keep.length
      ? db.delete(rondaSchedule).where(and(eq(rondaSchedule.userId, userId), notInArray(rondaSchedule.dayOfWeek, keep)))
      : db.delete(rondaSchedule).where(eq(rondaSchedule.userId, userId)),
  ];
  for (const slot of houseSlots) {
    if (keep.includes(slot.day) && !covered.has(slot.day)) {
      covered.add(slot.day);
      statements.push(db.update(rondaSchedule).set({ userId, houseId: null }).where(eq(rondaSchedule.id, slot.id)));
    } else {
      statements.push(db.delete(rondaSchedule).where(eq(rondaSchedule.id, slot.id)));
    }
  }
  for (const day of keep.filter((d) => !covered.has(d))) {
    statements.push(
      db.insert(rondaSchedule).values({
        dayOfWeek: day,
        position: sql`(select coalesce(max(${rondaSchedule.position}), -1) + 1 from ${rondaSchedule} where ${rondaSchedule.dayOfWeek} = ${day})`,
        userId,
        color: NEW_SLOT_COLOR,
      }),
    );
  }
  return statements;
}

/** Baris jadwal rumah tanpa akun (belum dihubungkan ke petugas). */
export function houseSlots(db: Executor, houseId: number | null) {
  if (!houseId) return Promise.resolve([]);
  return db.select({ id: rondaSchedule.id, day: rondaSchedule.dayOfWeek }).from(rondaSchedule).where(eq(rondaSchedule.houseId, houseId));
}

/** Malam jaga tiap petugas (userId → hari-hari, urut). */
export async function guardDaysByUser(db: Executor): Promise<Map<number, number[]>> {
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
  /** Akun petugas tanpa rumah yang diisi rumahnya dari jadwal. */
  housesLinked: number;
  /** Kode rumah di jadwal yang tidak ada di data rumah, mis. "C-1". */
  unknown: string[];
  /** Rumah dengan lebih dari satu nama di jadwal, mis. "A-1 (Kantor, Eko)"; namanya tidak diisi. */
  conflicting: string[];
};

/**
 * Ganti seluruh jadwal dari hasil impor. Nama dihubungkan ke akun petugas; nama untuk rumah tanpa
 * akun bisa diisi sebagai nama KK. Nama akun petugas tidak diubah oleh impor.
 */
export async function saveSchedule(
  db: Db,
  entries: (ScheduleEntry & { color?: GuardColor | null })[],
  options: { fillNames: boolean; overwriteNames: boolean },
): Promise<ScheduleImportSummary> {
  const [houseRows, accounts] = await Promise.all([
    db.select({ id: houses.id, block: houses.block, number: houses.number, ownerName: houseName }).from(houses),
    db.select({ id: users.id, name: users.name, houseId: users.houseId }).from(users),
  ]);
  const byKey = new Map(houseRows.map((h) => [houseKey(h), h]));
  const { unknown, conflicting, uniqueNames } = analyzeSchedule(entries, new Set(byKey.keys()));

  // Akun petugas yang belum punya rumah diisi rumahnya dari jadwal (kalau rumah itu belum dihuni akun lain).
  const homed = new Map<number, number>();
  for (const e of entries) {
    const house = byKey.get(houseKey(e));
    const account = matchGuardAccount(accounts, e.name, house?.id ?? null);
    if (!house || !account || account.houseId !== null || accounts.some((a) => a.houseId === house.id)) continue;
    account.houseId = house.id;
    homed.set(account.id, house.id);
  }

  const slots: SlotInput[] = [...entries]
    .sort((a, b) => a.day - b.day || a.position - b.position)
    .map((e) => ({ day: e.day, color: e.color, ...resolveEntry(e, byKey, accounts) }));

  const withAccount = new Set(accounts.map((a) => a.houseId));
  const names: { id: number; name: string }[] = [];
  if (options.fillNames) {
    for (const [key, name] of uniqueNames) {
      const house = byKey.get(key);
      // Rumah yang dihuni petugas memakai nama akunnya.
      if (!house || withAccount.has(house.id) || house.ownerName === name) continue;
      if (house.ownerName && !options.overwriteNames) continue;
      names.push({ id: house.id, name });
    }
  }

  // Satu transaksi: semua berhasil atau semua batal.
  await db.transaction(async (tx) => {
    for (const statement of [tx.delete(rondaSchedule), ...insertSlots(tx, slots)]) await statement;
    for (const [userId, houseId] of homed) {
      await tx.update(users).set({ houseId }).where(eq(users.id, userId));
      await tx.update(houses).set({ ownerName: null }).where(eq(houses.id, houseId));
    }
    for (const n of names) await setHouseResident(tx, n.id, n.name);
  });

  return {
    saved: entries.length,
    days: new Set(entries.map((e) => e.day)).size,
    namesFilled: names.length,
    linked: slots.filter((s) => s.userId).length,
    housesLinked: homed.size,
    unknown,
    conflicting,
  };
}

export async function clearSchedule(db: Db) {
  await db.delete(rondaSchedule);
}
