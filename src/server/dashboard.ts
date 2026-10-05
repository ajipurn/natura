import { count, eq, sql } from "drizzle-orm";
import { rondaDate } from "@/lib/dates";
import { houseLabel } from "@/lib/houses";
import { monthStats } from "@/lib/month-stats";
import { summarize } from "@/lib/recap";
import { scheduleDay, slotHouseLabel } from "@/lib/schedule";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import type { Db } from "./db";
import { getCollectionsForDate, getMonthRecap, getSettings, listHouses, listPatrols } from "./queries";
import { countOffDuty } from "./audit";
import { countPendingRequests } from "./requests";
import { listSchedule } from "./schedule";
import { announcements, settings, users } from "./schema";

/** Data halaman Ringkasan admin. */
export async function getDashboard(db: Db, now: Date) {
  const date = rondaDate(now);
  const month = date.slice(0, 7);
  const [settingsRow, houseRows, tonightRows, recap, recent, schedule, [userCounts], [announcementCount], [codeRow], pendingRequests, offDuty] =
    await Promise.all([
      getSettings(db),
      listHouses(db),
      getCollectionsForDate(db, date),
      getMonthRecap(db, month),
      listPatrols(db, 30),
      listSchedule(db),
      db
        .select({
          active: sql<number>`count(*) filter (where ${users.active})`.mapWith(Number),
          admins: sql<number>`count(*) filter (where ${users.active} and ${users.role} = 'admin')`.mapWith(Number),
        })
        .from(users),
      db.select({ value: count() }).from(announcements),
      db.select({ wargaCode: settings.wargaCode }).from(settings).where(eq(settings.id, 1)).limit(1),
      countPendingRequests(db),
      countOffDuty(db, date),
    ]);

  const tonight = summarize(houseRows, tonightRows);
  const stats = monthStats(recap);
  const day = scheduleDay(date);
  const plan = matchPlan(SITE_PLAN, houseRows);

  // Rumah aktif yang paling sering kosong bulan ini.
  const oftenEmpty = stats.perHouse
    .filter((h) => h.status === "active" && h.empty > 0)
    .sort((a, b) => b.empty - a.empty || a.filled - b.filled)
    .slice(0, 6)
    .map((h) => ({ id: h.id, label: houseLabel(h), empty: h.empty, nights: stats.nights }));

  return {
    communityName: settingsRow.communityName,
    date,
    month,
    tonight: {
      expected: tonight.expected,
      checked: tonight.checked,
      filled: tonight.filled.length,
      empty: tonight.empty.length,
      unchecked: tonight.unchecked.length,
      vacant: tonight.vacant.length,
      total: tonight.total,
      collectors: tonight.collectors,
      guards: schedule
        .filter((s) => s.day === day)
        .map((s) => ({ id: s.id, label: slotHouseLabel(s), name: s.name ?? s.ownerName, color: s.color })),
    },
    monthSummary: { nights: stats.nights, total: stats.total, average: stats.average },
    /** 30 malam terakhir, urut dari yang terlama. */
    trend: [...recent].reverse().map((p) => ({ date: p.date, filled: p.filled, empty: p.empty, total: p.total })),
    oftenEmpty,
    counts: {
      houses: houseRows.length,
      vacant: houseRows.filter((h) => h.status === "vacant").length,
      users: userCounts?.active ?? 0,
      admins: userCounts?.admins ?? 0,
      announcements: announcementCount?.value ?? 0,
    },
    /** Hal yang belum disiapkan, untuk daftar "Yang perlu dilakukan". */
    todo: {
      noHouses: houseRows.length === 0,
      planMissing: plan.missing.length,
      noSchedule: schedule.length === 0,
      noWargaCode: !codeRow?.wargaCode,
      onlyOneUser: (userCounts?.active ?? 0) <= 1,
      /** Permintaan ubah jadwal yang menunggu keputusan admin. */
      pendingRequests,
      /** Catatan malam ini oleh petugas yang tidak dijadwalkan jaga. */
      offDuty,
    },
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
