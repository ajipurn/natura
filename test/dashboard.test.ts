import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDashboard } from "@/server/dashboard";
import type { Db } from "@/server/db";
import { paymentPlans, payments } from "@/server/schema";
import type { HouseDTO } from "@/lib/types";
import { apiClient, createTestEnv } from "./helpers/db";

let db: Db;
let homeIds: number[];
let admin: ReturnType<typeof apiClient>;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  const test = await createTestEnv();
  db = test.db;
  admin = apiClient(test.env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "A", numbers: "1-6" });
  const homes = (await admin.get("/api/admin/rumah")).data.houses as HouseDTO[];
  homeIds = homes.map((h) => h.id);
  await admin.post("/api/admin/petugas", { name: "Nama akun warga", pin: "5678", role: "petugas", houseId: homeIds[1] });
  await admin.patch(`/api/admin/rumah/${homeIds[5]}`, { block: "A", number: "6", ownerName: null, status: "vacant" });
  for (const houseId of homeIds.slice(2, 4)) await admin.put(`/api/admin/pembayaran/kesepakatan/${houseId}`, { effectiveFrom: "2026-10-01", cadence: "monthly", ratePerNight: 500 });
  await admin.post("/api/admin/pembayaran", { clientId: crypto.randomUUID(), houseId: homeIds[3], receivedDate: "2026-10-07", periodStart: "2026-10-01", periodEnd: "2026-10-31", cadence: "monthly", amount: 15500, receivedBy: "treasurer", collectorId: null, note: "" });
  await admin.put("/api/admin/riwayat", { entries: [
    { date: "2026-10-06", houseId: homeIds[1], status: "filled", amount: 500 },
    { date: "2026-10-07", houseId: homeIds[0], status: "filled", amount: 500 },
    { date: "2026-10-07", houseId: homeIds[1], status: "empty", amount: 0 },
    { date: "2026-10-07", houseId: homeIds[2], status: "empty", amount: 0 },
    { date: "2026-10-07", houseId: homeIds[3], status: "empty", amount: 0 },
    { date: "2026-10-07", houseId: homeIds[5], status: "filled", amount: 1000 },
  ] });
});
afterAll(() => vi.useRealTimers());
describe("angka ringkasan sesuai jenis pemeriksaan", () => {
  it("menghitung progres harian terpisah dari rumah periode otomatis", async () => {
    const d = await getDashboard(db, new Date());
    expect(d.tonight).toMatchObject({ expected: 5, checked: 4, filled: 2, empty: 2, unchecked: 1, vacant: 1, automatic: 2, daily: { expected: 3, checked: 2, unchecked: 1 } });
  });
  it("uang ronda dan rumah yang benar-benar berisi tidak bertambah karena pembayaran otomatis", async () => {
    const d = await getDashboard(db, new Date());
    expect(d.tonight).toMatchObject({ total: 1500, collectedHouses: 2 });
    expect(d.monthSummary.total).toBe(17500);
  });
  it("sering kosong hanya dari hasil harian; periode belum bayar dan rumah mudik tidak masuk", async () => {
    const d = await getDashboard(db, new Date());
    expect(d.oftenEmpty).toMatchObject([{ id: homeIds[1], label: "A-2", ownerName: "Nama akun warga", empty: 1, nights: 2, emptyStreak: 1, lastChecked: "2026-10-07" }]);
  });
  it("pembayaran mingguan mengubah warna status tanpa menambah progres scan atau uang ronda", async () => {
    await db.insert(paymentPlans).values({ houseId: homeIds[4], effectiveFrom: "2026-10-01", cadence: "weekly", ratePerNight: 500, dueTiming: "end" });
    expect((await getDashboard(db, new Date())).tonight).toMatchObject({ automatic: 3, filled: 2, empty: 3, unchecked: 0, daily: { expected: 2, checked: 2, unchecked: 0 } });
    await db.insert(payments).values({ clientId: crypto.randomUUID(), houseId: homeIds[4], receivedDate: "2026-10-07", periodStart: "2026-10-05", periodEnd: "2026-10-11", cadence: "weekly", amount: 3500, receivedBy: "treasurer" });
    expect((await getDashboard(db, new Date())).tonight).toMatchObject({ automatic: 3, filled: 3, empty: 2, total: 1500, collectedHouses: 2, daily: { expected: 2, checked: 2, unchecked: 0 } });
  });
});
