import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { rondaDate } from "@/lib/dates";
import { monthStats } from "@/lib/month-stats";
import { scheduleDay } from "@/lib/schedule";
import { endWargaAccess, hasWargaAccess, requireWarga, startWargaAccess } from "../auth";
import type { AppEnv } from "../env";
import { body } from "../http";
import { getMonthRecap, getSettings } from "../queries";
import { listSchedule } from "../schedule";
import { announcements, contacts, settings } from "../schema";
import { monthQuery } from "./ronda";

/** Halaman informasi untuk warga, dibuka dengan kode bersama dari pengurus. */
export const wargaRoutes = new Hono<AppEnv>()
  .get("/akses", async (c) => {
    const db = c.var.db;
    const [[row], access] = await Promise.all([
      db.select({ communityName: settings.communityName, code: settings.wargaCode }).from(settings).where(eq(settings.id, 1)).limit(1),
      hasWargaAccess(c),
    ]);
    return c.json({ communityName: row?.communityName ?? null, enabled: Boolean(row?.code), access });
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

  /** Info umum: jadwal ronda, pengumuman, kontak. */
  .get("/", requireWarga, async (c) => {
    const db = c.var.db;
    const date = rondaDate(new Date());
    const [settingsRow, schedule, announcementRows, contactRows] = await Promise.all([
      getSettings(db),
      listSchedule(db),
      db
        .select({ id: announcements.id, title: announcements.title, body: announcements.body, pinned: announcements.pinned, createdAt: announcements.createdAt })
        .from(announcements)
        .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
        .limit(30),
      db.select({ id: contacts.id, name: contacts.name, role: contacts.role, phone: contacts.phone }).from(contacts).orderBy(asc(contacts.position)),
    ]);
    return c.json({
      communityName: settingsRow.communityName,
      date,
      tonight: scheduleDay(date),
      schedule: schedule.map((s) => ({
        id: s.id,
        day: s.day,
        position: s.position,
        block: s.block,
        number: s.number,
        name: s.name ?? s.ownerName,
        color: s.color,
      })),
      announcements: announcementRows,
      contacts: contactRows,
    });
  })

  /** Rekap bulanan tanpa nama: total per malam dan per rumah. */
  .get("/rekap", requireWarga, monthQuery, async (c) => {
    const month = c.req.valid("query").bulan;
    const stats = monthStats(await getMonthRecap(c.var.db, month));
    return c.json({ month, today: rondaDate(new Date()), ...stats });
  });
