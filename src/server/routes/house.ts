import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { rondaDate } from "@/lib/dates";
import { scheduleDay } from "@/lib/schedule";
import { getSessionUser, requireRonda, requireUser } from "../auth";
import { canRonda } from "@/lib/permissions";
import { applyEntries, dutyDays, MAX_AMOUNT } from "../collections";
import type { AppEnv } from "../env";
import { body } from "../http";
import { getHouseByToken, getHouseHistory, getSettings } from "../queries";
import { getHousePaymentInfo } from "../payments";

const tokenParam = validator("param", (value: Record<string, string>, c) =>
  /^[A-Za-z0-9]{6,32}$/.test(value.token) ? { token: value.token } : c.json({ error: "Rumah tidak ditemukan." }, 404),
);

const recordSchema = z.object({
  status: z.enum(["filled", "empty", "none"], "Status tidak valid."),
  amount: z.number().int().min(0).max(MAX_AMOUNT, "Nominal tidak valid."),
});

/** Halaman rumah yang terbuka saat stiker QR di-scan pakai kamera HP biasa. Bisa dibuka siapa saja. */
export const houseRoutes = new Hono<AppEnv>()
  .get("/:token", tokenParam, async (c) => {
    const db = c.var.db;
    const house = await getHouseByToken(db, c.req.valid("param").token);
    if (!house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
    const [user, settings, history] = await Promise.all([getSessionUser(c), getSettings(db), getHouseHistory(db, house, 30)]);
    const tonight = rondaDate(new Date());
    const paymentInfo = await getHousePaymentInfo(db, house.id, tonight);
    // Hanya yang dijadwalkan jaga malam ini yang bisa mencatat (admin juga; koreksi lewat dashboard).
    const canRecord = user && canRonda(user.role) ? (await dutyDays(db, user.id)).has(scheduleDay(tonight)) : false;
    return c.json({
      communityName: settings.communityName,
      logoUrl: settings.logoUrl,
      defaultAmount: settings.defaultAmount,
      tonight,
      canRecord,
      house: {
        block: house.block,
        number: house.number,
        status: house.status,
        token: house.token,
        // Nama KK hanya untuk petugas; halaman ini bisa dibuka siapa saja yang scan stiker.
        ownerName: user ? house.ownerName : null,
      },
      history,
      paymentInfo,
      user,
    });
  })

  /** Petugas yang membuka QR lewat kamera HP biasa bisa langsung mencatat dari halaman rumah. */
  .post("/:token/catat", requireUser, requireRonda, tokenParam, body(recordSchema), async (c) => {
    const house = await getHouseByToken(c.var.db, c.req.valid("param").token);
    if (!house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
    const { status, amount } = c.req.valid("json");
    const [result] = await applyEntries(c.var.db, c.var.user, [
      { clientId: crypto.randomUUID(), houseId: house.id, status, amount, method: "scan", recordedAt: new Date().toISOString() },
    ]);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ ok: true });
  });
