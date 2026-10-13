import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleDay } from "@/lib/schedule";
import type { EntryInput, RondaSnapshot } from "@/lib/types";
import type { Db } from "@/server/db";
import type { CashMonth } from "@/server/kas";
import { hashPin } from "@/server/pin";
import { cashDeposits, collectionLogs, collections, houses, paymentLogs, payments, patrols, rondaSchedule, users } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";
import { profileForUser } from "./helpers/residents";

const date = "2026-10-12";
let db: Db, admin: ReturnType<typeof apiClient>, staff: ReturnType<typeof apiClient>, offDuty: ReturnType<typeof apiClient>, resident: ReturnType<typeof apiClient>, guest: ReturnType<typeof apiClient>;
let houseIds: number[], staffId: number;
const cash = async () => (await admin.get("/api/admin/kas?bulan=2026-10")).data as unknown as CashMonth;
const snapshot = async () => (await staff.get("/api/ronda")).data as unknown as RondaSnapshot;
const submit = () => staff.post("/api/ronda/setoran", { date });
const entry = (houseId: number, partial: Partial<EntryInput> = {}): EntryInput => ({ clientId: crypto.randomUUID(), houseId, status: "filled", amount: 500, method: "manual", recordedAt: new Date().toISOString(), ...partial });
const record = (entries: EntryInput[]) => staff.post("/api/ronda/catatan", { entries });
const finish = (amount = 500) => admin.put("/api/admin/riwayat", { entries: [
  { date, houseId: houseIds[0], status: amount ? "filled" : "empty", amount },
  { date, houseId: houseIds[1], status: "empty", amount: 0 },
] });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T21:00:00+07:00"));
  const test = await createTestEnv(); db = test.db;
  [admin, staff, offDuty, resident, guest] = Array.from({ length: 5 }, () => apiClient(test.env));
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  houseIds = (await db.insert(houses).values([1, 2, 3, 4].map((n) => ({ block: "A", number: String(n), token: `DEPOSIT${n}`, status: n === 4 ? "vacant" as const : "active" as const }))).returning()).map((h) => h.id);
  const pinHash = await hashPin("4321");
  const accounts = await db.insert(users).values([{ name: "Yusuf", pinHash, role: "petugas" }, { name: "Nino", pinHash, role: "petugas" }, { name: "Warga", pinHash, role: "warga" }]).returning();
  staffId = accounts[0].id;
  await db.insert(rondaSchedule).values({ residentId: await profileForUser(db, staffId), dayOfWeek: scheduleDay(date), position: 0 });
  for (const [client, user] of [[staff, accounts[0]], [offDuty, accounts[1]], [resident, accounts[2]]] as const) await client.post("/api/auth/login", { userId: user.id, pin: "4321" });
  await admin.put(`/api/admin/pembayaran/kesepakatan/${houseIds[2]}`, { effectiveFrom: "2026-10-01", cadence: "monthly", ratePerNight: 500 });
});
beforeEach(async () => {
  vi.setSystemTime(new Date("2026-10-12T21:00:00+07:00"));
  await db.delete(cashDeposits); await db.delete(paymentLogs); await db.delete(payments); await db.delete(collectionLogs); await db.delete(collections); await db.delete(patrols);
});
afterAll(() => vi.useRealTimers());

describe("pengajuan setoran setelah ronda", () => {
  it("catatan terakhir otomatis mengajukan, rumah bulanan dan mudik tidak perlu diperiksa, kiriman ulang tetap sekali", async () => {
    expect((await record([entry(houseIds[0])])).data.results).toMatchObject([{ ok: true }]);
    expect((await snapshot()).depositSubmission?.requestedAt).toBeNull();
    const last = entry(houseIds[1], { status: "empty", amount: 0 });
    const results = await Promise.all([record([last]), record([last])]);
    expect(results.every((result) => result.status === 200)).toBe(true);
    const requested = (await snapshot()).depositSubmission;
    expect(requested).toMatchObject({ requestedAt: new Date().toISOString(), requestedByName: "Yusuf", receivedAmount: null });
    expect(await cash()).toMatchObject({ balance: 0, transactions: [], undeposited: [date] });
    expect((await admin.get("/api/admin/ringkasan")).data.todo).toMatchObject({ undeposited: 1 });
    vi.setSystemTime(new Date("2026-10-12T21:05:00+07:00"));
    await record([last]);
    expect((await snapshot()).depositSubmission?.requestedAt).toBe(requested?.requestedAt);
    expect(await db.select().from(patrols)).toHaveLength(1);
  });

  it("scan terakhir dari kamera HP juga mengajukan tanpa membuka app Ronda", async () => {
    await record([entry(houseIds[0])]);
    expect((await staff.post("/api/rumah/DEPOSIT2/catat", { status: "empty", amount: 0 })).status).toBe(200);
    expect((await snapshot()).depositSubmission?.requestedByName).toBe("Yusuf");
    expect(await cash()).toMatchObject({ balance: 0, undeposited: [date] });
  });

  it("antrean offline yang diterima hari berikutnya mengajukan untuk tanggal ronda aslinya", async () => {
    const entries = [entry(houseIds[0]), entry(houseIds[1], { status: "empty", amount: 0 })];
    vi.setSystemTime(new Date("2026-10-13T21:00:00+07:00"));
    expect((await record(entries)).data.results).toMatchObject([{ ok: true, date }, { ok: true, date }]);
    const [patrol] = await db.select().from(patrols);
    expect(patrol).toMatchObject({ date, depositRequestedBy: staffId, depositRequestedAt: new Date() });
    expect((await snapshot()).depositSubmission?.requestedAt).toBeNull();
    expect(await cash()).toMatchObject({ balance: 0, undeposited: [date] });
  });

  it("penolakan atau penghapusan catatan menahan pengajuan sampai hasil sinkron lengkap", async () => {
    await finish();
    expect((await record([entry(houseIds[0]), entry(999999)])).data.results).toMatchObject([{ ok: true }, { ok: false }]);
    expect((await snapshot()).depositSubmission?.requestedAt).toBeNull();
    await record([entry(houseIds[0], { status: "none", amount: 0, recordedAt: new Date(Date.now() + 1000).toISOString() })]);
    expect((await snapshot()).depositSubmission?.requestedAt).toBeNull();
    await record([entry(houseIds[0], { recordedAt: new Date(Date.now() + 2000).toISOString() })]);
    expect((await snapshot()).depositSubmission?.requestedAt).not.toBeNull();
  });

  it("catatan kosong semua tetap diajukan sebagai setoran nol", async () => {
    await record(houseIds.slice(0, 2).map((id) => entry(id, { status: "empty", amount: 0 })));
    expect((await snapshot()).depositSubmission?.requestedAt).not.toBeNull();
    expect(await cash()).toMatchObject({ balance: 0, transactions: [], nights: [{ recorded: 0, deposit: null }], undeposited: [date] });
  });

  it("menolak catatan belum lengkap, tanggal salah, akun tanpa tugas, warga, dan tamu", async () => {
    await admin.put(`/api/admin/riwayat/${date}/${houseIds[0]}`, { status: "filled", amount: 500 });
    expect((await submit()).status).toBe(409);
    expect((await snapshot()).depositSubmission?.requestedAt).toBeNull();
    await finish();
    expect((await staff.post("/api/ronda/setoran", { date: "2026-02-30" })).status).toBe(400);
    expect((await staff.post("/api/ronda/setoran", { date: "2026-10-11" })).status).toBe(409);
    expect((await offDuty.post("/api/ronda/setoran", { date })).status).toBe(403);
    expect((await resident.post("/api/ronda/setoran", { date })).status).toBe(403);
    expect((await guest.post("/api/ronda/setoran", { date })).status).toBe(401);
    expect((await staff.put(`/api/admin/kas/setoran/${date}`, { amount: 500 })).status).toBe(403);
  });

  it("pengajuan ganda tetap satu malam, muncul malam ini sebelum setoran pertama, dan tidak menambah kas", async () => {
    await finish();
    const results = await Promise.all([submit(), submit()]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const before = (await snapshot()).depositSubmission;
    vi.setSystemTime(new Date("2026-10-12T21:05:00+07:00"));
    expect((await submit()).status).toBe(200);
    expect((await snapshot()).depositSubmission?.requestedAt).toBe(before?.requestedAt);
    expect(await db.select().from(patrols).where(eq(patrols.date, date))).toHaveLength(1);
    const pending = await cash();
    expect(pending).toMatchObject({ balance: 0, transactions: [], undeposited: [date] });
    expect(pending.nights).toEqual([expect.objectContaining({ date, recorded: 500, deposit: null, submission: { requestedAt: before?.requestedAt, requestedByName: "Yusuf" } })]);
    const dashboard = (await admin.get("/api/admin/ringkasan")).data;
    expect(dashboard.todo).toMatchObject({ undeposited: 1 });

    await admin.put(`/api/admin/kas/setoran/${date}`, { amount: 500 });
    expect(await cash()).toMatchObject({ balance: 500, undeposited: [], transactions: [expect.objectContaining({ source: "deposit", amount: 500 })] });
    expect((await snapshot()).depositSubmission?.receivedAmount).toBe(500);
    await submit();
    expect((await cash()).transactions).toHaveLength(1);
  });

  it("pembayaran bulanan ke petugas ikut disetor, pembayaran langsung bendahara tetap dihitung sekali", async () => {
    await finish();
    const payment = { houseId: houseIds[2], receivedDate: date, periodStart: "2026-10-01", periodEnd: "2026-10-31", cadence: "monthly", note: "" };
    for (const [receivedBy, amount] of [["collector", 1500], ["treasurer", 1000]] as const) {
      expect((await admin.post("/api/admin/pembayaran", { ...payment, clientId: crypto.randomUUID(), amount, receivedBy, collectorId: receivedBy === "collector" ? staffId : null })).status).toBe(200);
    }
    expect((await snapshot()).depositSubmission?.periodAmount).toBe(1500);
    await submit();
    expect((await cash()).balance).toBe(1000);
    expect((await cash()).nights[0]).toMatchObject({ recorded: 2000, periodPayments: 1500, deposit: null });
    await admin.put(`/api/admin/kas/setoran/${date}`, { amount: 2000 });
    expect((await cash()).balance).toBe(3000);
    expect((await cash()).transactions.map((t) => t.amount).sort((a, b) => a - b)).toEqual([1000, 2000]);
  });

  it("koreksi sesudah pengajuan memakai nominal terbaru tanpa menyimpan pemasukan kedua", async () => {
    await finish(); await submit(); await finish(1000);
    expect((await cash()).nights[0]).toMatchObject({ recorded: 1000, submission: { requestedByName: "Yusuf" } });
    expect((await cash()).balance).toBe(0);
    await admin.put(`/api/admin/kas/setoran/${date}`, { amount: 1000 });
    expect((await cash()).balance).toBe(1000);
  });

  it("ronda tanpa uang tetap bisa diajukan dan dicocokkan sebagai setoran nol", async () => {
    await finish(0);
    expect((await submit()).status).toBe(200);
    expect((await cash()).nights).toMatchObject([{ recorded: 0, deposit: null, submission: { requestedByName: "Yusuf" } }]);
    expect((await cash()).undeposited).toEqual([date]);
    await admin.put(`/api/admin/kas/setoran/${date}`, { amount: 0 });
    expect(await cash()).toMatchObject({ balance: 0, undeposited: [] });
    expect((await snapshot()).depositSubmission?.receivedAmount).toBe(0);
  });
});
