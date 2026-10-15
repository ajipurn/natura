import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./env";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { eksporRoutes } from "./routes/ekspor";
import { houseRoutes } from "./routes/house";
import { logoRoutes } from "./routes/logo";
import { rondaRoutes } from "./routes/ronda";
import { wargaRoutes } from "./routes/warga";
import { paymentRoutes } from "./routes/payments";
import { residentRoutes } from "./routes/residents";
import { duesRoutes } from "./routes/dues";
import { familyRoutes } from "./routes/families";
import { notificationRoutes } from "./routes/notifications";
import { triggerTelegramNotifications } from "./telegram";

/** API di /api/*. Tipe `AppType` dipakai klien (hono/client) supaya pemanggilan API ikut dicek TypeScript. */
export const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(csrf())
  .use(async (c, next) => {
    c.set("db", c.env.db);
    await next();
    // Data pribadi: jangan disimpan cache bersama/CDN.
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "private, no-cache");
    const successfulWrite = !["GET", "HEAD", "OPTIONS"].includes(c.req.method);
    const dashboardOpened = c.req.path === "/api/admin/ringkasan";
    if (c.res.ok && c.get("user") && !c.req.path.startsWith("/api/auth/") && !c.req.path.startsWith("/api/admin/pengaturan/telegram") && !c.req.path.startsWith("/api/admin/backup") && (successfulWrite || dashboardOpened)) {
      const task = triggerTelegramNotifications(c.env);
      if (!c.env.waitUntil) await task;
    }
  })
  .route("/auth", authRoutes)
  .route("/rumah", houseRoutes)
  .route("/logo", logoRoutes)
  .route("/warga", wargaRoutes)
  .route("/admin/warga", residentRoutes)
  .route("/admin/keluarga", familyRoutes)
  .route("/admin/iuran", duesRoutes)
  .route("/admin/pembayaran", paymentRoutes)
  .route("/admin", adminRoutes)
  .route("/internal", notificationRoutes)
  .route("/ekspor", eksporRoutes)
  .route("/", rondaRoutes);

app.notFound((c) => c.json({ error: "Tidak ditemukan." }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Terjadi kesalahan di server. Coba lagi." }, 500);
});

export type AppType = typeof app;
