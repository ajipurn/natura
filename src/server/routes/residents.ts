import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { requireResource } from "../auth";
import type { AppEnv } from "../env";
import { body, idParam } from "../http";
import { accountNameTaken, accountNameTakenError, listResidents } from "../residents";
import { isIsoDate, localDate } from "@/lib/dates";
import type { Tx } from "../db";
import { moveResident, residenceHistory } from "../residence";
import { families, houses, residents, residenceMoves, rondaSchedule, users } from "../schema";

const residentSchema = z.object({
  name: z.string().trim().min(1, "Isi nama warga.").max(100, "Nama maksimal 100 karakter."),
  houseId: z.number().int().positive().nullable().default(null),
  phone: z.string().trim().max(25, "Nomor telepon maksimal 25 karakter.")
    .refine((v) => !v || /^\+?[\d ()-]{6,25}$/.test(v), "Isi nomor telepon yang valid.")
    .optional().transform((v) => v || null),
  housingStatus: z.enum(["unknown", "owner", "tenant", "family", "other"]).optional(),
  residentSince: z.string().refine((v) => isIsoDate(v) && v <= localDate(new Date()), "Isi tanggal mulai tinggal yang sudah berlangsung.").nullable().optional(),
  familyId: z.number().int().positive().nullable().optional(),
  familyRelation: z.enum(["head", "spouse", "child", "parent", "other"]).nullable().optional(),
});

export const residentRoutes = new Hono<AppEnv>()
  .use(requireResource("residents"))
  .get("/", async (c) => c.json({ residents: await listResidents(c.var.db) }))
  .post("/", body(residentSchema), async (c) => {
    const input = c.req.valid("json");
    if (input.houseId !== null) {
      const [house] = await c.var.db.select({ id: houses.id }).from(houses).where(eq(houses.id, input.houseId));
      if (!house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
    }
    const resident = await c.var.db.transaction(async (tx) => {
      const [saved] = await tx.insert(residents).values({ name: input.name, phone: input.phone, houseId: input.houseId,
        housingStatus: input.housingStatus, residentSince: input.houseId ? input.residentSince : null,
      }).returning({ id: residents.id });
      await setFamily(tx, saved.id, input.houseId, input.familyId ?? null, input.familyRelation);
      if (input.houseId) await tx.insert(residenceMoves).values({ residentId: saved.id, toHouseId: input.houseId, date: input.residentSince ?? localDate(new Date()), recordedBy: c.var.user.id });
      return saved;
    });
    return c.json({ success: "Warga ditambahkan.", id: resident.id });
  })
  .patch("/:id", idParam(), body(residentSchema), async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    return c.var.db.transaction(async (tx) => {
      const [resident] = await tx.select().from(residents).where(eq(residents.id, id)).for("update");
      if (!resident) return c.json({ error: "Warga tidak ditemukan." }, 404);
      if (input.houseId !== null) {
        const [house] = await tx.select({ id: houses.id }).from(houses).where(eq(houses.id, input.houseId));
        if (!house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
      }
      if (resident.userId !== null) {
        if (input.name.length > 40) return c.json({ error: "Nama akun petugas maksimal 40 karakter." }, 400);
        if (await accountNameTaken(tx, input.name, input.houseId, resident.userId)) {
          return c.json({ error: accountNameTakenError(input.name) }, 409);
        }
        await moveResident(tx, id, input.houseId, c.var.user.id, input.residentSince ?? localDate(new Date()), undefined, input.name);
        await tx.update(users).set({ name: input.name, houseId: input.houseId }).where(eq(users.id, resident.userId));
        await tx.update(residents).set({ phone: input.phone }).where(eq(residents.id, id));
      } else {
        await moveResident(tx, id, input.houseId, c.var.user.id, input.residentSince ?? localDate(new Date()));
        await tx.update(residents).set({ name: input.name, phone: input.phone }).where(eq(residents.id, id));
      }
      if (input.familyId !== undefined) await setFamily(tx, id, input.houseId, input.familyId, input.familyRelation);
      if (input.housingStatus !== undefined || input.residentSince !== undefined) {
        await tx.update(residents).set({ housingStatus: input.housingStatus,
          ...(input.residentSince !== undefined && { residentSince: input.houseId ? input.residentSince : null }),
        }).where(eq(residents.id, id));
      }
      return c.json({ success: "Data warga disimpan." });
    });
  })
  .delete("/:id", idParam(), async (c) => {
    const { id } = c.req.valid("param");
    const [head] = await c.var.db.select({ id: families.id }).from(families).where(eq(families.headResidentId, id));
    if (head) return c.json({ error: "Ganti kepala keluarga atau hapus kelompok keluarganya dahulu." }, 409);
    const [scheduled] = await c.var.db.select({ id: rondaSchedule.id }).from(rondaSchedule).where(eq(rondaSchedule.residentId, id)).limit(1);
    if (scheduled) return c.json({ error: "Warga ini masih ditugaskan ronda. Hapus tugasnya di Jadwal ronda dahulu." }, 409);
    const deleted = await c.var.db.delete(residents)
      .where(and(eq(residents.id, id), isNull(residents.userId)))
      .returning({ id: residents.id });
    if (deleted.length) return c.json({ success: "Warga dihapus." });
    const [resident] = await c.var.db.select({ id: residents.id }).from(residents).where(eq(residents.id, id));
    return resident
      ? c.json({ error: "Warga ini memiliki akun. Kelola aksesnya melalui tab Akun di Warga." }, 409)
      : c.json({ error: "Warga tidak ditemukan." }, 404);
  })
  .get("/:id/riwayat", idParam(), async (c) => c.json({ moves: await residenceHistory(c.var.db, c.req.valid("param").id) }));

async function setFamily(tx: Tx, residentId: number, houseId: number | null, familyId: number | null, relation?: string | null) {
  const [profile] = await tx.select().from(residents).where(eq(residents.id, residentId));
  if (profile.familyId) {
    const [current] = await tx.select().from(families).where(eq(families.id, profile.familyId));
    if (current?.headResidentId === residentId && (familyId !== profile.familyId || (relation && relation !== "head"))) {
      throw new HTTPException(409, { message: "Ganti kepala keluarga melalui tab Keluarga di Warga sebelum melepas hubungan ini." });
    }
  }
  if (!familyId) { await tx.update(residents).set({ familyId: null, familyRelation: null }).where(eq(residents.id, residentId)); return; }
  const [family] = await tx.select().from(families).where(eq(families.id, familyId)).for("update");
  if (!family) throw new HTTPException(404, { message: "Keluarga tidak ditemukan." });
  const head = (await listResidents(tx)).find((person) => person.id === family.headResidentId)!;
  if (head.houseId !== houseId) throw new HTTPException(409, { message: "Anggota keluarga harus terhubung ke rumah yang sama. Pindahkan keluarga melalui tab Keluarga di Warga." });
  if (family.headResidentId !== residentId && relation === "head") throw new HTTPException(409, { message: "Ganti kepala keluarga melalui tab Keluarga di Warga." });
  const familyRelation = family.headResidentId === residentId ? "head" : relation && relation !== "head" ? relation as "spouse" | "child" | "parent" | "other" : "other";
  await tx.update(residents).set({ familyId, familyRelation }).where(eq(residents.id, residentId));
}
