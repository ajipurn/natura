import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { daysInMonth, isIsoDate, isMonth, localDate } from "@/lib/dates";
import { MAX_PROOF_BYTES, MAX_PROOF_DATA_URL } from "@/lib/community";
import { requireResource } from "../auth";
import { getDuesMonth, invoicePaid } from "../dues";
import type { AppEnv } from "../env";
import { body, idParam } from "../http";
import { MAX_CASH } from "../kas";
import { parseLogo } from "../logo";
import {
  duesInvoices,
  duesLogs,
  duesReceipts,
  duesTypes,
  houses,
  users,
} from "../schema";
import { monthQuery } from "./ronda";

const monthField = z.string().refine(isMonth, "Pilih bulan yang benar.");
const typeSchema = z.object({
  name: z.string().trim().min(1, "Isi nama iuran.").max(80),
  amount: z.number().int().positive("Isi nominal iuran.").max(MAX_CASH),
  cadence: z.enum(["monthly", "once"]),
  startMonth: monthField,
  dueDay: z.number().int().min(1).max(31),
  active: z.boolean().default(true),
});
const receiptSchema = z.object({
  clientId: z.string().uuid(),
  invoiceId: z.number().int().positive(),
  amount: z.number().int().positive("Isi nominal pembayaran.").max(MAX_CASH),
  date: z
    .string()
    .refine(
      (v) => isIsoDate(v) && v <= localDate(new Date()),
      "Tanggal penerimaan belum tiba atau tidak valid.",
    ),
  method: z.enum(["cash", "transfer"]),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
  proof: z
    .string()
    .max(MAX_PROOF_DATA_URL)
    .nullable()
    .optional()
    .transform((v) => v || null)
    .refine(
      (v) => !v || Boolean(parseLogo(v, MAX_PROOF_BYTES)),
      "Pilih bukti PNG, JPG, atau WebP maksimal 750 KB.",
    ),
});

export const duesRoutes = new Hono<AppEnv>()
  .use(requireResource("finance"))
  .get("/", monthQuery, async (c) =>
    c.json(
      await getDuesMonth(
        c.var.db,
        c.req.valid("query").bulan,
        localDate(new Date()),
      ),
    ),
  )
  .post("/jenis", body(typeSchema), async (c) => {
    const [type] = await c.var.db
      .insert(duesTypes)
      .values(c.req.valid("json"))
      .returning({ id: duesTypes.id });
    return c.json({ success: "Jenis iuran ditambahkan.", id: type.id });
  })
  .patch("/jenis/:id", idParam(), body(typeSchema), async (c) => {
    const [type] = await c.var.db
      .update(duesTypes)
      .set(c.req.valid("json"))
      .where(eq(duesTypes.id, c.req.valid("param").id))
      .returning({ id: duesTypes.id });
    return type
      ? c.json({
          success:
            "Jenis iuran disimpan. Tagihan yang sudah terbit tetap memakai nominal sebelumnya.",
        })
      : c.json({ error: "Jenis iuran tidak ditemukan." }, 404);
  })
  .post(
    "/tagihan",
    body(
      z.object({
        typeId: z.number().int().positive(),
        month: monthField,
        houseIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(1000)
          .optional(),
      }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      return c.var.db.transaction(async (tx) => {
        const [type] = await tx
          .select()
          .from(duesTypes)
          .where(eq(duesTypes.id, input.typeId))
          .for("update");
        if (!type || !type.active)
          return c.json(
            { error: "Jenis iuran tidak ditemukan atau sudah nonaktif." },
            404,
          );
        if (
          input.month < type.startMonth ||
          (type.cadence === "once" && input.month !== type.startMonth)
        )
          return c.json({ error: "Bulan ini di luar periode iuran." }, 400);
        const ids = input.houseIds ? [...new Set(input.houseIds)] : null;
        const targets = await tx
          .select({ id: houses.id })
          .from(houses)
          .where(ids ? inArray(houses.id, ids) : undefined);
        if (!targets.length || (ids && targets.length !== ids.length))
          return c.json({ error: "Pilih rumah yang terdaftar." }, 400);
        const days = daysInMonth(input.month);
        const dueDate = days[Math.min(type.dueDay, days.length) - 1];
        const issued = await tx
          .insert(duesInvoices)
          .values(
            targets.map((house) => ({
              typeId: type.id,
              houseId: house.id,
              month: input.month,
              amount: type.amount,
              dueDate,
              recordedBy: c.var.user.id,
            })),
          )
          .onConflictDoNothing({
            target: [
              duesInvoices.typeId,
              duesInvoices.houseId,
              duesInvoices.month,
            ],
          })
          .returning({ id: duesInvoices.id });
        if (issued.length)
          await tx
            .insert(duesLogs)
            .values(
              issued.map((invoice) => ({
                invoiceId: invoice.id,
                action: "issue" as const,
                amount: type.amount,
                recordedBy: c.var.user.id,
              })),
            );
        return c.json({
          success: `${issued.length} tagihan diterbitkan.${targets.length > issued.length ? " Tagihan yang sudah ada tetap tersimpan." : ""}`,
          issued: issued.length,
        });
      });
    },
  )
  .delete("/tagihan/:id", idParam(), async (c) => {
    return c.var.db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(duesInvoices)
        .where(eq(duesInvoices.id, c.req.valid("param").id))
        .for("update");
      if (!invoice || invoice.cancelledAt)
        return c.json(
          { error: "Tagihan tidak ditemukan atau sudah dibatalkan." },
          404,
        );
      if (await invoicePaid(tx, invoice.id))
        return c.json(
          {
            error:
              "Batalkan penerimaan pembayaran sebelum membatalkan tagihan ini.",
          },
          409,
        );
      await tx
        .update(duesInvoices)
        .set({ cancelledAt: new Date() })
        .where(eq(duesInvoices.id, invoice.id));
      await tx
        .insert(duesLogs)
        .values({
          invoiceId: invoice.id,
          action: "cancel_invoice",
          amount: invoice.amount,
          recordedBy: c.var.user.id,
        });
      return c.json({
        success: "Tagihan dibatalkan. Riwayatnya tetap disimpan.",
      });
    });
  })
  .post("/tagihan/:id/pulihkan", idParam(), async (c) => {
    return c.var.db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(duesInvoices)
        .where(eq(duesInvoices.id, c.req.valid("param").id))
        .for("update");
      if (!invoice?.cancelledAt)
        return c.json(
          { error: "Tagihan yang dibatalkan tidak ditemukan." },
          404,
        );
      await tx
        .update(duesInvoices)
        .set({ cancelledAt: null })
        .where(eq(duesInvoices.id, invoice.id));
      await tx
        .insert(duesLogs)
        .values({
          invoiceId: invoice.id,
          action: "issue",
          amount: invoice.amount,
          recordedBy: c.var.user.id,
        });
      return c.json({ success: "Tagihan diterbitkan kembali." });
    });
  })
  .post("/pembayaran", body(receiptSchema), async (c) => {
    const values = c.req.valid("json");
    return c.var.db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(duesInvoices)
        .where(eq(duesInvoices.id, values.invoiceId))
        .for("update");
      if (!invoice || invoice.cancelledAt)
        return c.json(
          { error: "Tagihan tidak ditemukan atau sudah dibatalkan." },
          404,
        );
      const [previous] = await tx
        .select()
        .from(duesReceipts)
        .where(eq(duesReceipts.clientId, values.clientId));
      if (previous) {
        const same =
          !previous.cancelledAt &&
          Object.entries(values).every(
            ([key, value]) => previous[key as keyof typeof previous] === value,
          );
        return same
          ? c.json({ success: "Pembayaran sudah tersimpan." })
          : c.json(
              {
                error:
                  "Catatan pembayaran sudah dipakai. Muat ulang lalu coba lagi.",
              },
              409,
            );
      }
      if (values.amount > invoice.amount - (await invoicePaid(tx, invoice.id)))
        return c.json({ error: "Nominal melebihi sisa tagihan." }, 409);
      const [saved] = await tx
        .insert(duesReceipts)
        .values({ ...values, recordedBy: c.var.user.id })
        .onConflictDoNothing({ target: duesReceipts.clientId })
        .returning({ id: duesReceipts.id });
      if (!saved)
        return c.json(
          {
            error:
              "Catatan pembayaran sudah dipakai. Muat ulang lalu coba lagi.",
          },
          409,
        );
      await tx
        .insert(duesLogs)
        .values({
          invoiceId: invoice.id,
          receiptId: saved.id,
          action: "receive",
          amount: values.amount,
          recordedBy: c.var.user.id,
        });
      return c.json({
        success: "Pembayaran dicatat dan masuk kas.",
        id: saved.id,
      });
    });
  })
  .delete("/pembayaran/:id", idParam(), async (c) => {
    return c.var.db.transaction(async (tx) => {
      const [receipt] = await tx
        .select()
        .from(duesReceipts)
        .where(eq(duesReceipts.id, c.req.valid("param").id));
      if (!receipt || receipt.cancelledAt)
        return c.json(
          { error: "Pembayaran tidak ditemukan atau sudah dibatalkan." },
          404,
        );
      // Urutan kunci sama dengan pencatatan: tagihan dahulu, baru penerimaan.
      await tx
        .select({ id: duesInvoices.id })
        .from(duesInvoices)
        .where(eq(duesInvoices.id, receipt.invoiceId))
        .for("update");
      const [changed] = await tx
        .update(duesReceipts)
        .set({ cancelledAt: new Date() })
        .where(
          and(
            eq(duesReceipts.id, receipt.id),
            isNull(duesReceipts.cancelledAt),
          ),
        )
        .returning({ id: duesReceipts.id });
      if (!changed)
        return c.json({ error: "Pembayaran sudah dibatalkan." }, 409);
      await tx
        .insert(duesLogs)
        .values({
          invoiceId: receipt.invoiceId,
          receiptId: receipt.id,
          action: "cancel_receipt",
          amount: receipt.amount,
          recordedBy: c.var.user.id,
        });
      return c.json({
        success: "Pembayaran dibatalkan. Tagihan dan saldo kas diperbarui.",
      });
    });
  })
  .get("/pembayaran/:id/bukti", idParam(), async (c) => {
    const [receipt] = await c.var.db
      .select({ proof: duesReceipts.proof })
      .from(duesReceipts)
      .where(eq(duesReceipts.id, c.req.valid("param").id));
    const image = receipt?.proof && parseLogo(receipt.proof, MAX_PROOF_BYTES);
    if (!image)
      return c.json({ error: "Bukti pembayaran tidak ditemukan." }, 404);
    c.header("Content-Type", image.type);
    c.header("Cache-Control", "private, no-store");
    c.header("X-Content-Type-Options", "nosniff");
    return c.body(image.bytes);
  })
  .get("/tagihan/:id/log", idParam(), async (c) => {
    const logs = await c.var.db
      .select({
        id: duesLogs.id,
        action: duesLogs.action,
        amount: duesLogs.amount,
        name: users.name,
        createdAt: duesLogs.createdAt,
      })
      .from(duesLogs)
      .leftJoin(users, eq(users.id, duesLogs.recordedBy))
      .where(eq(duesLogs.invoiceId, c.req.valid("param").id))
      .orderBy(asc(duesLogs.id));
    return c.json({ logs });
  });
