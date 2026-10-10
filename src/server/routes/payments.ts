import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { daysBetween, daysInMonth, isIsoDate, localDate } from "@/lib/dates";
import { PAYMENT_PLAN_CADENCES } from "@/lib/payments";
import { requireResource } from "../auth";
import type { AppEnv } from "../env";
import type { Executor } from "../db";
import { body, idParam } from "../http";
import { getPaymentMonth, getPaymentPlansForHouse, getRapelDates, getRapelOptions, paymentLogsFor } from "../payments";
import { houses, paymentLogs, paymentPlans, payments, users } from "../schema";
import { monthQuery } from "./ronda";

const date = z.string().refine(isIsoDate, "Isi tanggal yang benar.");
const cadence = z.enum(["daily", "weekly", "monthly"], "Pilih cara pembayaran.");
const weeklyRetired = "Pembayaran mingguan sudah dihapus. Gunakan Harian atau Bulanan.";
const paymentSchema = z.object({
  houseId: z.number().int().positive(),
  receivedDate: date,
  periodStart: date,
  periodEnd: date,
  cadence,
  allocations: z.array(z.tuple([date, z.number().int().positive()])).max(366).nullish()
    .transform((value) => value ? [...value].sort(([a], [b]) => a.localeCompare(b)) : null),
  amount: z.number().int().positive("Isi nominal pembayaran.").max(100_000_000),
  receivedBy: z.enum(["treasurer", "collector"]),
  collectorId: z.number().int().positive().nullable().default(null),
  note: z.string().trim().max(200).optional().transform((v) => v || null),
}).superRefine((p, ctx) => {
  if (p.periodEnd < p.periodStart || daysBetween(p.periodStart, p.periodEnd) > 365)
    ctx.addIssue({ code: "custom", message: "Pilih periode berurutan, maksimal 366 hari." });
  if (p.receivedDate > localDate(new Date())) ctx.addIssue({ code: "custom", message: "Tanggal penerimaan belum tiba." });
  if (p.receivedBy === "collector" && !p.collectorId) ctx.addIssue({ code: "custom", message: "Pilih petugas penerima uang." });
  if (p.cadence === "daily") {
    if (!p.allocations?.length) ctx.addIssue({ code: "custom", message: "Pilih hari kosong untuk rapel." });
    else {
      const dates = p.allocations.map(([day]) => day);
      if (new Set(dates).size !== dates.length || dates[0] !== p.periodStart || dates.at(-1) !== p.periodEnd)
        ctx.addIssue({ code: "custom", message: "Tanggal rapel harus unik dan sesuai hari yang dipilih." });
      if (dates.some((day) => day > p.receivedDate)) ctx.addIssue({ code: "custom", message: "Pilih hari rapel sebelum atau pada tanggal penerimaan." });
      if (p.allocations.reduce((sum, [, amount]) => sum + amount, 0) !== p.amount)
        ctx.addIssue({ code: "custom", message: "Nominal rapel harus sesuai hari yang dipilih." });
    }
  } else if (p.allocations) ctx.addIssue({ code: "custom", message: "Tanggal pilihan hanya digunakan untuk rapel." });
});

async function validateRapel(db: Executor, values: z.infer<typeof paymentSchema>, previous?: typeof payments.$inferSelect) {
  if (values.cadence !== "daily") return null;
  const dates = new Map((await getRapelDates(db, values.houseId, values.receivedDate, previous?.id)).map((d) => [d.date, d.amount]));
  // Tanggal yang dipertahankan memakai nominal lunas semula, termasuk saat hanya mengoreksi penerima/catatan.
  if (previous?.houseId === values.houseId && previous.cadence === "daily")
    for (const [date, amount] of previous.allocations ?? []) dates.set(date, amount);
  return values.allocations?.every(([date, amount]) => dates.get(date) === amount) ? null
    : "Hari rapel sudah dibayar, bukan catatan kosong harian, atau nominal berubah. Muat ulang dan pilih lagi.";
}

const planSchema = z.object({
  effectiveFrom: date, cadence: z.enum(PAYMENT_PLAN_CADENCES, "Pilih Harian atau Bulanan."),
  ratePerNight: z.number().int().positive("Isi nominal per hari.").max(1_000_000),
  // Kompatibilitas data lama; status periode tidak memakai jatuh tempo lagi.
  dueTiming: z.enum(["start", "end"]).default("end"),
  graceDays: z.number().int().min(0).max(31).default(0),
  weekStart: z.number().int().min(0).max(6).default(1),
});

export const paymentRoutes = new Hono<AppEnv>().use(requireResource("finance"))
  .get("/", monthQuery, async (c) => {
    const month = c.req.valid("query").bulan;
    const today = localDate(new Date());
    const data = await getPaymentMonth(c.var.db, month, today);
    const days = daysInMonth(month);
    const history = await c.var.db.select({
      id: payments.id, houseId: payments.houseId, clientId: payments.clientId, cadence: payments.cadence,
      receivedDate: payments.receivedDate, periodStart: payments.periodStart, periodEnd: payments.periodEnd,
      allocations: payments.allocations,
      amount: payments.amount, receivedBy: payments.receivedBy, collectorId: payments.collectorId,
      collectorName: users.name, note: payments.note, cancelledAt: payments.cancelledAt,
    }).from(payments).leftJoin(users, eq(users.id, payments.collectorId))
      .where(or(and(gte(payments.receivedDate, days[0]), lte(payments.receivedDate, days[days.length - 1])), and(lte(payments.periodStart, days[days.length - 1]), gte(payments.periodEnd, days[0]))))
      .orderBy(desc(payments.receivedDate), desc(payments.id));
    return c.json({
      month, today, plans: data.plans, bills: data.bills, previousUnpaidBills: data.previousUnpaidBills, dailyCells: data.dailyCells,
      history: history.map((p) => ({ ...p, cancelledAt: p.cancelledAt?.toISOString() ?? null })),
      payments: data.receipts.filter((p) => p.receivedDate.startsWith(month) || (p.periodStart <= days[days.length - 1] && p.periodEnd >= days[0]))
        .map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })),
    });
  })
  .get("/rapel", async (c) => c.json({ dates: await getRapelOptions(c.var.db, localDate(new Date())) }))
  .get("/rapel/:id", idParam(), async (c) => c.json({ dates: await getRapelDates(c.var.db, c.req.valid("param").id, localDate(new Date())) }))
  .get("/kesepakatan/:id", idParam(), async (c) => c.json({ plans: await getPaymentPlansForHouse(c.var.db, c.req.valid("param").id) }))
  .put("/kesepakatan/:id", idParam(), body(planSchema), async (c) => {
    const houseId = c.req.valid("param").id;
    const values = c.req.valid("json");
    const error = await c.var.db.transaction(async (tx) => {
      const [house] = await tx.select({ id: houses.id }).from(houses).where(eq(houses.id, houseId)).for("update");
      if (!house) return "Rumah tidak ditemukan.";
      const [existing] = await tx.select().from(paymentPlans).where(and(eq(paymentPlans.houseId, houseId), eq(paymentPlans.effectiveFrom, values.effectiveFrom)));
      if (existing && values.effectiveFrom < localDate(new Date())) return "Kesepakatan lama tetap disimpan. Pilih tanggal mulai berlaku yang baru.";
      await tx.insert(paymentPlans).values({ ...values, houseId, recordedBy: c.var.user.id })
        .onConflictDoUpdate({ target: [paymentPlans.houseId, paymentPlans.effectiveFrom], set: { ...values, recordedBy: c.var.user.id, updatedAt: new Date() } });
      return null;
    });
    if (error) return c.json({ error }, 400);
    return c.json({ success: "Kesepakatan pembayaran tersimpan." });
  })
  .delete("/kesepakatan/:id", idParam(), async (c) => {
    const [plan] = await c.var.db.select().from(paymentPlans).where(eq(paymentPlans.id, c.req.valid("param").id));
    if (!plan) return c.json({ error: "Kesepakatan tidak ditemukan." }, 404);
    if (plan.effectiveFrom <= localDate(new Date())) return c.json({ error: "Kesepakatan yang sudah berlaku tetap disimpan. Buat kesepakatan baru untuk mengubahnya." }, 409);
    await c.var.db.delete(paymentPlans).where(eq(paymentPlans.id, plan.id));
    return c.json({ success: "Kesepakatan mendatang dihapus." });
  })
  .post("/", body(paymentSchema.safeExtend({ clientId: z.string().uuid("Catatan pembayaran tidak valid.") })), async (c) => {
    const input = c.req.valid("json");
    const values = { ...input, collectorId: input.receivedBy === "collector" ? input.collectorId : null };
    const result = await c.var.db.transaction(async (tx) => {
      const [house] = await tx.select({ id: houses.id }).from(houses).where(eq(houses.id, values.houseId)).for("update");
      if (!house) return { error: "Rumah tidak ditemukan." };
      const [previous] = await tx.select().from(payments).where(eq(payments.clientId, values.clientId));
      if (previous) {
        const same = !previous.cancelledAt && Object.entries(values).every(([key, value]) =>
          key === "allocations" ? JSON.stringify(previous.allocations) === JSON.stringify(value) : previous[key as keyof typeof previous] === value);
        return same ? { success: "Pembayaran sudah tersimpan." } : { error: "Catatan pembayaran ini sudah dipakai. Muat ulang lalu coba lagi." };
      }
      if (values.cadence === "weekly") return { error: weeklyRetired };
      if (values.receivedBy === "collector") {
        const [collector] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, values.collectorId!), eq(users.active, true)));
        if (!collector) return { error: "Petugas penerima tidak aktif atau tidak ditemukan." };
      }
      const error = await validateRapel(tx, values);
      if (error) return { error };
      const [saved] = await tx.insert(payments).values({ ...values, recordedBy: c.var.user.id })
        .onConflictDoNothing({ target: payments.clientId }).returning();
      if (!saved) return { error: "Catatan pembayaran ini sudah dipakai. Muat ulang lalu coba lagi." };
      await tx.insert(paymentLogs).values({ paymentId: saved.id, userId: c.var.user.id, action: "create", payload: { before: null, after: saved } });
      return { success: "Pembayaran tersimpan." };
    });
    if ("error" in result) return c.json({ error: result.error }, 400);
    return c.json({ success: result.success });
  })
  .patch("/:id", idParam(), body(paymentSchema), async (c) => {
    const values = c.req.valid("json");
    const error = await c.var.db.transaction(async (tx) => {
      const [previous] = await tx.select().from(payments).where(eq(payments.id, c.req.valid("param").id)).for("update");
      if (!previous || previous.cancelledAt) return "Pembayaran tidak ditemukan atau sudah dibatalkan.";
      if (values.cadence === "weekly" && (previous.cadence !== "weekly" || previous.houseId !== values.houseId)) return weeklyRetired;
      const [house] = await tx.select({ id: houses.id }).from(houses).where(eq(houses.id, values.houseId)).for("update");
      if (!house) return "Rumah tidak ditemukan.";
      if (values.receivedBy === "collector") {
        const [collector] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, values.collectorId!), eq(users.active, true)));
        if (!collector) return "Petugas penerima tidak aktif atau tidak ditemukan.";
      }
      const error = await validateRapel(tx, values, previous);
      if (error) return error;
      const [saved] = await tx.update(payments).set({ ...values, collectorId: values.receivedBy === "collector" ? values.collectorId : null, updatedAt: new Date() }).where(eq(payments.id, previous.id)).returning();
      await tx.insert(paymentLogs).values({ paymentId: saved.id, userId: c.var.user.id, action: "update", payload: { before: previous, after: saved } });
      return null;
    });
    if (error) return c.json({ error }, 400);
    return c.json({ success: "Pembayaran diperbarui." });
  })
  .delete("/:id", idParam(), async (c) => {
    const error = await c.var.db.transaction(async (tx) => {
      const [previous] = await tx.select().from(payments).where(eq(payments.id, c.req.valid("param").id)).for("update");
      if (!previous || previous.cancelledAt) return "Pembayaran tidak ditemukan atau sudah dibatalkan.";
      const [saved] = await tx.update(payments).set({ cancelledAt: new Date(), updatedAt: new Date() }).where(and(eq(payments.id, previous.id), isNull(payments.cancelledAt))).returning();
      await tx.insert(paymentLogs).values({ paymentId: saved.id, userId: c.var.user.id, action: "cancel", payload: { before: previous, after: saved } });
      return null;
    });
    if (error) return c.json({ error }, 400);
    return c.json({ success: "Pembayaran dibatalkan. Riwayat perubahannya tetap disimpan." });
  })
  .get("/:id/log", idParam(), async (c) => c.json({ logs: await paymentLogsFor(c.var.db, c.req.valid("param").id) }));
