import { beforeAll, describe, expect, it } from "vitest";
import { summarize } from "@/lib/recap";
import type { BillingPeriod } from "@/lib/payments";
import type { CollectionDTO, HouseDTO } from "@/lib/types";
import { apiClient, createTestEnv } from "./helpers/db";
import { paymentPlans } from "@/server/schema";

const date = "2025-03-07";
let admin: ReturnType<typeof apiClient>;
let monthly: HouseDTO;

type NightDetail = { houses: HouseDTO[]; collections: CollectionDTO[]; paymentPeriods: BillingPeriod[] };
type HistoryNight = { date: string; filled: number; empty: number; total: number; checked: number; unchecked: number; expected: number };

beforeAll(async () => {
  const { db, env } = await createTestEnv();
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "A", numbers: "1-4" });
  const houses = (await admin.get("/api/admin/rumah")).data.houses as HouseDTO[];
  monthly = houses[1];
  for (const [house, cadence] of [[monthly, "monthly"], [houses[2], "weekly"]] as const) {
    if (cadence === "weekly") {
      await db.insert(paymentPlans).values({ houseId: house.id, effectiveFrom: "2025-03-01", cadence, ratePerNight: 500, dueTiming: "end" });
      continue;
    }
    expect((await admin.put(`/api/admin/pembayaran/kesepakatan/${house.id}`, {
      effectiveFrom: "2025-03-01", cadence, ratePerNight: 500,
    })).status).toBe(200);
  }
  expect((await admin.put(`/api/admin/riwayat/${date}/${houses[0].id}`, { status: "filled", amount: 500 })).status).toBe(200);
});

async function compareHistory() {
  const detail = (await admin.get(`/api/riwayat/${date}`)).data as NightDetail;
  const summary = summarize(detail.houses, detail.collections, detail.paymentPeriods);
  // Kedua alamat dipakai daftar riwayat dan kalender tanggal ronda.
  for (const path of ["/api/riwayat", "/api/riwayat?bulan=2025-03"]) {
    const data = (await admin.get(path)).data;
    const night = (data.patrols as HistoryNight[]).find((p) => p.date === date)!;
    expect(night).toMatchObject({
      filled: summary.filled.length, empty: summary.empty.length, total: summary.total,
      checked: summary.checked, unchecked: summary.unchecked.length, expected: summary.expected,
    });
    expect(data.activeHouses).toBe(summary.expected);
  }
  return { detail, summary };
}

describe("jumlah riwayat sama dengan detail malam", () => {
  it("mingguan dan bulanan tanpa scan sudah berstatus otomatis; harian tanpa catatan masih belum dicek", async () => {
    const { summary } = await compareHistory();
    expect(summary).toMatchObject({ checked: 3, expected: 4, total: 500 });
    expect(summary.filled).toHaveLength(1);
    expect(summary.empty).toHaveLength(2);
    expect(summary.unchecked).toHaveLength(1);
  });

  it("pembayaran bulanan mengubah status kosong lama menjadi ada tanpa menambah uang ronda", async () => {
    expect((await admin.put(`/api/admin/riwayat/${date}/${monthly.id}`, { status: "empty", amount: 0 })).status).toBe(200);
    expect((await admin.post("/api/admin/pembayaran", {
      clientId: crypto.randomUUID(), houseId: monthly.id, receivedDate: date, periodStart: "2025-03-01", periodEnd: "2025-03-31",
      cadence: "monthly", amount: 15500, receivedBy: "treasurer", collectorId: null, note: "",
    })).status).toBe(200);
    const { summary } = await compareHistory();
    expect(summary).toMatchObject({ checked: 3, expected: 4, total: 500 });
    expect(summary.filled).toHaveLength(2);
    expect(summary.empty).toHaveLength(1);
    expect(summary.unchecked).toHaveLength(1);
    const cash = (await admin.get("/api/admin/kas?bulan=2025-03")).data;
    expect(cash.nights).toEqual([expect.objectContaining({ date, recorded: 500, filled: 1 })]);
  });

  it("uang dari rumah yang sekarang mudik tetap diakui tanpa dianggap pemeriksaan rumah aktif", async () => {
    const [house] = (await admin.get("/api/admin/rumah")).data.houses as HouseDTO[];
    expect((await admin.patch(`/api/admin/rumah/${house.id}`, { block: house.block, number: house.number, ownerName: "", status: "vacant" })).status).toBe(200);
    const { summary } = await compareHistory();
    expect(summary).toMatchObject({ checked: 2, expected: 3, total: 500 });
    expect(summary.filled).toHaveLength(2);
    expect(summary.empty).toHaveLength(1);
    expect(summary.unchecked).toHaveLength(1);
  });

  it("pergantian kesepakatan ke harian kembali membutuhkan catatan pada tanggal mulai berlaku", async () => {
    const houses = (await admin.get("/api/admin/rumah")).data.houses as HouseDTO[];
    expect((await admin.put(`/api/admin/pembayaran/kesepakatan/${houses[2].id}`, {
      effectiveFrom: date, cadence: "daily", ratePerNight: 500,
    })).status).toBe(200);
    const { summary } = await compareHistory();
    expect(summary).toMatchObject({ checked: 1, expected: 3, total: 500 });
    expect(summary.empty).toHaveLength(0);
    expect(summary.unchecked).toHaveLength(2);
  });
});
