import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../auth";
import type { AppEnv } from "../env";
import { body, idParam } from "../http";
import { accountNameTaken, accountNameTakenError, listResidents } from "../residents";
import { houseSlots, userDaysStatements } from "../schedule";
import { houses, residents, rondaSchedule, users } from "../schema";

const residentSchema = z.object({
  name: z.string().trim().min(1, "Isi nama warga.").max(100, "Nama maksimal 100 karakter."),
  houseId: z.number().int().positive().nullable().default(null),
  phone: z.string().trim().max(25, "Nomor telepon maksimal 25 karakter.")
    .refine((v) => !v || /^\+?[\d ()-]{6,25}$/.test(v), "Isi nomor telepon yang valid.")
    .optional().transform((v) => v || null),
});

export const residentRoutes = new Hono<AppEnv>()
  .use(requireAdmin)
  .get("/", async (c) => c.json({ residents: await listResidents(c.var.db) }))
  .post("/", body(residentSchema), async (c) => {
    const input = c.req.valid("json");
    if (input.houseId !== null) {
      const [house] = await c.var.db.select({ id: houses.id }).from(houses).where(eq(houses.id, input.houseId));
      if (!house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
    }
    const [resident] = await c.var.db.insert(residents).values(input).returning({ id: residents.id });
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
        const [account] = await tx.select().from(users).where(eq(users.id, resident.userId)).for("update");
        if (input.name.length > 40) return c.json({ error: "Nama akun petugas maksimal 40 karakter." }, 400);
        if (await accountNameTaken(tx, input.name, input.houseId, resident.userId)) {
          return c.json({ error: accountNameTakenError(input.name) }, 409);
        }
        if (account.houseId !== input.houseId) {
          const current = await tx.selectDistinct({ day: rondaSchedule.dayOfWeek }).from(rondaSchedule)
            .where(eq(rondaSchedule.userId, resident.userId));
          const slots = await houseSlots(tx, input.houseId);
          const days = current.map((s) => s.day);
          for (const statement of userDaysStatements(tx, resident.userId, [...days, ...slots.map((s) => s.day)], days, slots)) await statement;
        }
        await tx.update(users).set({ name: input.name, houseId: input.houseId }).where(eq(users.id, resident.userId));
        await tx.update(residents).set({ phone: input.phone }).where(eq(residents.id, id));
      } else {
        await tx.update(residents).set(input).where(eq(residents.id, id));
      }
      return c.json({ success: "Data warga disimpan." });
    });
  })
  .delete("/:id", idParam(), async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await c.var.db.delete(residents)
      .where(and(eq(residents.id, id), isNull(residents.userId)))
      .returning({ id: residents.id });
    if (deleted.length) return c.json({ success: "Warga dihapus." });
    const [resident] = await c.var.db.select({ id: residents.id }).from(residents).where(eq(residents.id, id));
    return resident
      ? c.json({ error: "Warga ini memiliki akun petugas. Kelola aksesnya melalui Akun petugas." }, 409)
      : c.json({ error: "Warga tidak ditemukan." }, 404);
  });
