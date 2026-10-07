import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { HouseMonthStats, MonthStats } from "@/lib/month-stats";
import type { HouseDTO } from "@/lib/types";
import { houses } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

let admin: ReturnType<typeof apiClient>;
let warga: ReturnType<typeof apiClient>;
let home: HouseDTO;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  const { env, db } = await createTestEnv();
  admin = apiClient(env);
  warga = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "AA", numbers: "8-9" });
  const homes = (await admin.get("/api/admin/rumah")).data.houses as HouseDTO[];
  home = homes[1];
  await db.update(houses).set({ createdAt: new Date("2026-10-05T12:00:00+07:00") }).where(eq(houses.id, home.id));
  await admin.put("/api/admin/jadwal/slot", { slots: [
    { day: 3, name: "Bisa standby", color: "green" }, { day: 3, name: "Kadang kuning", color: "yellow" },
    { day: 3, name: "Kadang oranye", color: "orange" }, { day: 3, name: "Tidak bisa biru", color: "blue" },
    { day: 3, name: "Tidak ikut putih", color: null },
  ] });
  await admin.put("/api/admin/riwayat", { entries: [
    { date: "2026-10-05", houseId: homes[0].id, status: "empty", amount: 0 },
    { date: "2026-10-06", houseId: home.id, status: "filled", amount: 500 },
    { date: "2026-10-07", houseId: home.id, status: "filled", amount: 500 },
  ] });
  const { data } = await admin.post("/api/admin/pengaturan/kode-warga", { enabled: true });
  expect((await warga.post("/api/warga/masuk", { code: data.wargaCode })).status).toBe(200);
});
afterAll(() => vi.useRealTimers());

describe("rekap kalender untuk warga", () => {
  it("menyembunyikan petugas biru dan putih hanya dari informasi warga", async () => {
    const info = await warga.get("/api/warga");
    expect((info.data.schedule as { name: string }[]).map((s) => s.name)).toEqual(["Bisa standby", "Kadang kuning", "Kadang oranye"]);
    expect(((await admin.get("/api/jadwal")).data.schedule as unknown[])).toHaveLength(5);
  });

  it("tanggal 7 menghitung tujuh malam sejak awal bulan, walaupun catatan rumah hanya tanggal 6 dan 7", async () => {
    const data = (await warga.get("/api/warga/rekap?bulan=2026-10")).data as MonthStats;
    expect(data.nights).toBe(7);
    expect(data.perNight.map((n) => n.date)).toEqual(Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`));
    expect(data.perHouse.find((h) => h.id === home.id)).toMatchObject({ filled: 2, empty: 0, unchecked: 5, total: 1000 });
    expect(data.perHouse[0]).not.toHaveProperty("ownerName");
    expect(data.perHouse[0]).not.toHaveProperty("token");
  });

  it("bulan sebelumnya memuat semua malam; tanggal mendatang belum dihitung", async () => {
    expect((await warga.get("/api/warga/rekap?bulan=2026-09")).data.nights).toBe(30);
    expect((await warga.get("/api/warga/rekap?bulan=2026-11")).data.nights).toBe(0);
  });

  it("periode lunas otomatis terisi tujuh malam tanpa catatan scan atau uang harian tambahan", async () => {
    await admin.post("/api/admin/rumah", { block: "AB", numbers: "1" });
    const monthly = ((await admin.get("/api/admin/rumah")).data.houses as HouseDTO[]).find((h) => h.block === "AB")!;
    await admin.put(`/api/admin/pembayaran/kesepakatan/${monthly.id}`, { effectiveFrom: "2026-10-01", cadence: "monthly", ratePerNight: 500 });
    await admin.post("/api/admin/pembayaran", { clientId: crypto.randomUUID(), houseId: monthly.id, receivedDate: "2026-10-07", periodStart: "2026-10-01", periodEnd: "2026-10-31", cadence: "monthly", amount: 15500, receivedBy: "treasurer", collectorId: null, note: "" });
    const data = (await warga.get("/api/warga/rekap?bulan=2026-10")).data as MonthStats;
    expect(data.perHouse.find((h) => h.id === monthly.id) as HouseMonthStats).toMatchObject({ filled: 7, empty: 0, unchecked: 0, periodTotal: 15500, total: 15500 });
    expect(data.perNight.reduce((sum, n) => sum + n.total, 0)).toBe(1000);
  });
});
