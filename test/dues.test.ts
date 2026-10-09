import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  duesInvoices,
  duesLogs,
  duesReceipts,
  houses,
  settings,
} from "@/server/schema";
import { getDuesMonth } from "@/server/dues";
import { getCashMonth, getCashPublic } from "@/server/kas";
import { apiClient, createTestEnv } from "./helpers/db";

let env: Awaited<ReturnType<typeof createTestEnv>>["env"];
let admin: ReturnType<typeof apiClient>;
let typeId: number, invoiceId: number, houseIds: number[];
const typeBody = {
  name: "Kebersihan",
  amount: 100000,
  cadence: "monthly",
  startMonth: "2024-02",
  dueDay: 31,
  active: true,
};
const proof =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1kAAAAASUVORK5CYII=";
const bills = () => getDuesMonth(env.db, "2024-02", "2024-02-20");
const cash = (month = "2024-02") => getCashMonth(env.db, month, "2024-03-10");
const receiptBody = (amount: number, invoice = invoiceId) => ({
  clientId: crypto.randomUUID(),
  invoiceId: invoice,
  amount,
  date: "2024-02-20",
  method: "transfer",
  note: "Uang kebersihan",
});

beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  await admin.post("/api/auth/setup", {
    communityName: "Natura",
    defaultAmount: 500,
    name: "Admin",
    pin: "1234",
    pinConfirm: "1234",
  });
  await admin.post("/api/admin/rumah", { block: "A", numbers: "1-3" });
  houseIds = (await env.db.select().from(houses)).map((house) => house.id);
  await env.db
    .update(houses)
    .set({ status: "vacant" })
    .where(eq(houses.id, houseIds[2]));
  typeId = Number(
    (await admin.post("/api/admin/iuran/jenis", typeBody)).data.id,
  );
});

describe("iuran, tagihan, dan penerimaan kas", () => {
  it("menerbitkan per rumah termasuk rumah kosong dengan jatuh tempo yang mengikuti akhir bulan", async () => {
    const issued = await admin.post("/api/admin/iuran/tagihan", {
      typeId,
      month: "2024-02",
    });
    expect(issued.status).toBe(200);
    expect(issued.data.issued).toBe(3);
    const data = await bills();
    expect(data.bills).toHaveLength(3);
    expect(
      data.bills.every(
        (bill) => bill.amount === 100000 && bill.dueDate === "2024-02-29",
      ),
    ).toBe(true);
    invoiceId = data.bills.find((bill) => bill.houseId === houseIds[0])!.id;
  });

  it("penerbitan ulang tidak menggandakan tagihan atau audit, termasuk pilihan rumah berulang", async () => {
    const before = await env.db.select().from(duesLogs);
    const response = await admin.post("/api/admin/iuran/tagihan", {
      typeId,
      month: "2024-02",
      houseIds: [houseIds[0], houseIds[0]],
    });
    expect(response.data.issued).toBe(0);
    expect(await env.db.select().from(duesInvoices)).toHaveLength(3);
    expect(await env.db.select().from(duesLogs)).toEqual(before);
  });

  it("tarif yang diubah berlaku untuk tagihan baru dan tidak mengubah nominal yang sudah terbit", async () => {
    expect(
      (
        await admin.patch(`/api/admin/iuran/jenis/${typeId}`, {
          ...typeBody,
          amount: 120000,
        })
      ).status,
    ).toBe(200);
    expect((await bills()).bills.every((bill) => bill.amount === 100000)).toBe(
      true,
    );
    const issued = await admin.post("/api/admin/iuran/tagihan", {
      typeId,
      month: "2024-03",
      houseIds: [houseIds[0]],
    });
    expect(issued.data.issued).toBe(1);
    const march = await getDuesMonth(env.db, "2024-03", "2024-03-10");
    expect(march.bills.find((bill) => bill.month === "2024-03")?.amount).toBe(
      120000,
    );
    expect(march.bills.filter((bill) => bill.month === "2024-02")).toHaveLength(
      3,
    );
  });

  it("pemilihan rumah yang salah membatalkan seluruh penerbitan", async () => {
    const before = await env.db.select().from(duesInvoices);
    expect(
      (
        await admin.post("/api/admin/iuran/tagihan", {
          typeId,
          month: "2024-04",
          houseIds: [houseIds[0], 99999],
        })
      ).status,
    ).toBe(400);
    expect(await env.db.select().from(duesInvoices)).toEqual(before);
    expect(
      (
        await admin.post("/api/admin/iuran/tagihan", {
          typeId,
          month: "2024-01",
        })
      ).status,
    ).toBe(400);
  });

  it("iuran sekali terbit hanya pada bulan yang ditentukan dan iuran nonaktif tidak diterbitkan", async () => {
    const one = await admin.post("/api/admin/iuran/jenis", {
      ...typeBody,
      name: "Perbaikan gerbang",
      cadence: "once",
    });
    expect(
      (
        await admin.post("/api/admin/iuran/tagihan", {
          typeId: one.data.id,
          month: "2024-03",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post("/api/admin/iuran/tagihan", {
          typeId: one.data.id,
          month: "2024-02",
          houseIds: [houseIds[0]],
        })
      ).data.issued,
    ).toBe(1);
    await admin.patch(`/api/admin/iuran/jenis/${one.data.id}`, {
      ...typeBody,
      name: "Perbaikan gerbang",
      cadence: "once",
      active: false,
    });
    expect(
      (
        await admin.post("/api/admin/iuran/tagihan", {
          typeId: one.data.id,
          month: "2024-02",
          houseIds: [houseIds[1]],
        })
      ).status,
    ).toBe(404);
  });

  it("pembayaran sebagian masuk kas satu kali, tersisa di tagihan, dan percobaan ulang aman", async () => {
    const input = { ...receiptBody(40000), proof };
    const saved = await admin.post("/api/admin/iuran/pembayaran", input);
    expect(saved.status).toBe(200);
    expect(
      (await bills()).bills.find((bill) => bill.id === invoiceId),
    ).toMatchObject({ paid: 40000, remaining: 60000, status: "partial" });
    expect(await cash()).toMatchObject({
      duesIncome: 40000,
      balance: 40000,
      closing: 40000,
    });
    expect(
      (await admin.post("/api/admin/iuran/pembayaran", input)).status,
    ).toBe(200);
    expect(await env.db.select().from(duesReceipts)).toHaveLength(1);
    expect(
      (await env.db.select().from(duesLogs)).filter(
        (log) => log.action === "receive",
      ),
    ).toHaveLength(1);
    expect((await cash()).balance).toBe(40000);
    expect(
      (
        await admin.post("/api/admin/iuran/pembayaran", {
          ...input,
          amount: 50000,
        })
      ).status,
    ).toBe(409);
  });

  it("kelebihan nominal ditolak; dua pembayaran bersamaan tidak melampaui sisa", async () => {
    expect(
      (await admin.post("/api/admin/iuran/pembayaran", receiptBody(60001)))
        .status,
    ).toBe(409);
    const responses = await Promise.all([
      admin.post("/api/admin/iuran/pembayaran", receiptBody(60000)),
      admin.post("/api/admin/iuran/pembayaran", receiptBody(60000)),
    ]);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(
      (await bills()).bills.find((bill) => bill.id === invoiceId),
    ).toMatchObject({ paid: 100000, remaining: 0, status: "paid" });
    expect((await cash()).balance).toBe(100000);
  });

  it("bukti diambil dari endpoint terlindung dan payload daftar tidak memuat gambar", async () => {
    const [receipt] = await env.db
      .select()
      .from(duesReceipts)
      .where(eq(duesReceipts.proof, proof));
    const response = await admin.get(
      `/api/admin/iuran/pembayaran/${receipt.id}/bukti`,
    );
    expect(response.status).toBe(200);
    const data = (await admin.get("/api/admin/iuran?bulan=2024-02")).data;
    expect(JSON.stringify(data)).not.toContain("data:image");
    expect(data.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: receipt.id, hasProof: true }),
      ]),
    );
    expect(
      (
        await admin.post("/api/admin/iuran/pembayaran", {
          ...receiptBody(1),
          proof: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post("/api/admin/iuran/pembayaran", {
          ...receiptBody(1),
          proof: "data:image/png;base64,PHN2Zz48L3N2Zz4=",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post("/api/admin/iuran/pembayaran", {
          ...receiptBody(1),
          date: "2999-01-01",
        })
      ).status,
    ).toBe(400);
  });

  it("tagihan yang sudah menerima uang harus membatalkan penerimaan dulu, tanpa menghapus audit", async () => {
    expect(
      (await admin.delete(`/api/admin/iuran/tagihan/${invoiceId}`)).status,
    ).toBe(409);
    const receipts = await env.db
      .select()
      .from(duesReceipts)
      .where(eq(duesReceipts.invoiceId, invoiceId));
    for (const receipt of receipts)
      expect(
        (await admin.delete(`/api/admin/iuran/pembayaran/${receipt.id}`))
          .status,
      ).toBe(200);
    expect(
      (await bills()).bills.find((bill) => bill.id === invoiceId),
    ).toMatchObject({ paid: 0, remaining: 100000 });
    expect((await cash()).balance).toBe(0);
    expect(
      (await admin.delete(`/api/admin/iuran/tagihan/${invoiceId}`)).status,
    ).toBe(200);
    expect(
      (await admin.post("/api/admin/iuran/pembayaran", receiptBody(50000)))
        .status,
    ).toBe(404);
    expect(
      (await admin.post(`/api/admin/iuran/tagihan/${invoiceId}/pulihkan`))
        .status,
    ).toBe(200);
    const log = (await admin.get(`/api/admin/iuran/tagihan/${invoiceId}/log`))
      .data.logs as { action: string }[];
    expect(log.map((entry) => entry.action)).toEqual([
      "issue",
      "receive",
      "receive",
      "cancel_receipt",
      "cancel_receipt",
      "cancel_invoice",
      "issue",
    ]);
    expect(await env.db.select().from(duesReceipts)).toHaveLength(2);
  });

  it("kas mengikuti tanggal penerimaan, termasuk tunggakan yang lunas bulan berikutnya", async () => {
    const response = await admin.post("/api/admin/iuran/pembayaran", {
      ...receiptBody(100000),
      date: "2024-03-05",
    });
    expect(response.status).toBe(200);
    expect(await cash("2024-02")).toMatchObject({
      opening: 0,
      duesIncome: 0,
      closing: 0,
      balance: 100000,
    });
    expect(await cash("2024-03")).toMatchObject({
      opening: 0,
      duesIncome: 100000,
      closing: 100000,
      balance: 100000,
    });
    expect(await cash("2024-04")).toMatchObject({
      opening: 100000,
      duesIncome: 0,
      closing: 100000,
    });
    const march = await getDuesMonth(env.db, "2024-03", "2024-03-10");
    expect(march.bills.find((bill) => bill.id === invoiceId)?.status).toBe(
      "paid",
    );
    expect(march.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invoiceId, date: "2024-03-05" }),
      ]),
    );
  });

  it("ringkasan kas warga menampilkan jumlah saja tanpa tagihan, nama, atau bukti pribadi", async () => {
    const publicCash = await getCashPublic(env.db, "2024-03-10");
    expect(publicCash).toMatchObject({ duesIncome: 100000, balance: 100000 });
    for (const field of ["receipts", "bills", "proof", "recordedByName"])
      expect(publicCash).not.toHaveProperty(field);
    expect(JSON.stringify(publicCash)).not.toContain("Uang kebersihan");
    await env.db
      .update(settings)
      .set({ cashPublic: false })
      .where(eq(settings.id, 1));
    expect(await getCashPublic(env.db, "2024-03-10")).toBeNull();
  });

  it("rumah dengan tagihan tetap tersimpan walaupun belum membayar", async () => {
    expect((await admin.delete(`/api/admin/rumah/${houseIds[1]}`)).status).toBe(
      409,
    );
    expect(await env.db.select().from(houses)).toHaveLength(3);
  });
});
