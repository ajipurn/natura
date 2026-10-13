import { and, count, eq, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { adminPath, APP_DOMAINS } from "@/lib/app-paths";
import { formatDateLong, rondaDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { dayLabel } from "@/lib/schedule";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import type { Executor } from "./db";
import { undepositedNights } from "./kas";
import { getSettings, listHouses } from "./queries";
import { listSchedule } from "./schedule";
import { cashDeposits, collectionLogs, scheduleRequests, users } from "./schema";

export type DashboardNotification = { key: string; title: string; detail: string; url: string };
const dashboardUrl = (path: string) => `https://${APP_DOMAINS.admin}${adminPath(path, APP_DOMAINS.admin)}`;

/** Uang hasil ronda dan pembayaran yang dipegang petugas; penerimaan langsung bendahara tidak dihitung ulang. */
function recordedAmount(date: SQL) {
  return sql<number>`
    coalesce((select sum(collections.amount) from collections
      inner join patrols on patrols.id = collections.patrol_id
      where patrols.date = ${date} and collections.status = 'filled'), 0)
    + coalesce((select sum(jimpitan_payments.amount) from jimpitan_payments
      where jimpitan_payments.received_date = ${date} and jimpitan_payments.received_by = 'collector' and jimpitan_payments.cancelled_at is null), 0)`;
}

/** Semua hal yang perlu ditindaklanjuti di Ringkasan, Jadwal, dan Setoran; satu identitas stabil per masalah. */
export async function getDashboardNotifications(db: Executor, now = new Date()) {
  const date = rondaDate(now);
  // Alias tanggal luar diperlukan karena subquery juga membaca tabel patrols.
  const requestedPatrols = sql`(select date, deposit_requested_at, deposit_requested_by from patrols) requested_patrols`;
  // Dispatcher memakai satu koneksi transaksi; pg mensyaratkan query berurutan di koneksi itu.
  const settings = await getSettings(db);
  const houses = await listHouses(db);
  const schedule = await listSchedule(db);
  const [accounts] = await db.select({ n: count() }).from(users).where(eq(users.active, true));
  const requests = await db.select({ id: scheduleRequests.id, name: users.name, from: scheduleRequests.fromDay, to: scheduleRequests.toDay, target: scheduleRequests.targetUserId })
      .from(scheduleRequests).innerJoin(users, eq(users.id, scheduleRequests.userId)).where(eq(scheduleRequests.status, "pending"));
  const submitted = await db.select({ date: sql<string>`requested_patrols.date`, requestedAt: sql<Date>`requested_patrols.deposit_requested_at`, name: users.name,
      amount: recordedAmount(sql`requested_patrols.date`).mapWith(Number) })
      .from(requestedPatrols).leftJoin(users, sql`${users.id} = requested_patrols.deposit_requested_by`)
      .leftJoin(cashDeposits, sql`${cashDeposits.date} = requested_patrols.date`)
      .where(and(sql`requested_patrols.deposit_requested_at is not null`, sql`requested_patrols.date <= ${date}`, isNull(cashDeposits.id)));
  const missingDeposits = await undepositedNights(db, date);
  const differences = await db.select({ date: cashDeposits.date, received: cashDeposits.amount, recorded: recordedAmount(sql`cash_deposits.date`).mapWith(Number) })
      .from(cashDeposits).where(and(lte(cashDeposits.date, date), sql`${cashDeposits.amount} <> ${recordedAmount(sql`cash_deposits.date`)}`));
  const offDuty = await db.select({ userId: collectionLogs.userId, name: users.name, n: count() }).from(collectionLogs)
      .leftJoin(users, eq(users.id, collectionLogs.userId))
      .where(and(eq(collectionLogs.date, date), eq(collectionLogs.onDuty, false), isNotNull(collectionLogs.userId)))
      .groupBy(collectionLogs.userId, users.name);
  const notices: DashboardNotification[] = [];
  const add = (key: string, title: string, detail: string, path: string) => notices.push({ key, title, detail, url: dashboardUrl(path) });
  for (const r of requests) add(`schedule:${r.id}`, "Permintaan ubah jadwal", `${r.name} meminta ${r.target ? "tukar" : "ubah"} jadwal${r.from === null ? "" : ` dari ${dayLabel(r.from)}`} ke ${dayLabel(r.to)}. Menunggu keputusan pengurus.`, "/jadwal");
  const submittedDates = new Set(submitted.map((r) => r.date));
  for (const r of submitted) add(`deposit-request:${r.date}`, "Pengajuan setoran jimpitan", `${r.name ?? "Petugas"} selesai ronda ${formatDateLong(r.date)}. Tercatat ${formatRupiah(r.amount)}. Catat setoran setelah uang diterima.`, `/kas?view=deposits&bulan=${r.date.slice(0, 7)}`);
  for (const d of missingDeposits.filter((d) => !submittedDates.has(d))) add(`deposit-missing:${d}`, "Setoran belum dicatat", `Setoran ronda ${formatDateLong(d)} belum dicatat ke bendahara.`, `/kas?view=deposits&bulan=${d.slice(0, 7)}`);
  for (const d of differences) add(`deposit-difference:${d.date}:${d.received}:${d.recorded}`, "Selisih setoran jimpitan", `Ronda ${formatDateLong(d.date)}: tercatat ${formatRupiah(d.recorded)}, diterima ${formatRupiah(d.received)}. Perlu dicocokkan.`, `/kas?view=deposits&bulan=${d.date.slice(0, 7)}`);
  for (const r of offDuty) add(`off-duty:${date}:${r.userId}`, "Catatan di luar jadwal", `${r.name ?? "Petugas"} membuat ${r.n} catatan untuk ${formatDateLong(date)} meskipun tidak dijadwalkan. Periksa log pencatatan.`, `/riwayat/${date}?tab=log`);
  const missing = matchPlan(SITE_PLAN, houses).missing.length;
  if (missing) add("setup:houses", "Data rumah belum lengkap", `${missing} rumah dari denah belum terdaftar.`, "/rumah?tampilan=denah");
  if (accounts.n <= 1) add("setup:accounts", "Buat akun warga", "Akun warga belum disiapkan. Tambahkan akun agar warga dan petugas bisa masuk aplikasi.", "/warga?tab=akun");
  if (!schedule.length) add("setup:schedule", "Jadwal ronda belum diisi", "Isi atau impor jadwal ronda agar petugas mengetahui malam jaganya.", "/jadwal");
  return { communityName: settings.communityName, notices };
}
