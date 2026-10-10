import { Hono } from "hono";
import { validator } from "hono/validator";
import { isIsoDate, isMonth, rondaDate } from "@/lib/dates";
import { requireRonda, requireUser } from "../auth";
import { applyEntries, entriesSchema } from "../collections";
import type { AppEnv } from "../env";
import { body, idParam } from "../http";
import { z } from "zod";
import {
  getCollectionsForDate,
  getMonthRecap,
  getRondaSnapshot,
  getSettings,
  listHouses,
  listPatrols,
} from "../queries";
import { cancelRequest, createRequest, listOwnRequests } from "../requests";
import { listSchedule } from "../schedule";
import { getPaymentMonth } from "../payments";

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
  .get("/ronda", requireUser, requireRonda, async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await getRondaSnapshot(c.var.db, c.var.user));
  })

  /** Antrean catatan dari HP petugas. */
  .post("/ronda/catatan", requireUser, requireRonda, body(entriesSchema), async (c) => {
    const results = await applyEntries(c.var.db, c.var.user, c.req.valid("json").entries);
    return c.json({ results });
  })

  .get("/jadwal", requireUser, async (c) => c.json({ schedule: await listSchedule(c.var.db) }))

  /** Permintaan ubah jadwal milik petugas yang sedang masuk. */
  .get("/jadwal/permintaan", requireUser, requireRonda, async (c) => c.json({ requests: await listOwnRequests(c.var.db, c.var.user.id) }))

  .post(
    "/jadwal/permintaan",
    requireUser,
    requireRonda,
    body(
      z.object({
        fromDay: z.number().int().min(0).max(6).nullable(),
        toDay: z.number("Pilih malam yang diinginkan.").int().min(0).max(6),
        targetUserId: z.number().int().positive().nullable().optional(),
        note: z
          .string()
          .trim()
          .max(300, "Alasan maks. 300 karakter.")
          .transform((v) => v || null),
      }),
    ),
    async (c) => {
      const error = await createRequest(c.var.db, c.var.user.id, c.req.valid("json"));
      if (error) return c.json({ error }, 400);
      return c.json({ success: "Permintaan terkirim. Admin akan meninjaunya." });
    },
  )

  .post("/jadwal/permintaan/:id/batal", requireUser, requireRonda, idParam(), async (c) => {
    if (!(await cancelRequest(c.var.db, c.var.user.id, c.req.valid("param").id))) {
      return c.json({ error: "Permintaan tidak bisa dibatalkan (mungkin sudah diproses)." }, 409);
    }
    return c.json({ success: "Permintaan dibatalkan." });
  })

  /** Malam ronda terbaru, atau semua malam satu bulan (?bulan=YYYY-MM, untuk kalender). */
  .get(
    "/riwayat",
    requireUser,
    validator("query", (value: Record<string, string | string[]>) => {
      const bulan = typeof value.bulan === "string" && isMonth(value.bulan) ? value.bulan : undefined;
      return { bulan };
    }),
    async (c) => {
      const { bulan } = c.req.valid("query");
      const [patrols, houseRows] = await Promise.all([listPatrols(c.var.db, 90, bulan), listHouses(c.var.db)]);
      return c.json({
        patrols,
        /** Rumah dihuni saat ini, untuk menghitung yang belum dicek tiap malam (perkiraan). */
        activeHouses: houseRows.filter((h) => h.status === "active").length,
        today: rondaDate(new Date()),
      });
    },
  )

  .get(
    "/riwayat/:date",
    requireUser,
    validator("param", (value: Record<string, string>, c) =>
      isIsoDate(value.date) ? { date: value.date } : c.json({ error: "Tanggal tidak valid." }, 400),
    ),
    async (c) => {
      const { date } = c.req.valid("param");
      const db = c.var.db;
      const [houses, collections, settings, paymentData] = await Promise.all([
        listHouses(db),
        getCollectionsForDate(db, date),
        getSettings(db),
        getPaymentMonth(db, date.slice(0, 7)),
      ]);
      return c.json({ date, houses, collections, settings, paymentPeriods: paymentData.bills.filter((p) => p.start <= date && p.end >= date) });
    },
  )

  .get("/rekap", requireUser, monthQuery, async (c) => {
    const month = c.req.valid("query").bulan;
    const db = c.var.db;
    const [recap, settings] = await Promise.all([getMonthRecap(db, month), getSettings(db)]);
    return c.json({ month, communityName: settings.communityName, defaultAmount: settings.defaultAmount, ...recap });
  });

export { monthQuery };
