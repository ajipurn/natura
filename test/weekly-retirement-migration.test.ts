import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { planAt } from "@/lib/payments";
import { getHousePaymentInfo } from "@/server/payments";
import { houses, paymentPlans, payments } from "@/server/schema";
import { createTestEnv } from "./helpers/db";

it("migrasi mingguan ke harian menjaga tarif, riwayat, penerimaan uang, dan kesepakatan mendatang", async () => {
  const { db } = await createTestEnv();
  const today = (await db.execute<{ today: string }>(sql`select ((now() at time zone 'Asia/Jakarta')::date)::text as today`)).rows[0].today;
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const homes = await db.insert(houses).values(Array.from({ length: 6 }, (_, i) => ({ block: "M", number: String(i + 1), token: `RETIREWEEK${i}` }))).returning();
  const original = await db.insert(paymentPlans).values([
    { houseId: homes[0].id, cadence: "weekly", effectiveFrom: addDays(today, -10), ratePerNight: 700, dueTiming: "end", weekStart: 6 },
    { houseId: homes[0].id, cadence: "weekly", effectiveFrom: tomorrow, ratePerNight: 900, dueTiming: "end" },
    { houseId: homes[0].id, cadence: "monthly", effectiveFrom: addDays(today, 5), ratePerNight: 1000, dueTiming: "end" },
    { houseId: homes[1].id, cadence: "weekly", effectiveFrom: today, ratePerNight: 1000, dueTiming: "end" },
    { houseId: homes[2].id, cadence: "weekly", effectiveFrom: addDays(today, -10), ratePerNight: 500, dueTiming: "end" },
    { houseId: homes[2].id, cadence: "monthly", effectiveFrom: yesterday, ratePerNight: 600, dueTiming: "end" },
    { houseId: homes[3].id, cadence: "weekly", effectiveFrom: tomorrow, ratePerNight: 800, dueTiming: "end" },
    { houseId: homes[4].id, cadence: "weekly", effectiveFrom: addDays(today, -10), ratePerNight: 500, dueTiming: "end" },
    { houseId: homes[4].id, cadence: "daily", effectiveFrom: yesterday, ratePerNight: 600, dueTiming: "end" },
    { houseId: homes[5].id, cadence: "monthly", effectiveFrom: yesterday, ratePerNight: 500, dueTiming: "end" },
  ]).returning();
  const received = await db.insert(payments).values({ clientId: crypto.randomUUID(), houseId: homes[0].id, cadence: "weekly", receivedDate: yesterday, periodStart: addDays(today, -5), periodEnd: tomorrow, amount: 4900, receivedBy: "treasurer", note: "Riwayat mingguan" }).returning();
  const migration = readFileSync(new URL("../drizzle/0013_retire_weekly_payments.sql", import.meta.url), "utf8");
  const apply = () => db.transaction(async (tx) => {
    for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
  });
  await apply();
  const updated = await db.select().from(paymentPlans);
  expect(planAt(updated, homes[0].id, today)).toMatchObject({ cadence: "daily", ratePerNight: 700, effectiveFrom: today, weekStart: 6 });
  expect(updated.find((p) => p.id === original[0].id)).toEqual(original[0]);
  expect(planAt(updated, homes[0].id, yesterday)).toMatchObject({ cadence: "weekly", ratePerNight: 700 });
  expect(planAt(updated, homes[0].id, tomorrow)).toMatchObject({ cadence: "daily", ratePerNight: 900 });
  expect(planAt(updated, homes[0].id, addDays(today, 5))).toMatchObject({ cadence: "monthly", ratePerNight: 1000 });
  expect(updated.filter((p) => p.houseId === homes[1].id)).toHaveLength(1);
  expect(planAt(updated, homes[1].id, today)).toMatchObject({ cadence: "daily", ratePerNight: 1000 });
  expect(planAt(updated, homes[2].id, today)).toEqual(original[5]);
  expect(planAt(updated, homes[3].id, today)).toBeUndefined();
  expect(planAt(updated, homes[3].id, tomorrow)).toMatchObject({ cadence: "daily", ratePerNight: 800 });
  expect(planAt(updated, homes[4].id, today)).toEqual(original[8]);
  expect(planAt(updated, homes[5].id, today)).toEqual(original[9]);
  expect(updated.some((p) => p.cadence === "weekly" && p.effectiveFrom >= today)).toBe(false);
  expect(await db.select().from(payments)).toEqual(received);
  const info = await getHousePaymentInfo(db, homes[0].id, today);
  expect(info.periods.some((p) => p.start <= today && p.end >= today)).toBe(false);
  expect(info.periods.length).toBeGreaterThan(0);
  expect(info.receipts).toEqual([expect.objectContaining({ cadence: "weekly", amount: 4900 })]);
  await apply();
  expect(await db.select().from(paymentPlans)).toEqual(updated);
  expect(await db.select().from(payments)).toEqual(received);
}, 15_000);
