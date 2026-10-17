import { eq, getTableName } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDashboard } from "@/server/dashboard";
import type { Db } from "@/server/db";
import { getHousePaymentInfo } from "@/server/payments";
import { houses, paymentPlans, payments, patrols, settings } from "@/server/schema";
import { createTestEnv } from "./helpers/db";

type MeasuredDb = Db & { $client: { query: (statement: string | { text: string }, params?: unknown[]) => Promise<{ rows: unknown[] }> } };
let db: MeasuredDb;
let houseIds: number[];
const today = "2026-10-17";
const queryText = (statement: unknown) => typeof statement === "string" ? statement : (statement as { text: string }).text;

beforeAll(async () => {
  db = (await createTestEnv()).db as MeasuredDb;
  await db.insert(settings).values({ communityName: "Natura" });
  houseIds = (await db.insert(houses).values(Array.from({ length: 20 }, (_, i) => ({
    block: "A", number: String(i + 1), token: `PERF${i}`,
  }))).returning({ id: houses.id })).map((house) => house.id);
  await db.insert(patrols).values({ date: today });
  await db.insert(paymentPlans).values(houseIds.map((houseId) => ({
    houseId, effectiveFrom: "2026-10-01", cadence: "monthly" as const, ratePerNight: 500, dueTiming: "end" as const,
  })));
  await db.insert(payments).values(houseIds.map((houseId) => ({
    houseId, clientId: crypto.randomUUID(), receivedDate: today, periodStart: "2026-10-01", periodEnd: "2026-10-31",
    cadence: "monthly" as const, amount: 15500, receivedBy: "treasurer" as const,
  })));
});

describe("pekerjaan database untuk halaman yang sering dibuka", () => {
  it("Ringkasan membaca kesepakatan dan penerimaan hanya sekali per permintaan", async () => {
    const query = vi.spyOn(db.$client, "query");
    try {
      const dashboard = await getDashboard(db, new Date(`${today}T13:00:00Z`));
      expect(dashboard.paymentOverview.receivedMonth).toBe(20 * 15500);
      const sql = query.mock.calls.map(([statement]) => queryText(statement));
      expect(sql.filter((statement) => statement.includes('from "payment_plans"'))).toHaveLength(1);
      expect(sql.filter((statement) => statement.includes('"client_id"') && statement.includes(`from "${getTableName(payments)}"`))).toHaveLength(1);
    } finally {
      query.mockRestore();
    }
  });

  it("QR membaca pembayaran satu rumah tanpa mengambil penerimaan semua tetangga", async () => {
    const query = vi.spyOn(db.$client, "query");
    try {
      const info = await getHousePaymentInfo(db, houseIds[0], today);
      expect(info.receipts).toHaveLength(1);
      expect(info.periods).toMatchObject([{ houseId: houseIds[0], paid: 15500 }]);
      const receiptIndex = query.mock.calls.findIndex(([statement]) => queryText(statement).includes(`from "${getTableName(payments)}"`));
      const receiptQuery = query.mock.calls[receiptIndex];
      expect(receiptQuery).toBeDefined();
      // Batas rumah harus dikirim ke database, bukan menyaring seluruh hasil di JavaScript.
      expect((await query.mock.results[receiptIndex].value).rows).toHaveLength(1);
      expect(receiptQuery[1]).toContain(houseIds[0]);
    } finally {
      query.mockRestore();
    }
  });

  it("Ringkasan berikutnya membaca ulang pembayaran yang dibatalkan", async () => {
    const now = new Date(`${today}T13:00:00Z`);
    const before = await getDashboard(db, now);
    await db.update(payments).set({ cancelledAt: now }).where(eq(payments.houseId, houseIds[0]));
    const after = await getDashboard(db, now);
    expect(after.paymentOverview.receivedMonth).toBe(before.paymentOverview.receivedMonth - 15500);
    expect(after.paymentOverview.unpaidHouses).toBe(1);
    expect(after.tonight.filled).toBe(before.tonight.filled - 1);
  });
});
