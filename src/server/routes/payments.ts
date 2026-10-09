import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { daysBetween, daysInMonth, isIsoDate, localDate } from "@/lib/dates";
import { requireResource } from "../auth";
import type { AppEnv } from "../env";
import { body, idParam } from "../http";
import { getPaymentMonth, getPaymentPlansForHouse, paymentLogsFor } from "../payments";
import { houses, paymentLogs, paymentPlans, payments, users } from "../schema";
import { monthQuery } from "./ronda";

const date = z.string().refine(isIsoDate, "Isi tanggal yang benar.");
const cadence = z.enum(["daily", "weekly", "monthly"], "Pilih cara pembayaran.");
const paymentSchema = z.object({
  houseId: z.number().int().positive(),
  receivedDate: date,
  periodStart: date,
  periodEnd: date,
  cadence: z.enum(["weekly", "monthly"], "Pilih mingguan atau bulanan. Pembayaran harian dicatat melalui ronda."),
  amount: z.number().int().positive("Isi nominal pembayaran.").max(100_000_000),
  receivedBy: z.enum(["treasurer", "collector"]),
  collectorId: z.number().int().positive().nullable().default(null),
  note: z.string().trim().max(200).optional().transform((v) => v || null),
}).superRefine((p, ctx) => {
  if (p.periodEnd < p.periodStart || daysBetween(p.periodStart, p.periodEnd) > 365)
    ctx.addIssue({ code: "custom", message: "Pilih periode berurutan, maksimal 366 hari." });
  if (p.receivedDate > localDate(new Date())) ctx.addIssue({ code: "custom", message: "Tanggal penerimaan belum tiba." });
  if (p.receivedBy === "collector" && !p.collectorId) ctx.addIssue({ code: "custom", message: "Pilih petugas penerima uang." });
});

const planSchema = z.object({
  effectiveFrom: date, cadence,
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
        const same = !previous.cancelledAt && Object.entries(values).every(([key, value]) => previous[key as keyof typeof previous] === value);
        return same ? { success: "Pembayaran sudah tersimpan." } : { error: "Catatan pembayaran ini sudah dipakai. Muat ulang lalu coba lagi." };
      }
      if (values.receivedBy === "collector") {
        const [collector] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, values.collectorId!), eq(users.active, true)));
        if (!collector) return { error: "Petugas penerima tidak aktif atau tidak ditemukan." };
      }
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
      const [house] = await tx.select({ id: houses.id }).from(houses).where(eq(houses.id, values.houseId));
      if (!house) return "Rumah tidak ditemukan.";
      if (values.receivedBy === "collector") {
        const [collector] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, values.collectorId!), eq(users.active, true)));
        if (!collector) return "Petugas penerima tidak aktif atau tidak ditemukan.";
      }
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
