"use server";

import { isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db";
import { houses, siteMap } from "@/server/schema";

const coordinate = z.number().min(0).max(1).nullable();

const layoutSchema = z.object({
  positions: z
    .array(z.object({ id: z.number().int().positive(), x: coordinate, y: coordinate }))
    .max(5000)
    .refine((list) => list.every((p) => (p.x === null) === (p.y === null)), "Posisi tidak lengkap."),
  /** Ukuran denah tanpa gambar (dari susun otomatis). Diabaikan kalau denah punya gambar. */
  size: z
    .object({ width: z.number().int().min(100).max(20000), height: z.number().int().min(100).max(20000) })
    .nullable(),
});

export async function saveSiteMapLayout(input: z.input<typeof layoutSchema>): Promise<{ error?: string }> {
  await requireAdmin();
  const parsed = layoutSchema.safeParse(input);
  if (!parsed.success) return { error: "Data denah tidak valid." };
  const { positions, size } = parsed.data;

  const db = await getDb();
  await db.transaction(async (tx) => {
    if (positions.length > 0) {
      const rows = sql.join(
        positions.map((p) => sql`(${p.id}::int, ${p.x}::float8, ${p.y}::float8)`),
        sql`, `,
      );
      await tx.execute(
        sql`update ${houses} set map_x = v.x, map_y = v.y from (values ${rows}) as v(id, x, y) where ${houses.id} = v.id`,
      );
    }
    if (size) {
      await tx
        .insert(siteMap)
        .values({ id: 1, ...size })
        .onConflictDoUpdate({
          target: siteMap.id,
          set: { ...size, updatedAt: new Date() },
          // Denah bergambar memakai ukuran gambarnya.
          setWhere: isNull(siteMap.imageData),
        });
    }
  });

  revalidatePath("/admin/denah");
  return {};
}
