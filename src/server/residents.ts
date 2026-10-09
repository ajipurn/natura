import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { Executor } from "./db";
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
  }).from(residents)
    .leftJoin(users, eq(users.id, residents.userId))
    .leftJoin(houses, eq(houses.id, residentHouse))
    .orderBy(asc(sql`coalesce(${residents.name}, ${users.name})`), asc(residents.id));
}

/** Nama utama rumah tanpa akun. Nama-nama lain dikelola satu per satu melalui Warga. */
export async function setHouseResident(db: Executor, houseId: number, name: string | null) {
  const rows = await db.select({ id: residents.id }).from(residents)
    .where(eq(residents.houseId, houseId)).orderBy(asc(residents.id));
  if (rows.length > 1) return;
  if (rows.length === 1) {
    if (name) await db.update(residents).set({ name }).where(eq(residents.id, rows[0].id));
    // Mengosongkan nama di Rumah tidak menghapus orang; lepaskan hubungan rumahnya saja.
    else await db.update(residents).set({ houseId: null }).where(eq(residents.id, rows[0].id));
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
