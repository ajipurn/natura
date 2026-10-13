import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { processTelegramNotifications } from "../telegram";

export const notificationRoutes = new Hono<AppEnv>().get("/notifications", async (c) => {
  const secret = c.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ""}`), actual = Buffer.from(c.req.header("Authorization") ?? "");
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return c.json({ error: "Tidak diizinkan." }, 401);
  c.header("Cache-Control", "no-store");
  return c.json(await processTelegramNotifications(c.env));
});
