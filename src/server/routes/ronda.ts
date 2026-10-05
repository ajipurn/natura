import { Hono } from "hono";
import { validator } from "hono/validator";
import { isIsoDate, isMonth, rondaDate } from "@/lib/dates";
import { requireUser } from "../auth";
import { applyEntries, entriesSchema } from "../collections";
import type { AppEnv } from "../env";
import { body } from "../http";
import {
  getCollectionsForDate,
  getMonthRecap,
  getRondaSnapshot,
  getSettings,
  listHouses,
  listPatrols,
} from "../queries";
import { listSchedule } from "../schedule";

/** ?bulan=YYYY-MM; kosong/salah = bulan malam ronda sekarang. */
const monthQuery = validator("query", (value: Record<string, string | string[]>) => {
  const bulan = typeof value.bulan === "string" ? value.bulan : "";
  return { bulan: isMonth(bulan) ? bulan : rondaDate(new Date()).slice(0, 7) };
});

/**
 * Data untuk petugas dan admin yang sedang login. Middleware dipasang per rute (bukan `.use`)
 * karena sub-app ini dipasang di "/" dan `.use` akan ikut mengenai rute lain.
 */
export const rondaRoutes = new Hono<AppEnv>()
  /** Data malam ini untuk layar Ronda (disimpan di HP supaya bisa dipakai offline). */
  .get("/ronda", requireUser, async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await getRondaSnapshot(c.var.db, c.var.user));
  })

  /** Antrean catatan dari HP petugas. */
  .post("/ronda/catatan", requireUser, body(entriesSchema), async (c) => {
    const results = await applyEntries(c.var.db, c.var.user, c.req.valid("json").entries);
    return c.json({ results });
  })

  .get("/jadwal", requireUser, async (c) => c.json({ schedule: await listSchedule(c.var.db) }))

  .get("/riwayat", requireUser, async (c) => c.json({ patrols: await listPatrols(c.var.db, 90) }))

  .get(
    "/riwayat/:date",
    requireUser,
    validator("param", (value: Record<string, string>, c) =>
      isIsoDate(value.date) ? { date: value.date } : c.json({ error: "Tanggal tidak valid." }, 400),
    ),
    async (c) => {
      const { date } = c.req.valid("param");
      const db = c.var.db;
      const [houses, collections, settings] = await Promise.all([
        listHouses(db),
        getCollectionsForDate(db, date),
        getSettings(db),
      ]);
      return c.json({ date, houses, collections, settings });
    },
  )

  .get("/rekap", requireUser, monthQuery, async (c) => {
    const month = c.req.valid("query").bulan;
    const db = c.var.db;
    const [recap, settings] = await Promise.all([getMonthRecap(db, month), getSettings(db)]);
    return c.json({ month, communityName: settings.communityName, ...recap });
  });

export { monthQuery };
