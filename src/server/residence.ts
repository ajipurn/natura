import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Executor } from "./db";
import { accountNameTaken, accountNameTakenError } from "./residents";
import { houseSlots, userDaysStatements } from "./schedule";
import {
  families,
  residenceMoves,
  residents,
  rondaSchedule,
  users,
} from "./schema";

/** Perpindahan selalu memperbarui sumber rumah yang sama dengan akun dan jadwal. Panggil dalam transaksi. */
export async function moveResident(
  db: Executor,
  residentId: number,
  houseId: number | null,
  actorId: number | null,
  date: string,
  movingFamilyId?: number,
  newName?: string,
) {
  const [profile] = await db
    .select()
    .from(residents)
    .where(eq(residents.id, residentId))
    .for("update");
  if (!profile)
    throw new HTTPException(404, { message: "Warga tidak ditemukan." });
  const [account] = profile.userId
    ? await db
        .select()
        .from(users)
        .where(eq(users.id, profile.userId))
        .for("update")
    : [];
  const previousHouseId = account?.houseId ?? profile.houseId;
  const name = newName ?? account?.name ?? profile.name!;
  if (account && (await accountNameTaken(db, name, houseId, account.id)))
    throw new HTTPException(409, { message: accountNameTakenError(name) });
  if (previousHouseId === houseId) return;
  if (profile.residentSince && date < profile.residentSince)
    throw new HTTPException(400, {
      message: "Tanggal pindah harus setelah tanggal mulai tinggal sebelumnya.",
    });
  if (profile.familyId && profile.familyId !== movingFamilyId) {
    const [family] = await db
      .select()
      .from(families)
      .where(eq(families.id, profile.familyId));
    if (family?.headResidentId === residentId)
      throw new HTTPException(409, {
        message:
          "Pindahkan kepala dan anggota keluarga bersama melalui tab Keluarga di Warga.",
      });
    await db
      .update(residents)
      .set({ familyId: null, familyRelation: null })
      .where(eq(residents.id, residentId));
  }
  if (account) {
    const current = await db
      .selectDistinct({ day: rondaSchedule.dayOfWeek })
      .from(rondaSchedule)
      .where(eq(rondaSchedule.userId, account.id));
    const slots = await houseSlots(db, houseId);
    const days = current.map((row) => row.day);
    for (const statement of userDaysStatements(
      db,
      account.id,
      [...days, ...slots.map((slot) => slot.day)],
      days,
      slots,
    ))
      await statement;
    await db.update(users).set({ houseId }).where(eq(users.id, account.id));
  } else
    await db
      .update(residents)
      .set({ houseId })
      .where(eq(residents.id, residentId));
  await db
    .update(residents)
    .set({ residentSince: houseId ? date : null })
    .where(eq(residents.id, residentId));
  await db
    .insert(residenceMoves)
    .values({
      residentId,
      fromHouseId: previousHouseId,
      toHouseId: houseId,
      date,
      recordedBy: actorId,
    });
}

export async function residenceHistory(db: Executor, residentId: number) {
  return db
    .select()
    .from(residenceMoves)
    .where(eq(residenceMoves.residentId, residentId))
    .orderBy(asc(residenceMoves.date), asc(residenceMoves.id));
}
