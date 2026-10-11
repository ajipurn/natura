import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { isRecordingTime } from "@/lib/recording-window";
import { applyEntries } from "@/server/collections";
import { getCollectionsForDate } from "@/server/queries";
import { collectionLogs, houses, settings, users } from "@/server/schema";
import type { EntryInput } from "@/lib/types";
import type { SessionUser } from "@/server/auth";
import { apiClient, createTestEnv } from "./helpers/db";

describe("jam pencatatan WIB", () => {
  it.each([
    ["2026-10-10T19:59:59+07:00", false],
    ["2026-10-10T20:00:00+07:00", true],
    ["2026-10-10T23:59:59+07:00", true],
    ["2026-10-11T00:00:00+07:00", false],
  ])("batas waktu %s: %s", (time, expected) => {
    expect(isRecordingTime(new Date(time))).toBe(expected);
  });
  it("memakai WIB meskipun input waktu berzona lain", () => {
    expect(isRecordingTime(new Date("2026-10-10T13:00:00Z"))).toBe(true);
    expect(isRecordingTime(new Date("2026-10-10T20:00:00Z"))).toBe(false);
  });
});

let env: Awaited<ReturnType<typeof createTestEnv>>;
let admin: ReturnType<typeof apiClient>;
let staff: SessionUser;
let houseId: number;
const token = "SCANTIMEQR";
const entry = (time: string, method: EntryInput["method"] = "scan"): EntryInput => ({
  clientId: crypto.randomUUID(), houseId, status: "filled", amount: 500, method, recordedAt: time,
});

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T21:00:00+07:00"));
  env = await createTestEnv();
  admin = apiClient(env.env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  staff = (await env.db.select().from(users))[0];
  expect((await admin.patch(`/api/admin/petugas/${staff.id}`, { name: staff.name, role: "admin", active: true, days: [6], houseId: null })).status).toBe(200);
  [houseId] = (await env.db.insert(houses).values({ block: "A", number: "1", token }).returning({ id: houses.id })).map((h) => h.id);
});
beforeEach(async () => {
  vi.setSystemTime(new Date("2026-10-10T21:00:00+07:00"));
  await env.db.update(settings).set({ recordingStart: "20:00", recordingEnd: "00:00" });
});
afterAll(() => vi.useRealTimers());

describe("pengaturan dan semua jalur pencatatan", () => {
  it("pengaturan awal diterima dashboard dan snapshot offline", async () => {
    expect((await admin.get("/api/admin/pengaturan")).data).toMatchObject({ recordingStart: "20:00", recordingEnd: "00:00" });
    expect((await admin.get("/api/ronda")).data.settings).toMatchObject({ recordingStart: "20:00", recordingEnd: "00:00" });
  });
  it.each([
    ["2026-10-10T19:59:59+07:00", false],
    ["2026-10-10T20:00:00+07:00", true],
    ["2026-10-10T23:59:59+07:00", true],
    ["2026-10-11T00:00:00+07:00", false],
  ])("QR publik dan antrean scan/manual mematuhi %s", async (time, allowed) => {
    vi.setSystemTime(new Date(time));
    expect((await admin.get(`/api/rumah/${token}`)).data).toMatchObject({ canRecord: allowed, onDuty: true, recordingOpen: allowed });
    expect((await admin.post(`/api/rumah/${token}/catat`, { status: "filled", amount: 500 })).status).toBe(allowed ? 200 : 400);
    const result = await admin.post("/api/ronda/catatan", { entries: [entry(time), entry(time, "manual")] });
    expect((result.data.results as { ok: boolean }[]).map((r) => r.ok)).toEqual([allowed, allowed]);
  });
  it("perubahan dashboard berlaku setelah tengah malam, dengan tanggal dan jadwal malam sebelumnya", async () => {
    expect((await admin.put("/api/admin/pengaturan", { communityName: "Natura", defaultAmount: 500, recordingStart: "19:30", recordingEnd: "01:30" })).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-11T01:29:59+07:00"));
    expect((await admin.get(`/api/rumah/${token}`)).data).toMatchObject({ tonight: "2026-10-10", canRecord: true, recordingHours: "19.30–01.30 WIB" });
    expect((await admin.post("/api/ronda/catatan", { entries: [entry(new Date().toISOString())] })).data).toMatchObject({ results: [{ ok: true, date: "2026-10-10" }] });
    vi.setSystemTime(new Date("2026-10-11T01:30:00+07:00"));
    expect((await admin.get(`/api/rumah/${token}`)).data.canRecord).toBe(false);
  });
  it("menolak format salah, jam sama, atau hanya satu batas; klien lama mempertahankan jam tersimpan", async () => {
    const base = { communityName: "Natura", defaultAmount: 500 };
    for (const value of [
      { recordingStart: "24:00", recordingEnd: "00:00" },
      { recordingStart: "20:00", recordingEnd: "20:00" },
      { recordingStart: "19:00" },
    ]) expect((await admin.put("/api/admin/pengaturan", { ...base, ...value })).status).toBe(400);
    await admin.put("/api/admin/pengaturan", { ...base, recordingStart: "19:00", recordingEnd: "02:00" });
    await admin.put("/api/admin/pengaturan", base);
    expect((await admin.get("/api/admin/pengaturan")).data).toMatchObject({ recordingStart: "19:00", recordingEnd: "02:00" });
  });
  it("antrean offline dinilai berdasarkan waktu catat; catatan di luar jam tidak masuk audit", async () => {
    vi.setSystemTime(new Date("2026-10-11T09:00:00+07:00"));
    const valid = entry("2026-10-10T23:59:59+07:00");
    const invalid = entry("2026-10-11T00:00:00+07:00");
    expect(await applyEntries(env.db, staff, [valid, invalid])).toMatchObject([{ ok: true, date: "2026-10-10" }, { ok: false }]);
    expect(await env.db.select().from(collectionLogs).where(eq(collectionLogs.clientId, invalid.clientId))).toEqual([]);
  });
  it("jam terbuka tetap membutuhkan jadwal orang; koreksi dashboard tetap bisa dilakukan di luar jam", async () => {
    const offDuty = Number((await admin.post("/api/admin/petugas", { name: "Tidak jaga", pin: "1234", role: "petugas" })).data.id);
    const wargaId = Number((await admin.post("/api/admin/petugas", { name: "Warga", pin: "1234", role: "warga" })).data.id);
    for (const id of [offDuty, wargaId]) {
      const client = apiClient(env.env);
      await client.post("/api/auth/login", { userId: id, pin: "1234" });
      expect((await client.get(`/api/rumah/${token}`)).data.canRecord).toBe(false);
      const result = await client.post("/api/ronda/catatan", { entries: [entry(new Date().toISOString())] });
      if (id === wargaId) expect(result.status).toBe(403);
      else expect(result.data).toMatchObject({ results: [{ ok: false }] });
    }
    vi.setSystemTime(new Date("2026-10-11T09:00:00+07:00"));
    expect((await admin.put(`/api/admin/riwayat/2026-10-10/${houseId}`, { status: "filled", amount: 1000 })).status).toBe(200);
    expect(await getCollectionsForDate(env.db, "2026-10-10")).toContainEqual(expect.objectContaining({ houseId, amount: 1000 }));
  });
});
