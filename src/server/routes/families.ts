import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { isIsoDate, localDate } from "@/lib/dates";
import { requireResource } from "../auth";
import type { AppEnv } from "../env";
import type { Tx } from "../db";
import { body, idParam } from "../http";
import { listResidents } from "../residents";
import { moveResident } from "../residence";
import { families, houses, residents } from "../schema";

const schema = z.object({
  headResidentId: z.number().int().positive(),
  houseId: z.number().int().positive().nullable(),
  members: z
    .array(
      z.object({
        id: z.number().int().positive(),
        relation: z.enum(["spouse", "child", "parent", "other"]),
      }),
    )
    .max(100),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
  moveDate: z
    .string()
    .refine(
      (v) => isIsoDate(v) && v <= localDate(new Date()),
      "Isi tanggal pindah yang sudah berlangsung.",
    )
    .optional(),
});

export const familyRoutes = new Hono<AppEnv>()
  .use(requireResource("residents"))
  .get("/", async (c) => {
    const [rows, people] = await Promise.all([
      c.var.db.select().from(families),
      listResidents(c.var.db),
    ]);
    return c.json({
      families: rows.map((family) => {
        const head = people.find(
          (person) => person.id === family.headResidentId,
        )!;
        return {
          ...family,
          headName: head.name,
          houseId: head.houseId,
          block: head.block,
          number: head.number,
          housingStatus: head.housingStatus,
          members: people
            .filter((person) => person.familyId === family.id)
            .sort(
              (a, b) =>
                Number(b.id === family.headResidentId) -
                Number(a.id === family.headResidentId),
            ),
        };
      }),
    });
  })
  .post("/", body(schema), async (c) => {
    const input = c.req.valid("json");
    const id = await c.var.db.transaction(async (tx) => {
      const [head] = await tx
        .select()
        .from(residents)
        .where(eq(residents.id, input.headResidentId))
        .for("update");
      if (!head)
        throw new HTTPException(404, {
          message: "Kepala keluarga tidak ditemukan.",
        });
      if (head.familyId)
        throw new HTTPException(409, {
          message: "Warga ini sudah terhubung ke keluarga lain.",
        });
      const [family] = await tx
        .insert(families)
        .values({ headResidentId: input.headResidentId, note: input.note })
        .onConflictDoNothing({ target: families.headResidentId })
        .returning();
      if (!family)
        throw new HTTPException(409, {
          message: "Warga ini sudah menjadi kepala keluarga.",
        });
      await saveMembers(tx, family.id, input, c.var.user.id);
      return family.id;
    });
    return c.json({ success: "Keluarga ditambahkan.", id });
  })
  .patch("/:id", idParam(), body(schema), async (c) => {
    const id = c.req.valid("param").id;
    const input = c.req.valid("json");
    await c.var.db.transaction(async (tx) => {
      const [family] = await tx
        .select()
        .from(families)
        .where(eq(families.id, id))
        .for("update");
      if (!family)
        throw new HTTPException(404, { message: "Keluarga tidak ditemukan." });
      const [headInOtherFamily] = await tx
        .select({ id: families.id })
        .from(families)
        .where(eq(families.headResidentId, input.headResidentId));
      if (headInOtherFamily && headInOtherFamily.id !== id)
        throw new HTTPException(409, {
          message: "Warga ini sudah menjadi kepala keluarga lain.",
        });
      await saveMembers(tx, id, input, c.var.user.id);
      await tx
        .update(families)
        .set({ headResidentId: input.headResidentId, note: input.note })
        .where(eq(families.id, id));
    });
    return c.json({ success: "Data keluarga disimpan." });
  })
  .delete("/:id", idParam(), async (c) => {
    const id = c.req.valid("param").id;
    const deleted = await c.var.db.transaction(async (tx) => {
      const [family] = await tx
        .select()
        .from(families)
        .where(eq(families.id, id))
        .for("update");
      if (!family) return false;
      await tx
        .update(residents)
        .set({ familyId: null, familyRelation: null })
        .where(eq(residents.familyId, id));
      await tx.delete(families).where(eq(families.id, id));
      return true;
    });
    return deleted
      ? c.json({
          success:
            "Kelompok keluarga dihapus. Semua warga dan rumahnya tetap tersimpan.",
        })
      : c.json({ error: "Keluarga tidak ditemukan." }, 404);
  });

async function saveMembers(
  tx: Tx,
  familyId: number,
  input: z.infer<typeof schema>,
  actorId: number,
) {
  const ids = [
    input.headResidentId,
    ...input.members.map((member) => member.id),
  ];
  if (new Set(ids).size !== ids.length)
    throw new HTTPException(400, {
      message: "Setiap warga hanya boleh dipilih sekali.",
    });
  const selected = await tx
    .select()
    .from(residents)
    .where(inArray(residents.id, ids))
    .orderBy(residents.id)
    .for("update");
  if (selected.length !== ids.length)
    throw new HTTPException(404, {
      message: "Ada warga yang tidak ditemukan.",
    });
  if (
    selected.some((person) => person.familyId && person.familyId !== familyId)
  )
    throw new HTTPException(409, {
      message:
        "Ada warga yang sudah terhubung ke keluarga lain. Lepaskan hubungan tersebut dahulu.",
    });
  if (input.houseId) {
    const [house] = await tx
      .select({ id: houses.id })
      .from(houses)
      .where(eq(houses.id, input.houseId));
    if (!house)
      throw new HTTPException(404, { message: "Rumah tidak ditemukan." });
  }
  await tx
    .update(residents)
    .set({ familyId: null, familyRelation: null })
    .where(and(eq(residents.familyId, familyId)));
  for (const person of selected) {
    await moveResident(
      tx,
      person.id,
      input.houseId,
      actorId,
      input.moveDate ?? localDate(new Date()),
      familyId,
    );
    const relation =
      person.id === input.headResidentId
        ? "head"
        : input.members.find((member) => member.id === person.id)!.relation;
    await tx
      .update(residents)
      .set({ familyId, familyRelation: relation })
      .where(eq(residents.id, person.id));
  }
}
