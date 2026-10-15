import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, lte, max, notInArray, or, sql } from "drizzle-orm";
import type { Db, Executor } from "./db";
import type { Bindings } from "./env";
import { getDashboardNotifications, type DashboardNotification } from "./dashboard-notifications";
import { telegramNotifications as queue } from "./schema";

type Config = { token: string; chatId: string };
type SendResult = { ok: true } | { ok: false; error: string; retryAfter: number };
const MAX_MESSAGE = 3900;
const LEASE_MS = 120_000;

export function telegramConfig(env: Bindings): Config | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim(), chatId = env.TELEGRAM_CHAT_ID?.trim();
  return env.TELEGRAM_DISABLED !== "1" && token && chatId ? { token, chatId } : null;
}

/** SQL diunggah sebagai lampiran, tanpa link unduhan publik atau token di pesan error. */
export async function sendTelegramDocument(credentials: Config, file: Blob, fileName: string, caption: string): Promise<SendResult> {
  if (file.size > 50_000_000) return { ok: false, error: "File SQL melebihi batas Telegram 50 MB. Unduh backup melalui dashboard.", retryAfter: 86_400 };
  const form = new FormData();
  form.set("chat_id", credentials.chatId);
  form.set("document", file, fileName);
  form.set("caption", caption);
  try {
    const res = await fetch(`https://api.telegram.org/bot${credentials.token}/sendDocument`, {
      method: "POST", body: form, signal: AbortSignal.timeout(25_000),
    });
    const body = await res.json().catch(() => null) as { ok?: boolean; parameters?: { retry_after?: number } } | null;
    if (res.ok && body?.ok === true) return { ok: true };
    return { ok: false, error: `Telegram menolak file SQL (HTTP ${res.status}). Periksa token, Chat ID, dan izin bot mengirim file.`, retryAfter: Math.max(60, Number(body?.parameters?.retry_after) || 0) };
  } catch {
    return { ok: false, error: "File SQL belum dapat dikirim ke Telegram. Coba lagi nanti.", retryAfter: 60 };
  }
}

/** Token tidak pernah dikembalikan ke browser atau ditulis ke log, termasuk ketika fetch gagal. */
export async function sendTelegram(config: Config, text: string): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ chat_id: config.chatId, text, link_preview_options: { is_disabled: true } }),
    });
    const body = await res.json().catch(() => null) as { ok?: boolean; parameters?: { retry_after?: number } } | null;
    if (res.ok && body?.ok === true) return { ok: true };
    return { ok: false, error: `Telegram menolak pengiriman (HTTP ${res.status}). Periksa token dan Chat ID.`, retryAfter: Math.max(60, Number(body?.parameters?.retry_after) || 0) };
  } catch {
    return { ok: false, error: "Telegram belum dapat dihubungi. Pengiriman akan dicoba ulang.", retryAfter: 60 };
  }
}

function message(community: string, notices: DashboardNotification[]) {
  return `${community.slice(0, 80)} · Perlu perhatian\n\n${notices.map((n) => `${n.title}\n${n.detail}\n${n.url}`).join("\n\n")}`;
}

/** Rekonsiliasi hanya identitas: perubahan nama/jumlah dibaca dari sumber, pengingat yang selesai tidak dikirim ulang. */
async function reconcile(tx: Executor, notices: DashboardNotification[], now: Date) {
  const keys = notices.map((n) => n.key).sort();
  for (const key of keys) await tx.insert(queue).values({ key, detectedAt: now, nextAttemptAt: now })
      .onConflictDoUpdate({ target: queue.key, setWhere: eq(queue.active, false), set: {
        active: true, detectedAt: now, sentAt: null, attempts: 0, nextAttemptAt: now, leaseId: null, leaseUntil: null, lastError: null,
      } });
  await tx.update(queue).set({ active: false, leaseId: null, leaseUntil: null })
    .where(and(eq(queue.active, true), keys.length ? notInArray(queue.key, keys) : undefined));
}

/** Klaim atomik mencegah polling dashboard dan request petugas mengirim antrean yang sama bersamaan. */
async function claim(db: Db, community: string, notices: DashboardNotification[], now: Date) {
  const leaseId = randomUUID(), byKey = new Map(notices.map((n) => [n.key, n]));
  return db.transaction(async (tx) => {
    const candidates = await tx.select({ key: queue.key, attempts: queue.attempts }).from(queue)
      .where(and(eq(queue.active, true), isNull(queue.sentAt), lte(queue.nextAttemptAt, now), or(isNull(queue.leaseUntil), lte(queue.leaseUntil, now))))
      .orderBy(asc(queue.detectedAt), asc(queue.key)).limit(30).for("update", { skipLocked: true });
    const chosen: typeof candidates = [], items: DashboardNotification[] = [];
    for (const row of candidates) {
      const notice = byKey.get(row.key);
      if (!notice) continue;
      if (message(community, [...items, notice]).length > MAX_MESSAGE) break;
      chosen.push(row); items.push(notice);
    }
    if (!chosen.length) return null;
    await tx.update(queue).set({ leaseId, leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: sql`attempts + 1` })
      .where(inArray(queue.key, chosen.map((r) => r.key)));
    return { leaseId, keys: chosen.map((r) => r.key), attempts: Math.max(...chosen.map((r) => r.attempts)) + 1, text: message(community, items) };
  });
}

/** Dipanggil setelah perubahan data, saat Ringkasan dibuka, dan oleh cron. Kegagalan kanal tidak menggagalkan catatan bisnis. */
export async function processTelegramNotifications(env: Bindings, now = new Date()) {
  const credentials = telegramConfig(env);
  if (!credentials) return { sent: 0, enabled: false };
  const { communityName, notices } = await env.db.transaction(async (tx) => {
    // Snapshot lama tidak boleh menonaktifkan pengingat baru dari request yang berjalan bersamaan.
    await tx.execute(sql`select pg_advisory_xact_lock(728613, 1)`);
    const snapshot = await getDashboardNotifications(tx, now);
    await reconcile(tx, snapshot.notices, now);
    return snapshot;
  });
  let sent = 0;
  // Batas kerja satu function; sisa antrean tetap tersedia untuk pemicu berikutnya.
  for (let batch = 0; batch < 3; batch++) {
    const work = await claim(env.db, communityName, notices, now);
    if (!work) break;
    if (batch > 0) await new Promise((resolve) => setTimeout(resolve, 1_100));
    const result = await sendTelegram(credentials, work.text);
    const lease = and(eq(queue.leaseId, work.leaseId), inArray(queue.key, work.keys));
    if (result.ok) {
      await env.db.update(queue).set({ sentAt: new Date(), leaseId: null, leaseUntil: null, lastError: null }).where(lease);
      sent += work.keys.length;
    } else {
      const delay = Math.max(result.retryAfter, Math.min(3600, 60 * 2 ** Math.min(work.attempts - 1, 6)));
      await env.db.update(queue).set({ leaseId: null, leaseUntil: null, lastError: result.error, nextAttemptAt: new Date(now.getTime() + delay * 1000) }).where(lease);
      break;
    }
  }
  return { sent, enabled: true };
}

/** Hanya kode PostgreSQL yang aman dicatat; pesan/query mentah bisa memuat kredensial. */
function databaseErrorCode(error: unknown): string | null {
  for (let depth = 0; depth < 4 && typeof error === "object" && error !== null; depth++) {
    const cause = error as { code?: unknown; cause?: unknown };
    if (typeof cause.code === "string" && /^[A-Z0-9]{5}$/.test(cause.code)) return cause.code;
    error = cause.cause;
  }
  return null;
}

export function triggerTelegramNotifications(env: Bindings) {
  if (!telegramConfig(env)) return;
  const task = processTelegramNotifications(env).catch((error: unknown) => {
    // Jangan log error jaringan mentah: URL fetch mengandung token bot.
    const code = databaseErrorCode(error);
    const hint = env.DEV === "1" && (code === "42P01" || code === "42703")
      ? " Schema database lokal belum lengkap. Jalankan bun run db:migrate."
      : " Akan dicoba ulang pada pemicu berikutnya.";
    console.error(`[telegram] Pemeriksaan notifikasi gagal${code ? ` (PostgreSQL ${code})` : ""}.${hint}`);
  });
  env.waitUntil?.(task);
  return task;
}

export async function telegramStatus(env: Bindings) {
  const [[pending], [last], [failed]] = await Promise.all([
    env.db.select({ n: count() }).from(queue).where(and(eq(queue.active, true), isNull(queue.sentAt))),
    env.db.select({ at: max(queue.sentAt) }).from(queue),
    env.db.select({ error: queue.lastError }).from(queue).where(and(eq(queue.active, true), isNull(queue.sentAt), sql`last_error is not null`)).orderBy(desc(queue.detectedAt)).limit(1),
  ]);
  return { enabled: Boolean(telegramConfig(env)), local: env.DEV === "1", disabled: env.TELEGRAM_DISABLED === "1", pending: pending.n, lastSentAt: last.at, error: failed?.error ?? null, cronConfigured: Boolean(env.CRON_SECRET) };
}

export async function testTelegram(env: Bindings) {
  const credentials = telegramConfig(env);
  if (!credentials) return { ok: false as const, error: env.TELEGRAM_DISABLED === "1" ? "Pengiriman Telegram dinonaktifkan untuk lingkungan ini." : env.DEV === "1" ? "Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di .env.local, lalu mulai ulang bun run dev." : "Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di Vercel, lalu deploy ulang." };
  return sendTelegram(credentials, "Cluster Natura · Pesan uji\n\nBot terhubung. Permintaan dan pengingat dashboard akan dikirim ke chat ini.\nhttps://app.clusternatura.com/dashboard");
}
