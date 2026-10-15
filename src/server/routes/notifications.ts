import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { processTelegramNotifications } from "../telegram";
import { processDatabaseBackup } from "../backup-telegram";

const requireCron = createMiddleware<AppEnv>(async (c, next) => {
  const secret = c.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ""}`), actual = Buffer.from(c.req.header("Authorization") ?? "");
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return c.json({ error: "Tidak diizinkan." }, 401);
  c.header("Cache-Control", "no-store");
  await next();
});

export const notificationRoutes = new Hono<AppEnv>()
  .get("/notifications", requireCron, async (c) => c.json(await processTelegramNotifications(c.env)))
  .get("/backup", requireCron, async (c) => {
    try {
      const result = await processDatabaseBackup(c.env);
      return c.json(result, !result.sent && result.reason === "failed" ? 503 : 200);
    } catch {
      console.error("[cron] Pemeriksaan autobackup gagal. Periksa migrasi dan koneksi database.");
      return c.json({ sent: false, error: "Pemeriksaan autobackup gagal." }, 503);
    }
  });
