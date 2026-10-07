import { beforeAll, describe, expect, it } from "vitest";
import { rondaHouseState } from "@/lib/house-state";
import type { BillingPeriod } from "@/lib/payments";
import { summarize } from "@/lib/recap";
import type { CollectionDTO, HouseDTO } from "@/lib/types";
import { apiClient, createTestEnv } from "./helpers/db";

const date = "2025-03-07";
let admin: ReturnType<typeof apiClient>;

beforeAll(async () => {
  const { env } = await createTestEnv();
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "AF", numbers: "13" });
  const [house] = (await admin.get("/api/admin/rumah")).data.houses as HouseDTO[];
  expect((await admin.put(`/api/admin/pembayaran/kesepakatan/${house.id}`, {
    effectiveFrom: "2025-03-01", cadence: "monthly", ratePerNight: 500,
  })).status).toBe(200);
  expect((await admin.put(`/api/admin/riwayat/${date}/${house.id}`, {
    status: "filled", amount: 500,
  })).status).toBe(200);
});

describe("status isi ronda dengan pembayaran bulanan", () => {
  it("peta tetap menghitung catatan isi yang ditampilkan riwayat walaupun bulanan belum lunas", async () => {
    const history = (await admin.get("/api/riwayat?bulan=2025-03")).data.patrols as {
      date: string; filled: number; empty: number; total: number;
    }[];
    const night = history.find((p) => p.date === date)!;
    expect(night).toMatchObject({ filled: 1, empty: 0, total: 500 });

    const detail = (await admin.get(`/api/riwayat/${date}`)).data as {
      houses: HouseDTO[]; collections: CollectionDTO[]; paymentPeriods: BillingPeriod[];
    };
    // Uang harian diakui, tetapi tidak melunasi kewajiban satu bulan.
    expect(detail.paymentPeriods[0]).toMatchObject({ status: "unpaid", paid: 500, remaining: 15000 });
    const map = summarize(detail.houses, detail.collections, detail.paymentPeriods);
    expect(map.filled).toHaveLength(night.filled);
    expect(map.empty).toHaveLength(night.empty);
    expect(map.total).toBe(night.total);
    expect(rondaHouseState(detail.houses[0], detail.collections[0], detail.paymentPeriods[0])).toBe("filled");
  });

  it("tetap memakai status otomatis untuk periode yang sudah lunas atau belum dicatat", () => {
    const house = { status: "active" as const };
    expect(rondaHouseState(house, undefined, { status: "paid" })).toBe("filled");
    expect(rondaHouseState(house, { status: "empty" }, { status: "paid" })).toBe("filled");
    expect(rondaHouseState(house, undefined, { status: "unpaid" })).toBe("empty");
    expect(rondaHouseState(house, { status: "empty" }, { status: "unpaid" })).toBe("empty");
    expect(rondaHouseState(house)).toBe("unchecked");
    expect(rondaHouseState({ status: "vacant" }, { status: "filled" }, { status: "unpaid" })).toBe("vacant");
  });
});
