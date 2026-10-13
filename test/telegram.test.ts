import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import type { Bindings } from "@/server/env";
import { getDashboardNotifications } from "@/server/dashboard-notifications";
import { processTelegramNotifications, sendTelegram, telegramStatus, triggerTelegramNotifications } from "@/server/telegram";
import { cashDeposits, collectionLogs, collections, houses, payments, patrols, rondaSchedule, scheduleRequests, telegramNotifications, users } from "@/server/schema";
import { hashPin } from "@/server/pin";
import { apiClient, createTestEnv } from "./helpers/db";
import { profileForUser } from "./helpers/residents";

const date = "2026-10-12", now = new Date("2026-10-12T21:00:00+07:00");
let db: Db, env: Bindings, admin: ReturnType<typeof apiClient>, staff: ReturnType<typeof apiClient>;
let houseId: number, staffId: number;
const fetchMock = vi.fn<typeof fetch>();
const ok = () => Promise.resolve(new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }));
const textSent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).text as string).join("\n");
const request = async () => (await db.insert(scheduleRequests).values({ userId: staffId, fromDay: 1, toDay: 2 }).returning())[0];
const deposited = async (requested = true) => {
  const [patrol] = await db.insert(patrols).values({ date, depositRequestedAt: requested ? now : null, depositRequestedBy: requested ? staffId : null }).returning();
  await db.insert(collections).values({ patrolId: patrol.id, houseId, status: "filled", amount: 500, method: "manual", collectedBy: staffId, recordedAt: now });
};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  const test = await createTestEnv(); db = test.db;
  admin = apiClient(test.env); staff = apiClient(test.env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  const [house] = await db.insert(houses).values({ block: "A", number: "1", token: "TELEGRAM1" }).returning(); houseId = house.id;
  const [user] = await db.insert(users).values({ name: "Yusuf", pinHash: await hashPin("4321"), role: "petugas" }).returning(); staffId = user.id;
  await db.insert(rondaSchedule).values({ dayOfWeek: 1, position: 0, residentId: await profileForUser(db, staffId) });
  await staff.post("/api/auth/login", { userId: staffId, pin: "4321" });
  env = { ...test.env, DEV: undefined, TELEGRAM_BOT_TOKEN: "123:fake-token", TELEGRAM_CHAT_ID: "456", CRON_SECRET: "cron-test-secret" };
});
beforeEach(async () => {
  vi.setSystemTime(now); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); fetchMock.mockImplementation(ok);
  await db.delete(telegramNotifications); await db.delete(scheduleRequests); await db.delete(cashDeposits); await db.delete(payments); await db.delete(collectionLogs); await db.delete(collections); await db.delete(patrols);
  await db.update(users).set({ name: "Yusuf" }).where(eq(users.id, staffId));
  // Pengingat konfigurasi yang sudah ada tidak boleh mengaburkan peristiwa baru di tiap tes.
  await processTelegramNotifications(env, now); fetchMock.mockClear();
});
afterAll(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("notifikasi dashboard ke Telegram", () => {
  it("mengirim permintaan baru beserta link dashboard, tanpa mengulang saat polling", async () => {
    const r = await request();
    expect(await processTelegramNotifications(env, now)).toMatchObject({ sent: 1 });
    expect(textSent()).toContain("Yusuf meminta ubah jadwal dari Senin (malam Selasa) ke Selasa (malam Rabu)");
    expect(textSent()).toContain("https://app.clusternatura.com/dashboard/jadwal");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telegram.org/bot123:fake-token/sendMessage");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ chat_id: "456", link_preview_options: { is_disabled: true } });
    await processTelegramNotifications(env, now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await db.select().from(telegramNotifications).where(eq(telegramNotifications.key, `schedule:${r.id}`)))[0].sentAt).not.toBeNull();
  });
  it("klaim bersamaan hanya mengirim satu kali untuk permintaan yang sama", async () => {
    await request();
    await Promise.all([processTelegramNotifications(env, now), processTelegramNotifications(env, now)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("pengajuan setoran memakai uang dipegang petugas, tanpa menggandakan kas", async () => {
    await deposited();
    await db.insert(payments).values([
      { clientId: "collector", houseId, receivedDate: date, periodStart: "2026-10-01", periodEnd: "2026-10-31", cadence: "monthly", amount: 1000, receivedBy: "collector", collectorId: staffId },
      { clientId: "treasurer", houseId, receivedDate: date, periodStart: "2026-10-01", periodEnd: "2026-10-31", cadence: "monthly", amount: 2000, receivedBy: "treasurer" },
    ]);
    await processTelegramNotifications(env, now);
    expect(textSent()).toContain("Pengajuan setoran jimpitan"); expect(textSent()).toContain("Rp 1.500");
    expect(await db.select().from(cashDeposits)).toHaveLength(0);
    await db.insert(cashDeposits).values({ date, amount: 1500 });
    await processTelegramNotifications(env, now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await db.select().from(telegramNotifications).where(eq(telegramNotifications.key, `deposit-request:${date}`)))[0].active).toBe(false);
  });
  it("catatan terakhir otomatis mengajukan dan mengirim Telegram sekali tanpa klik tombol", async () => {
    const client = apiClient(env); for (const [name, value] of staff.cookies) client.cookies.set(name, value);
    const entries = [{ clientId: crypto.randomUUID(), houseId, status: "filled", amount: 500, method: "scan", recordedAt: now.toISOString() }];
    expect((await client.post("/api/ronda/catatan", { entries })).status).toBe(200);
    expect(textSent()).toContain("Pengajuan setoran jimpitan"); expect(textSent()).toContain("Rp 500");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await db.select().from(patrols))[0].depositRequestedBy).toBe(staffId);
    expect(await db.select().from(cashDeposits)).toHaveLength(0);
    await client.post("/api/ronda/catatan", { entries });
    await processTelegramNotifications(env, now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("selisih setoran dan catatan luar jadwal termasuk pengingat; catatan scan berikutnya tidak membanjiri chat", async () => {
    await deposited(false); await db.insert(cashDeposits).values({ date, amount: 400 });
    await db.insert(collectionLogs).values({ date, houseId, userId: staffId, status: "filled", amount: 500, method: "manual", onDuty: false, recordedAt: now });
    await processTelegramNotifications(env, now);
    expect(textSent()).toContain("Selisih setoran"); expect(textSent()).toContain("Rp 500, diterima Rp 400"); expect(textSent()).toContain("Catatan di luar jadwal");
    await db.insert(collectionLogs).values({ date, houseId, userId: staffId, status: "empty", amount: 0, method: "manual", onDuty: false, recordedAt: now });
    await processTelegramNotifications(env, now); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("kegagalan jaringan disimpan dan dicoba ulang dengan nama terbaru, tanpa membocorkan token", async () => {
    await request(); fetchMock.mockRejectedValue(new Error("secret URL https://api.telegram.org/bot123:fake-token"));
    await processTelegramNotifications(env, now);
    const status = await telegramStatus(env); expect(status.pending).toBe(1); expect(status.error).toContain("dicoba ulang"); expect(JSON.stringify(status)).not.toContain("fake-token");
    await processTelegramNotifications(env, now); expect(fetchMock).toHaveBeenCalledTimes(1);
    await db.update(users).set({ name: "Yusuf baru" }).where(eq(users.id, staffId));
    fetchMock.mockImplementation(ok);
    const later = new Date(now.getTime() + 61_000); vi.setSystemTime(later);
    await processTelegramNotifications(env, later);
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(textSent()).toContain("Yusuf baru"); expect((await telegramStatus(env)).pending).toBe(0);
  });
  it("mengikuti retry_after Telegram dan tidak mengirim permintaan yang sudah dibatalkan", async () => {
    const r = await request(); fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, parameters: { retry_after: 600 } }), { status: 429 }));
    await processTelegramNotifications(env, now);
    await processTelegramNotifications(env, new Date(now.getTime() + 61_000)); expect(fetchMock).toHaveBeenCalledTimes(1);
    await db.update(scheduleRequests).set({ status: "cancelled" }).where(eq(scheduleRequests.id, r.id));
    await processTelegramNotifications(env, new Date(now.getTime() + 601_000)); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await telegramStatus(env)).pending).toBe(0);
  });
  it("pengingat aktif kembali setelah sempat selesai; lease yang kedaluwarsa dapat diproses ulang", async () => {
    await deposited(); await processTelegramNotifications(env, now);
    await db.insert(cashDeposits).values({ date, amount: 500 }); await processTelegramNotifications(env, now);
    await db.delete(cashDeposits); await processTelegramNotifications(env, now);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const r = await request();
    await db.insert(telegramNotifications).values({ key: `schedule:${r.id}`, leaseId: "crashed-worker", leaseUntil: new Date(now.getTime() - 1), nextAttemptAt: now });
    await processTelegramNotifications(env, now); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("pesan panjang dibagi dalam batas Telegram tanpa kehilangan permintaan", async () => {
    await db.insert(scheduleRequests).values(Array.from({ length: 32 }, () => ({ userId: staffId, fromDay: 1, toDay: 2 })));
    const result = await processTelegramNotifications(env, now);
    expect(result.sent).toBe(32); expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    for (const [, init] of fetchMock.mock.calls) expect(JSON.parse(String(init?.body)).text.length).toBeLessThanOrEqual(4096);
  });
  it("development dengan token dan Chat ID mengirim notifikasi dan pesan uji", async () => {
    await request();
    const local = { ...env, DEV: "1" };
    expect(await processTelegramNotifications(local, now)).toMatchObject({ enabled: true, sent: 1 });
    expect(textSent()).toContain("Permintaan ubah jadwal");
    expect(await telegramStatus(local)).toMatchObject({ enabled: true, local: true, disabled: false });
    const { testTelegram } = await import("@/server/telegram");
    expect(await testTelegram(local)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("permintaan petugas di lokal langsung dikirim tanpa admin membuka dashboard", async () => {
    const local = { ...env, DEV: "1" };
    const client = apiClient(local); for (const [name, value] of staff.cookies) client.cookies.set(name, value);
    const response = await client.post("/api/jadwal/permintaan", { fromDay: 1, toDay: 3, note: "" });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(textSent()).toContain("Yusuf meminta ubah jadwal dari Senin (malam Selasa) ke Rabu (malam Kamis)");
    const [saved] = await db.select().from(scheduleRequests).where(eq(scheduleRequests.userId, staffId));
    const [queued] = await db.select().from(telegramNotifications).where(eq(telegramNotifications.key, `schedule:${saved.id}`));
    expect(saved.status).toBe("pending"); expect(queued.sentAt).not.toBeNull();
    expect((await client.get("/api/jadwal/permintaan")).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await client.post(`/api/jadwal/permintaan/${saved.id}/batal`)).status).toBe(200);
    expect((await db.select().from(telegramNotifications).where(eq(telegramNotifications.key, queued.key)))[0].active).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("schema lokal yang belum dimigrasi memberi petunjuk tanpa membocorkan query atau token", async () => {
    const secret = "secret URL https://api.telegram.org/bot123:fake-token";
    const failure = new Error(secret, { cause: Object.assign(new Error(secret), { code: "42P01" }) });
    const transaction = vi.spyOn(db, "transaction").mockRejectedValueOnce(failure);
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(triggerTelegramNotifications({ ...env, DEV: "1" })).resolves.toBeUndefined();
      expect(logger).toHaveBeenCalledWith(expect.stringContaining("PostgreSQL 42P01"));
      expect(logger).toHaveBeenCalledWith(expect.stringContaining("bun run db:migrate"));
      expect(JSON.stringify(logger.mock.calls)).not.toContain("fake-token");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { transaction.mockRestore(); logger.mockRestore(); }
  });
  it("preview, pengiriman dinonaktifkan, atau konfigurasi belum lengkap tidak mengirim", async () => {
    await request();
    for (const disabled of [{ ...env, TELEGRAM_DISABLED: "1" }, { ...env, DEV: "1", TELEGRAM_DISABLED: "1" }, { ...env, TELEGRAM_BOT_TOKEN: "" }, { ...env, TELEGRAM_CHAT_ID: "" }]) expect(await processTelegramNotifications(disabled, now)).toMatchObject({ enabled: false, sent: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cron dilindungi secret; hanya pengurus dengan akses tulis Pengaturan dapat mengirim pesan uji", async () => {
    const status = await admin.get("/api/admin/pengaturan/telegram"); expect(status.status).toBe(200); expect(JSON.stringify(status.data)).not.toContain("fake-token");
    expect((await staff.post("/api/admin/pengaturan/telegram/test")).status).toBe(403);
    expect((await admin.post("/api/admin/pengaturan/telegram/test")).status).toBe(503); // helper tanpa token/Chat ID
    expect((await apiClient(env).get("/api/internal/notifications")).status).toBe(401);
    const { app } = await import("@/server/app");
    const wrong = await app.request("/api/internal/notifications", { headers: { Authorization: "Bearer wrong" } }, env); expect(wrong.status).toBe(401);
    await request();
    const valid = await app.request("/api/internal/notifications", { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }, env); expect(valid.status).toBe(200); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("pemicu API berjalan tanpa dashboard terbuka, dan kegagalan Telegram tidak menggagalkan simpan", async () => {
    const client = apiClient(env); for (const [name, value] of admin.cookies) client.cookies.set(name, value);
    const r = await request(); fetchMock.mockRejectedValue(new Error("network down"));
    const res = await client.put(`/api/admin/kas/setoran/${date}`, { amount: 0 });
    expect(res.status).toBe(200); expect((await db.select().from(cashDeposits))[0].amount).toBe(0);
    expect((await db.select().from(telegramNotifications).where(eq(telegramNotifications.key, `schedule:${r.id}`)))[0].lastError).not.toBeNull();
  });
  it("teks pesan tidak memakai parse_mode; nama yang berisi markup tetap berupa teks biasa", async () => {
    await db.update(users).set({ name: "Yusuf <a href='x'> & _*" }).where(eq(users.id, staffId)); await request();
    const notices = await getDashboardNotifications(db, now); expect(notices.notices.some((n) => n.detail.includes("<a href='x'>"))).toBe(true);
    await processTelegramNotifications(env, now); expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).parse_mode).toBeUndefined();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 200 }));
    expect(await sendTelegram({ token: "fake", chatId: "chat" }, "uji")).toMatchObject({ ok: false });
  });
});
