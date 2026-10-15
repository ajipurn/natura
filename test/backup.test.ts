import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { ROLES, can } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { app } from "@/server/app";
import type { DatabaseBackup } from "@/server/backup";
import { cashEntries, duesInvoices, duesLogs, duesReceipts, duesTypes, families, houses, paymentLogs, payments, residents, rondaSchedule, settings, users } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

let env: Awaited<ReturnType<typeof createTestEnv>>["env"];
let admin: ReturnType<typeof apiClient>;
let adminId: number;
let houseId: number;
const clients = new Map<Role, ReturnType<typeof apiClient>>();
const proof = "data:image/png;base64,aW5pLWJ1a3Rp";
const note = "Catatan O'Brian: \"lunas\"\\arsip\nBaris kedua 🏡";

beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  expect((await admin.post("/api/auth/setup", {
    communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234",
  })).status).toBe(200);
  adminId = (await env.db.select().from(users))[0].id;
  clients.set("admin", admin);
  for (const role of ROLES.filter((role) => role !== "admin")) {
    expect((await admin.post("/api/admin/petugas", { name: role, role, pin: "1234" })).status).toBe(200);
    const [user] = await env.db.select().from(users).where(eq(users.name, role));
    const client = apiClient(env);
    expect((await client.post("/api/auth/login", { userId: user.id, pin: "1234" })).status).toBe(200);
    clients.set(role, client);
  }
  const db = env.db;
  const [house] = await db.insert(houses).values({ block: "A", number: "1", token: "TOKEN-RUMAH" }).returning();
  houseId = house.id;
  await db.update(users).set({ houseId }).where(eq(users.id, adminId));
  const [resident] = await db.insert(residents).values({ name: note, houseId, residentSince: "2026-10-01" }).returning();
  const [family] = await db.insert(families).values({ headResidentId: resident.id, note }).returning();
  await db.update(residents).set({ familyId: family.id, familyRelation: "head" }).where(eq(residents.id, resident.id));
  await db.insert(rondaSchedule).values({ dayOfWeek: 2, position: 0, residentId: resident.id });
  await db.update(settings).set({ exportToken: "TOKEN-EKSPOR", logo: proof, planAnchors: [{ x: 1, y: 2, lat: -6, lng: 106 }] }).where(eq(settings.id, 1));
  await db.insert(cashEntries).values({ date: "2026-10-01", direction: "in", amount: 10000, description: note, recordedBy: adminId });
  const [payment] = await db.insert(payments).values({
    clientId: "backup-payment", houseId, receivedDate: "2026-10-01", periodStart: "2026-10-01", periodEnd: "2026-10-02",
    cadence: "daily", allocations: [["2026-10-01", 500], ["2026-10-02", 500]], amount: 1000, receivedBy: "treasurer", recordedBy: adminId, note,
  }).returning();
  await db.insert(paymentLogs).values({ paymentId: payment.id, userId: adminId, action: "create", payload: { note, allocations: payment.allocations, cancelled: false } });
  const [type] = await db.insert(duesTypes).values({ name: "Kebersihan", amount: 50000, cadence: "monthly", startMonth: "2026-10" }).returning();
  const [invoice] = await db.insert(duesInvoices).values({ typeId: type.id, houseId, month: "2026-10", amount: 50000, dueDate: "2026-10-10", recordedBy: adminId }).returning();
  const [receipt] = await db.insert(duesReceipts).values({ clientId: "backup-receipt", invoiceId: invoice.id, amount: 50000, date: "2026-10-01", method: "transfer", proof, note, recordedBy: adminId }).returning();
  await db.insert(duesLogs).values({ invoiceId: invoice.id, receiptId: receipt.id, action: "receive", amount: 50000, recordedBy: adminId });
  await db.execute(sql`update houses set created_at = '2026-10-01 01:02:03.123456+00' where id = ${houseId}`);
});

function download() {
  return app.request("/api/admin/backup", {
    headers: { Cookie: [...admin.cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
  }, env);
}

describe("backup database khusus admin", () => {
  it("hanya admin yang memiliki izin backup, termasuk ketika meminta akses tulis", () => {
    for (const role of ROLES) {
      expect(can(role, "backup"), role).toBe(role === "admin");
      expect(can(role, "backup", true), role).toBe(role === "admin");
    }
  });

  it("menolak pengunjung tanpa sesi dan semua peran selain admin, termasuk ketua", async () => {
    expect(await apiClient(env).get("/api/admin/backup")).toMatchObject({ status: 401 });
    for (const role of ROLES.filter((role) => role !== "admin")) {
      const response = await clients.get(role)!.get("/api/admin/backup");
      expect(response.status, role).toBe(403);
      expect(response.data).not.toHaveProperty("tables");
    }
  });

  it("mengirim file JSON bertanggal tanpa cache dengan semua tabel dan kolom asli", async () => {
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const backup = await response.json() as DatabaseBackup;
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="natura-backup-${backup.createdAt.replace(/[:.]/g, "-")}.json"`);
    expect(backup).toMatchObject({ format: "natura-database-backup", version: 1, schema: "public" });
    expect(Number.isNaN(Date.parse(backup.createdAt))).toBe(false);
    const { rows } = await env.db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
    expect(Object.keys(backup.tables).sort()).toEqual(rows.map((row) => row.tablename).sort());
    expect(backup.migrations.length).toBeGreaterThan(0);
    expect(backup.migrations[0]).toMatchObject({ hash: expect.any(String), created_at: expect.any(String) });
    const [account] = await env.db.select().from(users).where(eq(users.id, adminId));
    expect(backup.tables.users).toContainEqual(expect.objectContaining({ id: adminId, pin_hash: account.pinHash, house_id: houseId, active: true }));
    expect(backup.tables.settings[0]).toMatchObject({ export_token: "TOKEN-EKSPOR", logo: proof, plan_anchors: expect.any(Array) });
    expect(backup.tables.houses[0]).toMatchObject({ id: houseId, token: "TOKEN-RUMAH", owner_name: null });
    expect(backup.tables.houses[0].created_at).toMatch(/\.123456/);
    expect(new Date(String(backup.tables.houses[0].created_at)).toISOString()).toBe("2026-10-01T01:02:03.123Z");
    expect(backup.tables.residents).toContainEqual(expect.objectContaining({ name: note, house_id: houseId, family_id: expect.any(Number), resident_since: "2026-10-01" }));
    expect(backup.tables.families[0]).toMatchObject({ head_resident_id: expect.any(Number), note });
    expect(backup.tables.jimpitan_payments[0]).toMatchObject({ allocations: [["2026-10-01", 500], ["2026-10-02", 500]], amount: 1000, note });
    expect(backup.tables.payment_logs[0].payload).toMatchObject({ note, cancelled: false });
    expect(backup.tables.dues_receipts[0]).toMatchObject({ proof, amount: 50000, note });
    expect(backup.tables.dues_logs[0]).toMatchObject({ action: "receive", amount: 50000 });
    expect(backup.tables.collection_logs).toEqual([]);
  });

  it("backup hanya membaca data dan permintaan berikutnya menyertakan perubahan terbaru", async () => {
    const first = await (await download()).json() as DatabaseBackup;
    const second = await (await download()).json() as DatabaseBackup;
    expect(second.tables).toEqual(first.tables);
    expect(second.migrations).toEqual(first.migrations);
    await env.db.insert(cashEntries).values({ date: "2026-10-02", direction: "out", amount: 2000, description: "Setelah backup" });
    const latest = await (await download()).json() as DatabaseBackup;
    expect(latest.tables.cash_entries).toHaveLength(first.tables.cash_entries.length + 1);
    expect(latest.tables.cash_entries).toContainEqual(expect.objectContaining({ description: "Setelah backup", amount: 2000 }));
  });

  it("mengirim backup lebih dari 4,5 MB dalam beberapa potongan tanpa mengubah lampiran dan teks Unicode", async () => {
    const largeProof = "data:image/png;base64," + "a".repeat(5 * 1024 * 1024);
    await env.db.update(duesReceipts).set({ proof: largeProof });
    try {
      const response = await download();
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Length")).toBeNull();
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
      }
      expect(chunks.length).toBeGreaterThan(1);
      const text = chunks.join("") + decoder.decode();
      const backup = JSON.parse(text) as DatabaseBackup;
      expect(backup.tables.dues_receipts[0]).toMatchObject({ proof: largeProof, note });
      expect(backup.tables.residents).toContainEqual(expect.objectContaining({ name: note }));
    } finally {
      await env.db.update(duesReceipts).set({ proof });
    }
  });

  it("memeriksa ulang peran dan status aktif pada setiap unduhan meskipun sesi lama masih ada", async () => {
    await env.db.update(users).set({ role: "ketua" }).where(eq(users.id, adminId));
    expect((await download()).status).toBe(403);
    await env.db.update(users).set({ role: "admin", active: false }).where(eq(users.id, adminId));
    expect((await download()).status).toBe(401);
    await env.db.update(users).set({ active: true, sessionVersion: sql`session_version + 1` }).where(eq(users.id, adminId));
    expect((await download()).status).toBe(401);
  });
});
