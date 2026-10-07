import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleDTO } from "@/lib/types";
import { dutyDays } from "@/server/collections";
import type { Db } from "@/server/db";
import { hashPin } from "@/server/pin";
import { houses, rondaSchedule, scheduleRequests, users } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

let db: Db;
let admin: ReturnType<typeof apiClient>;
let yusuf: ReturnType<typeof apiClient>;
let nino: ReturnType<typeof apiClient>;
let jamroni: ReturnType<typeof apiClient>;
let guest: ReturnType<typeof apiClient>;
let yusufId: number;
let ninoId: number;
let jamroniId: number;

beforeAll(async () => {
  const { db: testDb, env } = await createTestEnv();
  db = testDb;
  admin = apiClient(env);
  guest = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  const [ad3, ab3] = await db.insert(houses).values([
    { block: "AD", number: "3", token: "SWAPAD3" },
    { block: "AB", number: "3", token: "SWAPAB3" },
  ]).returning();
  const pinHash = await hashPin("4321");
  const accounts = await db.insert(users).values([
    { name: "Yusuf", pinHash, houseId: ad3.id },
    { name: "Nino", pinHash, houseId: ab3.id },
    { name: "Jamroni", pinHash },
  ]).returning();
  [yusufId, ninoId, jamroniId] = accounts.map((u) => u.id);
  yusuf = apiClient(env); nino = apiClient(env); jamroni = apiClient(env);
  for (const [client, userId] of [[yusuf, yusufId], [nino, ninoId], [jamroni, jamroniId]] as const) {
    expect((await client.post("/api/auth/login", { userId, pin: "4321" })).status).toBe(200);
  }
});

beforeEach(async () => {
  await db.delete(scheduleRequests);
  await db.delete(rondaSchedule);
  await db.update(users).set({ active: true });
  await db.insert(rondaSchedule).values([
    { userId: yusufId, dayOfWeek: 0, position: 1, color: "orange" },
    { userId: yusufId, dayOfWeek: 6, position: 0, color: "green" },
    { userId: ninoId, dayOfWeek: 1, position: 2, color: "green" },
    { userId: ninoId, dayOfWeek: 4, position: 0, color: "yellow" },
    { userId: jamroniId, dayOfWeek: 3, position: 0, color: "green" },
    { name: "Satpam", dayOfWeek: 0, position: 0, color: "green" },
  ]);
});

const schedule = async () => (await admin.get("/api/jadwal")).data.schedule as ScheduleDTO[];
const send = () => yusuf.post("/api/jadwal/permintaan", { fromDay: 0, toDay: 1, targetUserId: ninoId, note: "Bentrok jadwal kerja" });
const requestId = async () => ((await yusuf.get("/api/jadwal/permintaan")).data.requests as { id: number }[])[0].id;

describe("tukar jadwal mingguan", () => {
  it("muncul untuk kedua petugas dan admin, hanya admin yang boleh memutuskan", async () => {
    const before = await schedule();
    expect((await send()).status).toBe(200);
    const id = await requestId();
    const mine = (await yusuf.get("/api/jadwal/permintaan")).data.requests as object[];
    const theirs = (await nino.get("/api/jadwal/permintaan")).data.requests as object[];
    expect(mine[0]).toMatchObject({ id, userId: yusufId, userName: "Yusuf", targetUserId: ninoId, targetUserName: "Nino", targetHouse: "AB-3", fromDay: 0, toDay: 1, status: "pending" });
    expect(theirs).toEqual(mine);
    expect((await jamroni.get("/api/jadwal/permintaan")).data.requests).toEqual([]);
    const list = await admin.get("/api/admin/permintaan");
    expect(list.data.pending).toBe(1);
    expect((list.data.requests as object[])[0]).toMatchObject({ userName: "Yusuf", house: "AD-3", targetUserName: "Nino", days: [0, 6] });
    expect((await nino.post(`/api/jadwal/permintaan/${id}/batal`)).status).toBe(409);
    expect((await nino.post(`/api/admin/permintaan/${id}/setujui`, { response: "" })).status).toBe(403);
    expect(await schedule()).toEqual(before);
  });

  it("menukar tepat dua baris dan posisinya, warna dan rujukan akun ikut petugas, keputusan tidak bisa diulang", async () => {
    const before = await schedule();
    await send();
    const id = await requestId();
    const decisions = await Promise.all([
      admin.post(`/api/admin/permintaan/${id}/setujui`, { response: "Disepakati" }),
      admin.post(`/api/admin/permintaan/${id}/setujui`, { response: "Disepakati" }),
    ]);
    expect(decisions.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await schedule();
    const originalYusuf = before.find((s) => s.userId === yusufId && s.day === 0)!;
    const originalNino = before.find((s) => s.userId === ninoId && s.day === 1)!;
    expect(after.find((s) => s.id === originalYusuf.id)).toEqual({ ...originalYusuf, day: 1, position: 2 });
    expect(after.find((s) => s.id === originalNino.id)).toEqual({ ...originalNino, day: 0, position: 1 });
    expect(after.filter((s) => s.id !== originalYusuf.id && s.id !== originalNino.id)).toEqual(before.filter((s) => s.id !== originalYusuf.id && s.id !== originalNino.id));
    expect(await dutyDays(db, yusufId)).toEqual(new Set([1, 6]));
    expect(await dutyDays(db, ninoId)).toEqual(new Set([0, 4]));
    for (const client of [yusuf, nino]) {
      expect(((await client.get("/api/jadwal/permintaan")).data.requests as object[])[0]).toMatchObject({ status: "approved", response: "Disepakati" });
    }
    expect((await yusuf.post(`/api/jadwal/permintaan/${id}/batal`)).status).toBe(409);
  });

  it("ditolak atau dibatalkan tanpa mengubah jadwal; permintaan pindah biasa tetap berfungsi", async () => {
    const before = await schedule();
    await send();
    let id = await requestId();
    expect((await admin.post(`/api/admin/permintaan/${id}/tolak`, { response: "Belum disepakati" })).status).toBe(200);
    expect(await schedule()).toEqual(before);
    await send(); id = await requestId();
    expect((await yusuf.post(`/api/jadwal/permintaan/${id}/batal`)).status).toBe(200);
    expect(await schedule()).toEqual(before);
    expect((await nino.post("/api/jadwal/permintaan", { fromDay: 1, toDay: 5, note: "" })).status).toBe(200);
    const normalId = ((await nino.get("/api/jadwal/permintaan")).data.requests as { id: number }[])[0].id;
    expect((await admin.post(`/api/admin/permintaan/${normalId}/setujui`, { response: "" })).status).toBe(200);
    expect((await schedule()).filter((s) => s.userId === ninoId).map((s) => s.day)).toEqual([4, 5]);
  });

  it("memeriksa login, akun aktif, jadwal asal/tujuan, dan bentrok malam jaga kedua petugas", async () => {
    expect((await guest.post("/api/jadwal/permintaan", { fromDay: 0, toDay: 1, targetUserId: ninoId, note: "" })).status).toBe(401);
    for (const input of [
      { fromDay: null, toDay: 1, targetUserId: ninoId },
      { fromDay: 0, toDay: 0, targetUserId: ninoId },
      { fromDay: 0, toDay: 1, targetUserId: yusufId },
      { fromDay: 2, toDay: 1, targetUserId: ninoId },
      { fromDay: 0, toDay: 2, targetUserId: ninoId },
      { fromDay: 0, toDay: 6, targetUserId: ninoId },
      { fromDay: 0, toDay: 1, targetUserId: 999999 },
      { fromDay: 0, toDay: 1, targetUserId: 0 },
    ]) expect((await yusuf.post("/api/jadwal/permintaan", { ...input, note: "" })).status).toBe(400);
    await db.insert(rondaSchedule).values({ userId: ninoId, dayOfWeek: 0, position: 2, color: "green" });
    expect((await send()).data.error).toMatch(/sudah jaga/);
    await db.delete(rondaSchedule).where(eq(rondaSchedule.dayOfWeek, 0));
    await db.insert(rondaSchedule).values({ userId: yusufId, dayOfWeek: 0, position: 0, color: "green" });
    await db.update(users).set({ active: false }).where(eq(users.id, ninoId));
    expect((await send()).data.error).toMatch(/nonaktif/);
    expect(await db.select().from(scheduleRequests)).toEqual([]);
  });

  it("menahan permintaan bertumpuk, termasuk permintaan pindah dari petugas tujuan", async () => {
    const responses = await Promise.all([
      send(),
      nino.post("/api/jadwal/permintaan", { fromDay: 1, toDay: 5, note: "" }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await db.select().from(scheduleRequests)).toHaveLength(1);
    const request = (await db.select().from(scheduleRequests))[0];
    expect((await jamroni.post("/api/jadwal/permintaan", { fromDay: 3, toDay: 1, targetUserId: ninoId, note: "" })).data.error).toMatch(/menunggu/);
    const owner = request.userId === yusufId ? yusuf : nino;
    await owner.post(`/api/jadwal/permintaan/${request.id}/batal`);
    expect((await send()).status).toBe(200);
  });

  it("jadwal berubah, ganda, atau petugas nonaktif: persetujuan gagal tanpa memindah separuh pertukaran", async () => {
    await send();
    const id = await requestId();
    await db.update(rondaSchedule).set({ dayOfWeek: 2 }).where(eq(rondaSchedule.userId, ninoId));
    let before = await schedule();
    expect((await admin.post(`/api/admin/permintaan/${id}/setujui`, { response: "" })).status).toBe(409);
    expect(await schedule()).toEqual(before);
    await db.update(rondaSchedule).set({ dayOfWeek: 1 }).where(eq(rondaSchedule.userId, ninoId));
    before = await schedule();
    expect((await admin.post(`/api/admin/permintaan/${id}/setujui`, { response: "" })).status).toBe(409);
    expect(await schedule()).toEqual(before);
    await db.delete(rondaSchedule).where(eq(rondaSchedule.userId, ninoId));
    await db.insert(rondaSchedule).values({ userId: ninoId, dayOfWeek: 1, position: 2, color: "green" });
    await db.update(users).set({ active: false }).where(eq(users.id, ninoId));
    before = await schedule();
    expect((await admin.post(`/api/admin/permintaan/${id}/setujui`, { response: "" })).data.error).toMatch(/nonaktif/);
    expect(await schedule()).toEqual(before);
    expect(((await yusuf.get("/api/jadwal/permintaan")).data.requests as { status: string }[])[0].status).toBe("pending");
    expect((await admin.post(`/api/admin/permintaan/${id}/tolak`, { response: "Ajukan ulang" })).status).toBe(200);
  });

  it("kegagalan database setelah kedua UPDATE mengembalikan seluruh pertukaran", async () => {
    await send();
    const id = await requestId();
    const before = await schedule();
    await db.execute(sql`alter table schedule_requests add constraint test_approval_failure check (status <> 'approved')`);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await admin.post(`/api/admin/permintaan/${id}/setujui`, { response: "" })).status).toBe(500);
      expect(await schedule()).toEqual(before);
      expect(((await yusuf.get("/api/jadwal/permintaan")).data.requests as { status: string }[])[0].status).toBe("pending");
    } finally {
      log.mockRestore();
      await db.execute(sql`alter table schedule_requests drop constraint test_approval_failure`);
    }
  });
});
