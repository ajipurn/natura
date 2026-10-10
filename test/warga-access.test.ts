import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { rondaDate } from "@/lib/dates";
import { scheduleDay } from "@/lib/schedule";
import { applyEntries } from "@/server/collections";
import { listResidents } from "@/server/residents";
import { createRequest, decideRequest } from "@/server/requests";
import { listSchedule, replaceSlots, saveSchedule, scheduledAccount } from "@/server/schedule";
import { collectionLogs, collections, houses, residents, rondaSchedule, scheduleRequests, users } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

let env: Awaited<ReturnType<typeof createTestEnv>>["env"];
let admin: ReturnType<typeof apiClient>;
let warga: ReturnType<typeof apiClient>;
let wargaId: number;
let residentId: number;
let houseId: number;
let otherHouseId: number;
let adminId: number;
const today = rondaDate(new Date());
const tonight = scheduleDay(today);
const tomorrowNight = (tonight + 1) % 7;
const entry = (id: string, house = houseId) => ({
  clientId: id, houseId: house, status: "filled" as const, amount: 500,
  method: "scan" as const, recordedAt: new Date().toISOString(),
});

beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  expect((await admin.post("/api/auth/setup", {
    communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234",
  })).status).toBe(200);
  adminId = (await env.db.select({ id: users.id }).from(users))[0].id;
  const saved = await env.db.insert(houses).values([
    { block: "AF", number: "4", token: "WARGAAF4" },
    { block: "AF", number: "5", token: "WARGAAF5" },
  ]).returning({ id: houses.id });
  houseId = saved[0].id;
  otherHouseId = saved[1].id;
  residentId = Number((await admin.post("/api/admin/warga", { name: "Ipung", houseId, phone: "081234567890" })).data.id);
  await env.db.insert(rondaSchedule).values({ dayOfWeek: tonight, position: 0, houseId });
});

describe("akun Warga tanpa tugas ronda", () => {
  it("membuat akun Warga memakai profil yang sama tanpa mengambil jadwal rumah", async () => {
    const result = await admin.post("/api/admin/petugas", { residentId, name: "Ipung", pin: "1234", role: "warga", houseId });
    expect(result.status).toBe(200);
    wargaId = Number(result.data.id);
    expect((await listResidents(env.db)).filter((r) => r.name === "Ipung")).toEqual([
      expect.objectContaining({ id: residentId, userId: wargaId, role: "warga", houseId, phone: "081234567890" }),
    ]);
    expect(await env.db.select().from(rondaSchedule).where(scheduledAccount(wargaId))).toEqual([]);
    expect((await listSchedule(env.db)).find((s) => s.houseId === houseId)).toMatchObject({ userId: null });
    warga = apiClient(env);
    expect((await warga.post("/api/auth/login", { userId: wargaId, pin: "1234" })).data).toMatchObject({ user: { role: "warga" } });
  });

  it("tetap membaca informasi, jadwal, riwayat, rekap, dan mengelola PIN sendiri", async () => {
    for (const path of ["/api/auth", "/api/warga", "/api/warga/rumah/" + houseId, "/api/warga/rekap", "/api/jadwal", "/api/riwayat", "/api/riwayat/" + today, "/api/rekap"]) {
      expect((await warga.get(path)).status, path).toBe(200);
    }
    expect((await warga.post("/api/auth/pin", { currentPin: "1234", newPin: "5678", confirmPin: "5678" })).status).toBe(200);
    expect((await warga.post("/api/auth/login", { userId: wargaId, pin: "5678" })).status).toBe(200);
  });

  it("menolak URL/API ronda, antrean offline, QR, dan permintaan jaga walaupun masih ada slot lama", async () => {
    const [legacySlot] = await env.db.insert(rondaSchedule).values({ dayOfWeek: tonight, position: 1, residentId }).returning({ id: rondaSchedule.id });
    expect((await warga.get("/api/ronda")).status).toBe(403);
    expect((await warga.post("/api/ronda/catatan", { entries: [entry("warga-offline")] })).status).toBe(403);
    expect((await warga.post("/api/rumah/WARGAAF4/catat", { status: "filled", amount: 500 })).status).toBe(403);
    expect((await warga.get("/api/rumah/WARGAAF4")).data.canRecord).toBe(false);
    expect((await warga.get("/api/jadwal/permintaan")).status).toBe(403);
    expect((await warga.post("/api/jadwal/permintaan", { fromDay: null, toDay: tomorrowNight, note: "" })).status).toBe(403);
    expect((await warga.post("/api/jadwal/permintaan/1/batal")).status).toBe(403);
    expect(await applyEntries(env.db, { id: wargaId, name: "Ipung", role: "warga" }, [entry("warga-direct")])).toEqual([
      expect.objectContaining({ clientId: "warga-direct", ok: false }),
    ]);
    expect(await env.db.select().from(collections)).toEqual([]);
    expect(await env.db.select().from(collectionLogs)).toEqual([]);
    await env.db.delete(rondaSchedule).where(eq(rondaSchedule.id, legacySlot.id));
  });

  it("menolak jaga eksplisit untuk Warga tanpa menyimpan akun atau mengubah peran", async () => {
    expect((await admin.post("/api/admin/petugas", {
      name: "Tidak disimpan", pin: "1234", role: "warga", houseId: null, days: [tonight],
    })).status).toBe(400);
    expect((await admin.patch(`/api/admin/petugas/${wargaId}`, {
      name: "Ipung", role: "warga", active: true, houseId, days: [tonight],
    })).status).toBe(400);
    expect(await env.db.select().from(users).where(eq(users.name, "Tidak disimpan"))).toEqual([]);
    expect((await env.db.select().from(users).where(eq(users.id, wargaId)))[0].role).toBe("warga");
  });

  it("editor dan impor tidak menghubungkan jadwal ke akun Warga", async () => {
    expect(await replaceSlots(env.db, [{ day: tonight, userId: wargaId, houseId: null, name: null }])).toContain("Akun Warga");
    expect(await replaceSlots(env.db, [{ day: tonight, userId: null, houseId, name: null }])).toBeNull();
    expect((await listSchedule(env.db))[0]).toMatchObject({ userId: null, houseId });
    const summary = await saveSchedule(env.db, [{ day: tonight, position: 0, name: "Ipung", block: "AF", number: "4" }], { fillNames: true, overwriteNames: true });
    expect(summary).toMatchObject({ linked: 0, housesLinked: 0, namesFilled: 0 });
    expect((await listSchedule(env.db))[0]).toMatchObject({ userId: null, houseId: null, name: "Ipung (AF-4)" });
    expect((await listResidents(env.db)).filter((r) => r.name === "Ipung")).toHaveLength(1);
    expect(await createRequest(env.db, wargaId, { fromDay: null, toDay: tomorrowNight, note: null })).toContain("Akun Warga");
    const [request] = await env.db.insert(scheduleRequests).values({ userId: wargaId, fromDay: null, toDay: tomorrowNight }).returning({ id: scheduleRequests.id });
    expect(await decideRequest(env.db, request.id, adminId, "approved", null)).toContain("Akun Warga");
    expect(await env.db.select().from(rondaSchedule).where(scheduledAccount(wargaId))).toEqual([]);
  });

  it("perpindahan profil Warga tidak mengambil malam jaga rumah tujuan", async () => {
    await env.db.insert(rondaSchedule).values({ dayOfWeek: tomorrowNight, position: 0, houseId: otherHouseId });
    expect((await admin.patch(`/api/admin/warga/${residentId}`, { name: "Ipung", houseId: otherHouseId })).status).toBe(200);
    expect(await env.db.select().from(rondaSchedule).where(scheduledAccount(wargaId))).toEqual([]);
    expect((await env.db.select().from(rondaSchedule).where(eq(rondaSchedule.houseId, otherHouseId)))).toHaveLength(1);
    expect((await env.db.select().from(users).where(eq(users.id, wargaId)))[0].houseId).toBe(otherHouseId);
    expect((await admin.patch(`/api/admin/warga/${residentId}`, { name: "Ipung", houseId })).status).toBe(200);
  });

  it("pergantian Petugas ke Warga melepas tugas dan permintaan, menjaga riwayat, serta mengakhiri sesi lama", async () => {
    const result = await admin.post("/api/admin/petugas", { name: "Petugas lama", pin: "1234", role: "petugas", houseId: null, days: [tonight] });
    expect(result.status).toBe(200);
    const id = Number(result.data.id);
    const client = apiClient(env);
    expect((await client.post("/api/auth/login", { userId: id, pin: "1234" })).status).toBe(200);
    expect((await client.post("/api/ronda/catatan", { entries: [entry("before-warga")] })).data).toMatchObject({ results: [{ ok: true }] });
    expect((await client.post("/api/jadwal/permintaan", { fromDay: null, toDay: tomorrowNight, note: "" })).status).toBe(200);
    const profile = (await listResidents(env.db)).find((r) => r.userId === id)!;
    expect((await admin.patch(`/api/admin/petugas/${id}`, { name: "Petugas lama", role: "warga", active: true, houseId: otherHouseId })).status).toBe(200);
    expect(await env.db.select().from(rondaSchedule).where(scheduledAccount(id))).toEqual([]);
    expect(await env.db.select().from(rondaSchedule).where(eq(rondaSchedule.houseId, otherHouseId))).toHaveLength(1);
    expect(await env.db.select().from(scheduleRequests).where(and(eq(scheduleRequests.userId, id), eq(scheduleRequests.status, "pending")))).toEqual([]);
    expect((await listResidents(env.db)).find((r) => r.id === profile.id)).toMatchObject({ userId: id, role: "warga", houseId: otherHouseId });
    expect((await env.db.select().from(collections))[0]).toMatchObject({ amount: 500, collectedBy: id });
    expect((await env.db.select().from(collectionLogs))[0]).toMatchObject({ userId: id });
    expect((await client.get("/api/ronda")).status).toBe(401);
    expect((await client.post("/api/auth/login", { userId: id, pin: "1234" })).status).toBe(200);
    expect((await client.get("/api/ronda")).status).toBe(403);
  });

  it("Warga yang berubah menjadi Petugas baru dijadwalkan setelah orangnya dipilih", async () => {
    expect((await admin.patch(`/api/admin/petugas/${wargaId}`, { name: "Ipung", role: "petugas", active: true, houseId })).status).toBe(200);
    expect((await env.db.select().from(rondaSchedule).where(scheduledAccount(wargaId)))).toHaveLength(0);
    expect(await replaceSlots(env.db, [{ day: tonight, residentId, houseId: null, name: null }])).toBeNull();
    expect((await listSchedule(env.db))[0]).toMatchObject({ residentId, userId: wargaId });
    expect((await env.db.select().from(residents).where(eq(residents.id, residentId)))[0].userId).toBe(wargaId);
  });
});
