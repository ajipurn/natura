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
export const logoRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const row = await readLogo(c.var.db);
    const image = row?.logo ? parseLogo(row.logo) : null;
    if (!row || !image) return c.json({ error: "Belum ada logo." }, 404);
    return c.body(image.bytes, 200, {
      "Content-Type": image.type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": c.req.query("v") === String(row.version) ? "public, max-age=31536000, immutable" : "no-cache",
    });
  })

  /**
   * Favicon ketiga app (lihat `<link rel="icon">` di tiap index.html): logo yang dipaskan ke kotak
   * persegi (SVG berisi gambar logo, supaya logo yang tidak persegi tidak gepeng), atau ikon bawaan
   * kalau belum ada logo. Alamatnya tetap, jadi selalu diperiksa ulang; ETag = versi logo.
   */
  .get("/favicon", async (c) => {
    const row = await readLogo(c.var.db);
    // `parseLogo` memastikan isinya data URL gambar yang sah (hanya karakter base64), aman ditaruh di atribut.
    if (!row?.logo || !parseLogo(row.logo)) return c.redirect("/icon.svg", 302);
    const etag = `"logo-${row.version}"`;
    const headers = { ETag: etag, "Cache-Control": "no-cache" };
    if (c.req.header("If-None-Match") === etag) return c.body(null, 304, headers);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image href="${row.logo}" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>`;
    return c.body(svg, 200, { ...headers, "Content-Type": "image/svg+xml", "X-Content-Type-Options": "nosniff" });
  });

async function readLogo(db: AppEnv["Variables"]["db"]) {
  const [row] = await db
    .select({ logo: settings.logo, version: settings.logoVersion })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  return row;
}
