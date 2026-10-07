import { beforeAll, describe, expect, it } from "vitest";
import { addDays, localDate } from "@/lib/dates";
import { listHousesWithUsage } from "@/server/queries";
import { houses, paymentPlans } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";
import type { Db } from "@/server/db";

let db: Db;
let admin: ReturnType<typeof apiClient>;
let ids: number[];
const today = localDate(new Date());
const tomorrow = addDays(today, 1);

beforeAll(async () => {
  const test = await createTestEnv();
  db = test.db;
  admin = apiClient(test.env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  ids = (await db.insert(houses).values(Array.from({ length: 5 }, (_, i) => ({
    block: "Z", number: String(i + 1), token: "CADENCE" + i,
  }))).returning({ id: houses.id })).map((h) => h.id);
  await db.insert(paymentPlans).values(([
    { houseId: ids[1], cadence: "daily", effectiveFrom: today },
    { houseId: ids[2], cadence: "weekly", effectiveFrom: addDays(today, -1) },
    { houseId: ids[2], cadence: "monthly", effectiveFrom: tomorrow },
    { houseId: ids[3], cadence: "monthly", effectiveFrom: today },
    { houseId: ids[3], cadence: "daily", effectiveFrom: tomorrow },
    { houseId: ids[4], cadence: "monthly", effectiveFrom: tomorrow },
  ] as const).map((plan) => ({ ...plan, ratePerNight: 500, dueTiming: "start" as const })));
});

describe("cara pembayaran di Data rumah", () => {
  it("API memakai kesepakatan terbaru yang sudah berlaku, dengan harian sebagai bawaan", async () => {
    const res = await admin.get("/api/admin/rumah");
    expect(res.status).toBe(200);
    const rows = res.data.houses as { id: number; paymentCadence: string }[];
    expect(ids.map((id) => rows.find((h) => h.id === id)?.paymentCadence)).toEqual(["daily", "daily", "weekly", "monthly", "daily"]);
    const next = await listHousesWithUsage(db, tomorrow);
    expect(ids.map((id) => next.find((h) => h.id === id)?.paymentCadence)).toEqual(["daily", "daily", "monthly", "daily", "monthly"]);
  });
});
