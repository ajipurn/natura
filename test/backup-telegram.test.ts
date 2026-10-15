import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "@/lib/permissions";
import { app } from "@/server/app";
import { createDatabaseBackup } from "@/server/backup";
import * as sqlBackup from "@/server/backup-sql";
import { databaseBackupStatus, processDatabaseBackup } from "@/server/backup-telegram";
import type { Db } from "@/server/db";
import type { Bindings } from "@/server/env";
import { backupSettings, houses, users } from "@/server/schema";
import * as telegram from "@/server/telegram";
import { apiClient, createTestEnv } from "./helpers/db";

let env: Bindings, admin: ReturnType<typeof apiClient>;
const clients = new Map<string, ReturnType<typeof apiClient>>();
const now = new Date("2026-10-15T00:15:00Z");
const fetchMock = vi.fn<typeof fetch>();
const ok = () => Promise.resolve(new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })));

beforeAll(async () => {
  const test = await createTestEnv();
  const setup = apiClient(test.env);
  await setup.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  env = { ...test.env, DEV: undefined, TELEGRAM_BOT_TOKEN: "123:backup-secret", TELEGRAM_CHAT_ID: "-100123", CRON_SECRET: "backup-cron-secret" };
  admin = apiClient(env);
  for (const [key, value] of setup.cookies) admin.cookies.set(key, value);
  for (const role of ROLES.filter((role) => role !== "admin")) {
    await setup.post("/api/admin/petugas", { name: role, role, pin: "1234" });
    const [user] = await env.db.select().from(users).where(eq(users.name, role));
    const client = apiClient(env);
    await client.post("/api/auth/login", { userId: user.id, pin: "1234" });
    clients.set(role, client);
  }
  await env.db.insert(houses).values({ block: "A", number: "1", token: "SQL-TELEGRAM", ownerName: "O'Brian\\arsip 🏡\n'); DROP TABLE houses; --" });
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); fetchMock.mockImplementation(ok);
  await env.db.update(backupSettings).set({ enabled: false, hour: 2, lastAttemptAt: null, lastSentAt: null, lastFileName: null, lastError: null, nextAttemptAt: new Date(0), leaseId: null, leaseUntil: null });
});
afterAll(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const enable = () => env.db.update(backupSettings).set({ enabled: true });
const cron = (bindings = env, authorization = `Bearer ${bindings.CRON_SECRET}`) => app.request("/api/internal/backup", { headers: { Authorization: authorization } }, bindings);

describe("autobackup SQL ke Telegram", () => {
  it("hanya admin boleh membaca, mengatur, dan mengirim backup, termasuk rute turunannya", async () => {
    for (const client of [...clients.values(), apiClient(env)]) {
      const expected = client.cookies.size ? 403 : 401;
      expect((await client.get("/api/admin/backup/settings")).status).toBe(expected);
      expect((await client.put("/api/admin/backup/settings", { enabled: true })).status).toBe(expected);
      expect((await client.put("/api/admin/backup/settings", { hour: 2 })).status).toBe(expected);
      expect((await client.post("/api/admin/backup/telegram")).status).toBe(expected);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    const response = await admin.get("/api/admin/backup/settings");
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({ enabled: false, hour: 2, telegramConfigured: true, cronConfigured: true, lastSentAt: null, inProgress: false });
    expect(JSON.stringify(response.data)).not.toMatch(/backup-secret|backup-cron-secret|-100123|leaseId/);
    const direct = await app.request("/api/admin/backup/settings", { headers: { Cookie: [...admin.cookies].map(([k, v]) => `${k}=${v}`).join("; ") } }, env);
    expect(direct.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("menyimpan sakelar terpisah dari Pengaturan umum dan memvalidasi konfigurasi sebelum aktivasi", async () => {
    expect((await admin.put("/api/admin/backup/settings", { enabled: "true" })).status).toBe(400);
    expect((await admin.put("/api/admin/backup/settings", { enabled: true, chatId: "other-chat" })).status).toBe(400);
    for (const overrides of [{ TELEGRAM_BOT_TOKEN: "" }, { TELEGRAM_CHAT_ID: "" }, { TELEGRAM_DISABLED: "1" }, { CRON_SECRET: "" }]) {
      const client = apiClient({ ...env, ...overrides });
      for (const [key, value] of admin.cookies) client.cookies.set(key, value);
      expect((await client.put("/api/admin/backup/settings", { enabled: true })).status).toBe(400);
    }
    expect((await admin.put("/api/admin/backup/settings", { enabled: true })).status).toBe(200);
    expect((await databaseBackupStatus(env)).enabled).toBe(true);
    expect((await admin.get("/api/admin/pengaturan")).data).not.toHaveProperty("enabled");
    expect((await admin.put("/api/admin/backup/settings", { enabled: false })).status).toBe(200);
    expect((await databaseBackupStatus(env)).enabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("jam hanya menerima 0–23 dan perubahan jam tidak ikut mengaktifkan jadwal", async () => {
    for (const payload of [{}, { hour: -1 }, { hour: 24 }, { hour: 2.5 }, { hour: "2" }, { hour: null }]) {
      expect((await admin.put("/api/admin/backup/settings", payload)).status).toBe(400);
    }
    expect((await admin.put("/api/admin/backup/settings", { hour: 0 })).status).toBe(200);
    expect(await databaseBackupStatus(env)).toMatchObject({ enabled: false, hour: 0 });
    expect((await admin.put("/api/admin/backup/settings", { hour: 23 })).status).toBe(200);
    expect(await databaseBackupStatus(env)).toMatchObject({ enabled: false, hour: 23 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cron memakai jam WIB terbaru tanpa deploy ulang dan tombol manual mengabaikan jam tersebut", async () => {
    await admin.put("/api/admin/backup/settings", { enabled: true, hour: 23 });
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false, reason: "not-due" });
    expect(fetchMock).not.toHaveBeenCalled();
    await admin.put("/api/admin/backup/settings", { hour: 7 });
    expect(await processDatabaseBackup(env)).toEqual({ sent: true });
    await admin.put("/api/admin/backup/settings", { hour: 23 });
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
    vi.setSystemTime(new Date("2026-10-16T18:00:00Z")); // 17 Oktober, 01.00 WIB.
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
    expect((await admin.post("/api/admin/backup/telegram")).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("default mati, konfigurasi kosong, dan preview tidak mengirim atau mengklaim pekerjaan", async () => {
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false, reason: "not-due" });
    await enable();
    for (const overrides of [{ TELEGRAM_DISABLED: "1" }, { TELEGRAM_BOT_TOKEN: "" }, { TELEGRAM_CHAT_ID: "" }]) {
      expect(await processDatabaseBackup({ ...env, ...overrides })).toMatchObject({ sent: false, reason: "unavailable" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await env.db.select().from(backupSettings))[0].lastAttemptAt).toBeNull();
  });

  it("mengunggah file SQL lengkap yang dapat dipulihkan, tanpa URL publik atau konten SQL di respons browser", async () => {
    expect((await admin.post("/api/admin/backup/telegram")).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:backup-secret/sendDocument");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toBeUndefined(); // Boundary multipart dibuat oleh fetch.
    const form = init?.body as FormData;
    expect(form.get("chat_id")).toBe("-100123");
    expect(form.get("caption")).toContain("Natura · Backup SQL");
    expect(form.get("caption")).toContain("WIB");
    const file = form.get("document") as File;
    expect(file.name).toBe("natura-backup-2026-10-15T00-15-00-000Z.sql");
    expect(file.type).toBe("application/sql");
    const content = await file.text();
    expect(content).toContain("CREATE TABLE"); expect(content).toContain("INSERT INTO"); expect(content).toContain("COMMIT;");
    expect(content).not.toContain("backup-secret");
    const target = new PGlite();
    try {
      await target.exec(content);
      const restored = await createDatabaseBackup(drizzle(target) as unknown as Db);
      const original = await createDatabaseBackup(env.db);
      expect(restored.tables.houses).toEqual(original.tables.houses);
      expect(restored.tables.users).toEqual(original.tables.users);
      expect(Object.keys(restored.tables).sort()).toEqual(Object.keys(original.tables).sort());
      expect(restored.migrations).toEqual(original.migrations);
    } finally { await target.close(); }
    expect(await databaseBackupStatus(env)).toMatchObject({ lastSentAt: now, lastFileName: file.name, lastError: null, inProgress: false });
    expect((await env.db.select().from(houses)).length).toBe(1);
  }, 15_000);

  it("cron mengirim maksimal sekali pada tanggal WIB yang sama; pengiriman manual juga memenuhi jadwal hari itu", async () => {
    await enable();
    expect(await processDatabaseBackup(env)).toEqual({ sent: true });
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false, reason: "not-due" });
    vi.setSystemTime(new Date("2026-10-15T16:59:00Z"));
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
    vi.setSystemTime(new Date("2026-10-15T17:00:00Z"));
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
    vi.setSystemTime(new Date("2026-10-15T18:59:00Z"));
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
    vi.setSystemTime(new Date("2026-10-15T19:00:00Z"));
    expect(await processDatabaseBackup(env)).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await admin.post("/api/admin/backup/telegram")).status).toBe(200);
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("klaim atomik menahan cron dan tombol yang berjalan bersamaan", async () => {
    await enable();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = processDatabaseBackup(env);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((await databaseBackupStatus(env)).inProgress).toBe(true);
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
    expect((await admin.post("/api/admin/backup/telegram")).status).toBe(409);
    finish(await ok());
    expect(await pending).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("mengikuti retry_after, mempertahankan backup terakhir, dan menghapus error setelah berhasil", async () => {
    await enable();
    const previous = new Date("2026-10-14T00:00:00Z");
    await env.db.update(backupSettings).set({ lastSentAt: previous, lastFileName: "previous.sql" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, parameters: { retry_after: 600 } }), { status: 429 }));
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false, reason: "failed" });
    expect(await databaseBackupStatus(env)).toMatchObject({ lastSentAt: previous, lastFileName: "previous.sql", inProgress: false, lastError: expect.stringContaining("HTTP 429") });
    vi.setSystemTime(new Date(now.getTime() + 61_000));
    expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
    expect((await admin.post("/api/admin/backup/telegram")).status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(now.getTime() + 601_000));
    expect(await processDatabaseBackup(env)).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await databaseBackupStatus(env)).lastError).toBeNull();
  });

  it("timeout dan kegagalan SQL tidak membocorkan token/data dan tidak menandai backup berhasil", async () => {
    fetchMock.mockRejectedValueOnce(new Error("https://api.telegram.org/bot123:backup-secret/sendDocument private row"));
    const failed = await admin.post("/api/admin/backup/telegram");
    expect(failed.status).toBe(503);
    expect(JSON.stringify(failed.data)).not.toMatch(/backup-secret|private row/);
    expect(await databaseBackupStatus(env)).toMatchObject({ lastSentAt: null, inProgress: false, lastError: expect.stringContaining("belum dapat dikirim") });
    vi.setSystemTime(new Date(now.getTime() + 61_000));
    const generator = vi.spyOn(sqlBackup, "createSqlDatabaseBackup").mockRejectedValueOnce(new Error("SELECT pin_hash = 'private row' backup-secret"));
    try {
      expect((await admin.post("/api/admin/backup/telegram")).status).toBe(503);
      expect(await databaseBackupStatus(env)).toMatchObject({ lastSentAt: null, inProgress: false, lastError: "Backup SQL belum dapat dibuat. Coba lagi nanti." });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { generator.mockRestore(); }
  });

  it("klaim proses yang terhenti bisa diambil ulang setelah kedaluwarsa", async () => {
    await enable();
    await env.db.update(backupSettings).set({ leaseId: "crashed", leaseUntil: new Date(now.getTime() - 1) });
    expect(await processDatabaseBackup(env)).toEqual({ sent: true });
    expect((await databaseBackupStatus(env)).inProgress).toBe(false);
  });

  it("mematikan autobackup saat SQL dibuat menghentikan unggahan", async () => {
    await enable();
    const original = sqlBackup.createSqlDatabaseBackup;
    const generator = vi.spyOn(sqlBackup, "createSqlDatabaseBackup").mockImplementationOnce(async (db) => {
      const dump = await original(db);
      await db.update(backupSettings).set({ enabled: false });
      return dump;
    });
    try {
      expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await databaseBackupStatus(env)).toMatchObject({ enabled: false, inProgress: false, lastSentAt: null });
    } finally { generator.mockRestore(); }
  });

  it("mengubah jam ke waktu berikutnya saat SQL dibuat menghentikan unggahan jadwal lama", async () => {
    await enable();
    const original = sqlBackup.createSqlDatabaseBackup;
    const generator = vi.spyOn(sqlBackup, "createSqlDatabaseBackup").mockImplementationOnce(async (db) => {
      const dump = await original(db);
      await db.update(backupSettings).set({ hour: 23 });
      return dump;
    });
    try {
      expect(await processDatabaseBackup(env)).toMatchObject({ sent: false });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await databaseBackupStatus(env)).toMatchObject({ enabled: true, hour: 23, inProgress: false, lastSentAt: null });
    } finally { generator.mockRestore(); }
  });

  it("cron backup membutuhkan secret dan terpisah dari pemeriksaan notifikasi", async () => {
    await enable();
    expect((await cron(env, "Bearer wrong")).status).toBe(401);
    expect((await cron({ ...env, CRON_SECRET: undefined }, "Bearer ")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    const notifications = vi.spyOn(telegram, "processTelegramNotifications").mockRejectedValueOnce(new Error("private row"));
    try {
      const response = await cron();
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ sent: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(notifications).not.toHaveBeenCalled();
    } finally { notifications.mockRestore(); }
  });

  it("cron notifikasi tidak menjalankan backup yang sudah masuk jadwal", async () => {
    await enable();
    const generator = vi.spyOn(sqlBackup, "createSqlDatabaseBackup").mockRejectedValueOnce(new Error("SQL unavailable"));
    try {
      const response = await app.request("/api/internal/notifications", { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }, env);
      expect(response.status).toBe(200);
      expect(generator).not.toHaveBeenCalled();
      expect((await databaseBackupStatus(env)).lastSentAt).toBeNull();
    } finally { generator.mockRestore(); }
  });

  it("menolak file di atas 50 MB sebelum menghubungi Telegram", async () => {
    const file = new Blob([new Uint8Array(50_000_001)]);
    expect(await telegram.sendTelegramDocument({ token: "fake", chatId: "fake" }, file, "large.sql", "Backup")).toMatchObject({ ok: false, error: expect.stringContaining("50 MB") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
