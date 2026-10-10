import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { daysInMonth, rondaDate } from "@/lib/dates";
import { monthStats } from "@/lib/month-stats";
import { scheduleDay } from "@/lib/schedule";
import { endWargaAccess, hasWargaAccess, requireUser } from "../auth";
import type { AppEnv } from "../env";
import { idParam } from "../http";
import { getCashPublic } from "../kas";
import { getHouseHistory, getMonthRecap, getSettings, logoColumns, logoUrl } from "../queries";
import { listSchedule } from "../schedule";
import { announcements, contacts, houses, settings } from "../schema";
import { monthQuery } from "./ronda";
import { getHousePaymentInfo } from "../payments";

/** Banyaknya malam ronda terakhir di riwayat per rumah (± 3 bulan). */
const HISTORY_NIGHTS = 100;

/** Informasi warga di dalam app, dibuka dengan login nama dan PIN. */
export const wargaRoutes = new Hono<AppEnv>()
  .get("/akses", async (c) => {
    const db = c.var.db;
    const [[row], access] = await Promise.all([
      db.select({ communityName: settings.communityName, ...logoColumns }).from(settings).where(eq(settings.id, 1)).limit(1),
      hasWargaAccess(c),
    ]);
    return c.json({ communityName: row?.communityName ?? null, logoUrl: logoUrl(row), access });
  })

  .post("/masuk", (c) => c.json({ error: "Info warga sekarang ada di app. Masuk dengan nama dan PIN." }, 410))

  .post("/keluar", (c) => {
    endWargaAccess(c);
    return c.json({ ok: true });
  })

  /** Info umum: jadwal ronda, pengumuman, kontak, dan ringkasan kas (kalau ditampilkan pengurus). */
  .get("/", requireUser, async (c) => {
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
      // Jadwal warga hanya memuat penjaga yang bisa ikut; roster admin tetap lengkap.
      schedule: schedule.flatMap((s) => {
        const name = s.name ?? s.ownerName;
        return name && s.color !== null && s.color !== "blue"
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
  .get("/rumah/:id", requireUser, idParam(), validator("query", (value, c) => {
    const parsed = z.object({ bulan: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }).safeParse(value);
    return parsed.success ? parsed.data : c.json({ error: "Bulan tidak valid." }, 400);
  }), async (c) => {
    const db = c.var.db;
    const [house] = await db
      .select({ id: houses.id, block: houses.block, number: houses.number, status: houses.status, createdAt: houses.createdAt })
      .from(houses)
      .where(eq(houses.id, c.req.valid("param").id))
      .limit(1);
    if (!house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
    const history = await getHouseHistory(db, house, HISTORY_NIGHTS, c.req.valid("query").bulan);
    const paymentInfo = await getHousePaymentInfo(db, house.id, rondaDate(new Date()));
    const { createdAt: _createdAt, ...rest } = house;
    return c.json({ house: rest, today: rondaDate(new Date()), history, paymentInfo });
  })

  /** Rekap bulanan tanpa nama: total per malam dan per rumah. */
  .get("/rekap", requireUser, monthQuery, async (c) => {
    const month = c.req.valid("query").bulan;
    const recap = await getMonthRecap(c.var.db, month);
    const today = rondaDate(new Date());
    // Kalender warga menunjukkan seluruh malam yang sudah berjalan, termasuk yang belum dicatat.
    const stats = monthStats({ ...recap, dates: daysInMonth(month).filter((date) => date <= today) });
    return c.json({ month, today, ...stats, paymentPeriods: recap.paymentPeriods ?? [] });
  });
