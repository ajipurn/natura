import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { rondaDate } from "@/lib/dates";
import { monthStats } from "@/lib/month-stats";
import { scheduleDay } from "@/lib/schedule";
import { endWargaAccess, hasWargaAccess, requireWarga, startWargaAccess } from "../auth";
import type { AppEnv } from "../env";
import { body, idParam } from "../http";
import { getCashPublic } from "../kas";
import { getHouseHistory, getMonthRecap, getSettings, logoColumns, logoUrl } from "../queries";
import { listSchedule } from "../schedule";
import { announcements, contacts, houses, settings } from "../schema";
import { monthQuery } from "./ronda";
import { getHousePaymentInfo } from "../payments";

/** Banyaknya malam ronda terakhir di riwayat per rumah (± 3 bulan). */
const HISTORY_NIGHTS = 100;

/** Halaman informasi untuk warga, dibuka dengan kode bersama dari pengurus. */
export const wargaRoutes = new Hono<AppEnv>()
  .get("/akses", async (c) => {
    const db = c.var.db;
    const [[row], access] = await Promise.all([
      db.select({ communityName: settings.communityName, code: settings.wargaCode, ...logoColumns }).from(settings).where(eq(settings.id, 1)).limit(1),
      hasWargaAccess(c),
    ]);
    return c.json({ communityName: row?.communityName ?? null, logoUrl: logoUrl(row), enabled: Boolean(row?.code), access });
  })

  .post("/masuk", body(z.object({ code: z.string().trim().max(32) })), async (c) => {
    const code = c.req.valid("json").code.toUpperCase().replace(/[^0-9A-Z]/g, "");
    const [row] = await c.var.db
      .select({ code: settings.wargaCode, version: settings.wargaCodeVersion })
      .from(settings)
      .where(eq(settings.id, 1))
      .limit(1);
    if (!row?.code) return c.json({ error: "Halaman warga belum dibuka oleh pengurus." }, 403);
    if (code !== row.code) return c.json({ error: "Kode salah. Tanyakan kode terbaru ke pengurus." }, 400);
    await startWargaAccess(c, row.version);
    return c.json({ ok: true });
  })

  .post("/keluar", (c) => {
    endWargaAccess(c);
    return c.json({ ok: true });
  })

  /** Info umum: jadwal ronda, pengumuman, kontak, dan ringkasan kas (kalau ditampilkan pengurus). */
  .get("/", requireWarga, async (c) => {
    const db = c.var.db;
    const date = rondaDate(new Date());
    const [settingsRow, schedule, announcementRows, contactRows, cash] = await Promise.all([
      getSettings(db),
      listSchedule(db),
      db
        .select({ id: announcements.id, title: announcements.title, body: announcements.body, pinned: announcements.pinned, createdAt: announcements.createdAt })
        .from(announcements)
        .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
        .limit(30),
      db.select({ id: contacts.id, name: contacts.name, role: contacts.role, phone: contacts.phone }).from(contacts).orderBy(asc(contacts.position)),
      getCashPublic(db, date),
    ]);
    return c.json({
      communityName: settingsRow.communityName,
      date,
      tonight: scheduleDay(date),
      // Baris rumah yang belum ada nama warganya dan baris putih (tidak ikut ronda, sama dengan app
      // petugas) tidak ditampilkan ke warga (juga tidak dihitung).
      schedule: schedule.flatMap((s) => {
        const name = s.name ?? s.ownerName;
        return name && s.color !== null
          ? [{ id: s.id, day: s.day, position: s.position, houseId: s.houseId, block: s.block, number: s.number, name }]
          : [];
      }),
      announcements: announcementRows,
      contacts: contactRows,
      cash,
    });
  })

  /**
   * Riwayat jimpitan satu rumah (tanpa nama warga): malam-malam ronda sekitar 3 bulan terakhir sejak
   * rumah itu terdaftar, termasuk catatan yang diisi untuk tanggal sebelumnya.
   * `status` null = malam itu rumahnya tidak dicek petugas.
   */
  .get("/rumah/:id", requireWarga, idParam(), async (c) => {
    const db = c.var.db;
    const [house] = await db
      .select({ id: houses.id, block: houses.block, number: houses.number, status: houses.status, createdAt: houses.createdAt })
      .from(houses)
      .where(eq(houses.id, c.req.valid("param").id))
      .limit(1);
    if (!house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
    const history = await getHouseHistory(db, house, HISTORY_NIGHTS);
    const paymentInfo = await getHousePaymentInfo(db, house.id, rondaDate(new Date()));
    const { createdAt: _createdAt, ...rest } = house;
    return c.json({ house: rest, today: rondaDate(new Date()), history, paymentInfo });
  })

  /** Rekap bulanan tanpa nama: total per malam dan per rumah. */
  .get("/rekap", requireWarga, monthQuery, async (c) => {
    const month = c.req.valid("query").bulan;
    const recap = await getMonthRecap(c.var.db, month);
    const stats = monthStats(recap);
    return c.json({ month, today: rondaDate(new Date()), ...stats, paymentPeriods: recap.paymentPeriods ?? [] });
  });
