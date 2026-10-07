import { Hono } from "hono";
import { csrf } from "hono/csrf";
import type { AppEnv } from "./env";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { eksporRoutes } from "./routes/ekspor";
import { houseRoutes } from "./routes/house";
import { logoRoutes } from "./routes/logo";
import { rondaRoutes } from "./routes/ronda";
import { wargaRoutes } from "./routes/warga";
import { paymentRoutes } from "./routes/payments";

/** API di /api/*. Tipe `AppType` dipakai klien (hono/client) supaya pemanggilan API ikut dicek TypeScript. */
export const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(csrf())
  .use(async (c, next) => {
    c.set("db", c.env.db);
    await next();
    // Data pribadi: jangan disimpan cache bersama/CDN.
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "private, no-cache");
  })
  .route("/auth", authRoutes)
  .route("/rumah", houseRoutes)
  .route("/logo", logoRoutes)
  .route("/warga", wargaRoutes)
  .route("/admin", adminRoutes)
  .route("/admin/pembayaran", paymentRoutes)
  .route("/ekspor", eksporRoutes)
  .route("/", rondaRoutes);

app.notFound((c) => c.json({ error: "Tidak ditemukan." }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Terjadi kesalahan di server. Coba lagi." }, 500);
});

export type AppType = typeof app;
