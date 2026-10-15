import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import { APP_TIMEZONE, localDate } from "@/lib/dates";
import { createSqlDatabaseBackup } from "./backup-sql";
import type { Bindings } from "./env";
import { backupSettings, settings } from "./schema";
import { sendTelegramDocument, telegramConfig } from "./telegram";

const LEASE_MS = 120_000;

export async function databaseBackupStatus(env: Bindings, now = new Date()) {
  const [row] = await env.db.select().from(backupSettings).where(eq(backupSettings.id, 1));
  return {
    enabled: row?.enabled ?? false,
    hour: row?.hour ?? 2,
    telegramConfigured: Boolean(telegramConfig(env)),
    cronConfigured: Boolean(env.CRON_SECRET),
    local: env.DEV === "1",
    disabled: env.TELEGRAM_DISABLED === "1",
    lastSentAt: row?.lastSentAt ?? null,
    lastFileName: row?.lastFileName ?? null,
    lastError: row?.lastError ?? null,
    inProgress: Boolean(row?.leaseUntil && row.leaseUntil > now),
  };
}

type BackupResult = { sent: true } | { sent: false; reason: "not-due" | "unavailable" | "busy" | "failed"; error?: string };

/** Cron harian dan tombol admin berbagi klaim atomik; hanya keberhasilan Telegram menandai backup terkirim. */
export async function processDatabaseBackup(env: Bindings, { force = false, now = new Date() } = {}): Promise<BackupResult> {
  const credentials = telegramConfig(env);
  if (!credentials) return { sent: false, reason: "unavailable", error: "Hubungkan Telegram dan aktifkan pengiriman terlebih dahulu." };

  const leaseId = randomUUID();
  const startOfDay = new Date(`${localDate(now)}T00:00:00+07:00`);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  const [work] = await env.db.update(backupSettings).set({
    leaseId, leaseUntil: new Date(now.getTime() + LEASE_MS), lastAttemptAt: now,
  }).where(and(
    eq(backupSettings.id, 1),
    force ? undefined : eq(backupSettings.enabled, true),
    force ? undefined : lte(backupSettings.hour, hour),
    force ? undefined : or(isNull(backupSettings.lastSentAt), lt(backupSettings.lastSentAt, startOfDay)),
    lte(backupSettings.nextAttemptAt, now),
    or(isNull(backupSettings.leaseUntil), lte(backupSettings.leaseUntil, now)),
  )).returning({ id: backupSettings.id });
  if (!work) return force
    ? { sent: false, reason: "busy", error: "Backup sedang diproses atau menunggu jeda percobaan ulang. Coba lagi nanti." }
    : { sent: false, reason: "not-due" };

  const owned = and(eq(backupSettings.id, 1), eq(backupSettings.leaseId, leaseId));
  let result: Awaited<ReturnType<typeof sendTelegramDocument>>;
  let fileName: string | undefined;
  try {
    const backup = await createSqlDatabaseBackup(env.db);
    fileName = `natura-backup-${backup.createdAt.replace(/[:.]/g, "-")}.sql`;
    const [current] = await env.db.select({ enabled: backupSettings.enabled, hour: backupSettings.hour, leaseId: backupSettings.leaseId, leaseUntil: backupSettings.leaseUntil }).from(backupSettings).where(eq(backupSettings.id, 1));
    // Jika admin mematikan atau memundurkan jadwal saat SQL dibuat, hentikan sebelum mengunggah.
    if (current?.leaseId !== leaseId || !current.leaseUntil || current.leaseUntil <= new Date() || (!force && (!current.enabled || current.hour > hour))) {
      await env.db.update(backupSettings).set({ leaseId: null, leaseUntil: null }).where(owned);
      return { sent: false, reason: "not-due" };
    }
    const [community] = await env.db.select({ name: settings.communityName }).from(settings).where(eq(settings.id, 1));
    const timestamp = new Date(backup.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    result = await sendTelegramDocument(credentials, new Blob([backup.content], { type: "application/sql" }), fileName,
      `${(community?.name || "Natura").slice(0, 80)} · Backup SQL\n${timestamp} WIB\n\nStruktur dan data aplikasi. Simpan file ini di tempat aman.`);
  } catch {
    // Error query mentah bisa berisi data pribadi; hanya simpan pesan yang aman.
    result = { ok: false, error: "Backup SQL belum dapat dibuat. Coba lagi nanti.", retryAfter: 60 };
  }
  if (result.ok) {
    await env.db.update(backupSettings).set({ lastSentAt: new Date(), lastFileName: fileName, lastError: null, leaseId: null, leaseUntil: null, nextAttemptAt: now }).where(owned);
    return { sent: true };
  }
  await env.db.update(backupSettings).set({
    lastError: result.error, leaseId: null, leaseUntil: null,
    nextAttemptAt: new Date(now.getTime() + result.retryAfter * 1000),
  }).where(owned);
  return { sent: false, reason: "failed", error: result.error };
}
