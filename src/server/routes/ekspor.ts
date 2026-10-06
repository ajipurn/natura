import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { timingSafeEqual } from "hono/utils/buffer";
import { buildRecapCsv } from "@/lib/recap-csv";
import type { AppEnv } from "../env";
import { getMonthRecap } from "../queries";
import { settings } from "../schema";
import { monthQuery } from "./ronda";

/**
 * Rekap bulanan sebagai CSV untuk Google Sheets (`=IMPORTDATA(link)`), tanpa login: tokennya
 * dibuat admin di halaman Rekap dan bisa diganti/dimatikan. Tanpa nama warga, hanya blok dan nomor.
 * ?bulan=YYYY-MM; kosong = bulan berjalan, jadi Sheet-nya ikut berganti bulan sendiri.
 */
export const eksporRoutes = new Hono<AppEnv>().get("/:token/rekap.csv", monthQuery, async (c) => {
  const db = c.var.db;
  const [row] = await db.select({ token: settings.exportToken }).from(settings).where(eq(settings.id, 1)).limit(1);
  if (!row?.token || !(await timingSafeEqual(row.token, c.req.param("token")))) {
    return c.text("Link tidak berlaku. Minta link baru ke pengurus.", 404);
  }
  const csv = buildRecapCsv(await getMonthRecap(db, c.req.valid("query").bulan), { ownerNames: false });
  return c.body(csv, 200, { "Content-Type": "text/csv; charset=utf-8" });
});
