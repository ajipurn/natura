import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Executor } from "./db";
import { localDate } from "@/lib/dates";
import { moveResident } from "./residence";
import { houses, residents, users } from "./schema";

const residentHouse = sql<number | null>`coalesce(${residents.houseId}, ${users.houseId})`;

/** Nama/rumah akun tetap satu sumber; nomor telepon hanya tersedia bagi admin. */
export async function listResidents(db: Executor) {
  return db.select({
    id: residents.id,
    name: sql<string>`coalesce(${residents.name}, ${users.name})`,
    phone: residents.phone,
    houseId: residentHouse,
    block: houses.block,
    number: houses.number,
    userId: residents.userId,
    role: users.role,
    accountActive: users.active,
    familyId: residents.familyId,
    familyRelation: residents.familyRelation,
    housingStatus: residents.housingStatus,
    residentSince: residents.residentSince,
  }).from(residents)
    .leftJoin(users, eq(users.id, residents.userId))
    .leftJoin(houses, eq(houses.id, residentHouse))
    .orderBy(asc(sql`coalesce(${residents.name}, ${users.name})`), asc(residents.id));
}

/** Pilihan penghuni tunggal di Rumah mengubah relasi, bukan nama. Panggil dalam transaksi. */
export async function selectHouseResident(
  db: Executor,
  houseId: number,
  residentId: number | null,
  previousResidentId: number | null,
  actorId: number,
) {
  const ids = [residentId, previousResidentId].filter((id): id is number => id !== null);
  if (ids.length) await db.select({ id: residents.id }).from(residents)
    .where(inArray(residents.id, ids)).orderBy(asc(residents.id)).for("update");
  const people = await listResidents(db);
  const current = people.filter((person) => person.houseId === houseId);
  const selected = residentId === null ? null : people.find((person) => person.id === residentId);
  if (residentId !== null && !selected) throw new HTTPException(404, { message: "Warga tidak ditemukan." });
  if (current.length > 1 || (current[0]?.id ?? null) !== previousResidentId) {
    throw new HTTPException(409, { message: "Penghuni rumah sudah berubah. Muat ulang sebelum memilih warga." });
  }
  if (residentId === previousResidentId) return;
  if (current[0]?.familyId || selected?.familyId) {
    throw new HTTPException(409, { message: "Kelola perpindahan penghuni yang terhubung keluarga melalui menu Warga." });
  }
  const date = localDate(new Date());
  if (current[0]) await moveResident(db, current[0].id, null, actorId, date);
  if (selected) await moveResident(db, selected.id, houseId, actorId, date);
  await db.update(houses).set({ ownerName: null }).where(eq(houses.id, houseId));
}

/** Nama utama rumah tanpa akun. Nama-nama lain dikelola satu per satu melalui Warga. */
export async function setHouseResident(db: Executor, houseId: number, name: string | null, actorId: number | null = null) {
  const rows = await db.select({ id: residents.id }).from(residents)
    .where(eq(residents.houseId, houseId)).orderBy(asc(residents.id));
  if (rows.length > 1) return;
  if (rows.length === 1) {
    if (name) await db.update(residents).set({ name }).where(eq(residents.id, rows[0].id));
    // Mengosongkan nama di Rumah tidak menghapus orang; lepaskan hubungan rumahnya saja.
    else await moveResident(db, rows[0].id, null, actorId, localDate(new Date()));
  } else if (name) {
    await db.insert(residents).values({ name, houseId });
  }
  await db.update(houses).set({ ownerName: null }).where(eq(houses.id, houseId));
}

/** Impor/seed lama masih bisa menyediakan nama rumah. Pindahkan ke profil tanpa membuat salinan. */
export async function adoptLegacyResidents(db: Executor) {
  await db.execute(sql`insert into residents (user_id, created_at)
    select id, created_at from users on conflict (user_id) do nothing`);
  await db.execute(sql`insert into residents (name, house_id, created_at)
    select trim(h.owner_name), h.id, h.created_at from houses h
    where nullif(trim(h.owner_name), '') is not null
    and not exists (select 1 from users u where u.house_id = h.id)
    and not exists (select 1 from residents r where r.house_id = h.id)`);
  await db.execute(sql`update houses set owner_name = null where owner_name is not null`);
}

/** Aturan nama akun: nama kembar memerlukan rumah yang berbeda. */
export async function accountNameTaken(db: Executor, name: string, houseId: number | null, exceptId?: number) {
  const rows = await db.select({ id: users.id }).from(users).where(and(
    sql`lower(${users.name}) = lower(${name})`,
    houseId ? or(eq(users.houseId, houseId), isNull(users.houseId)) : undefined,
    exceptId ? ne(users.id, exceptId) : undefined,
  )).limit(1);
  return rows.length > 0;
}

export const accountNameTakenError = (name: string) => `Nama "${name}" sudah dipakai. Nama kembar boleh asal rumahnya diisi dan berbeda.`;
