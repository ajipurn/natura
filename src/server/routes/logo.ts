import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { parseLogo } from "../logo";
import { settings } from "../schema";

/**
 * Gambar logo lingkungan. Publik: tampil di halaman warga, halaman rumah (scan stiker), dan stiker QR.
 * `?v=` = versi logo (lihat `logoUrl`): alamat versi terbaru tidak pernah berubah isinya, jadi boleh
 * disimpan lama di browser; tanpa versi atau versi lama selalu diperiksa ulang.
 */
export const logoRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const [row] = await c.var.db
    .select({ logo: settings.logo, version: settings.logoVersion })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  const image = row?.logo ? parseLogo(row.logo) : null;
  if (!row || !image) return c.json({ error: "Belum ada logo." }, 404);
  return c.body(image.bytes, 200, {
    "Content-Type": image.type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": c.req.query("v") === String(row.version) ? "public, max-age=31536000, immutable" : "no-cache",
  });
});
