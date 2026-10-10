import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { daysInMonth, isMonth, localDate, rondaDate, startedRondaDate } from "@/lib/dates";
import { monthStats } from "@/lib/month-stats";
import { scheduleDay } from "@/lib/schedule";
import { endWargaAccess, hasWargaAccess, requireUser } from "../auth";
import type { AppEnv } from "../env";
import { idParam } from "../http";
import { getCashPublic } from "../kas";
import { getHouseHistory, getMonthRecap, getSettings, logoColumns, logoUrl } from "../queries";
import { listSchedule } from "../schedule";
import { announcements, contacts, houses, settings } from "../schema";
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
    const now = new Date();
    const date = rondaDate(now);
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
      today: localDate(now),
      tonight: scheduleDay(date),
      // Jadwal warga hanya memuat penjaga yang bisa ikut; roster admin tetap lengkap.
      schedule: schedule.flatMap((s) => {
        const name = s.name ?? s.ownerName;
        return name && s.color !== null && s.color !== "blue"
          ? [{ id: s.id, day: s.day, position: s.position, houseId: s.houseId, block: s.block, number: s.number, name, unassigned: s.residentId === null }]
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
    const now = new Date();
    const through = startedRondaDate(now);
    const paymentInfo = await getHousePaymentInfo(db, house.id, through);
    const { createdAt: _createdAt, ...rest } = house;
    return c.json({ house: rest, today: localDate(now), through, history, paymentInfo });
  })

  /** Rekap bulanan tanpa nama: total per malam dan per rumah. */
  .get("/rekap", requireUser, validator("query", (value: Record<string, string | string[]>) => {
    const bulan = typeof value.bulan === "string" ? value.bulan : "";
    return { bulan: isMonth(bulan) ? bulan : localDate(new Date()).slice(0, 7) };
  }), async (c) => {
    const month = c.req.valid("query").bulan;
    const recap = await getMonthRecap(c.var.db, month);
    const now = new Date();
    const through = startedRondaDate(now);
    // Malam hari ini baru ikut status mulai pukul 20.00 WIB, termasuk yang belum dicatat.
    const stats = monthStats({ ...recap, dates: daysInMonth(month).filter((date) => date <= through) });
    return c.json({ month, today: localDate(now), through, ...stats, paymentPeriods: recap.paymentPeriods ?? [] });
  });
