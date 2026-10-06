import { beforeAll, describe, expect, it } from "vitest";
import { addDays, rondaDate } from "@/lib/dates";
import type { Bindings } from "@/server/env";
import { apiClient, createTestEnv } from "./helpers/db";

type Collection = { houseId: number; status: "filled" | "empty"; amount: number };

let env: Bindings;
let admin: ReturnType<typeof apiClient>;
let q1: number, q2: number, q3: number;
const today = rondaDate(new Date());
const [d0, d1, d2] = [today, addDays(today, -1), addDays(today, -2)];

beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Aji", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "Q", numbers: "1-3" });
  const houses = (await admin.get("/api/admin/rumah")).data.houses as { id: number; number: string }[];
  [q1, q2, q3] = ["1", "2", "3"].map((n) => houses.find((h) => h.number === n)!.id);
});

/** Catatan satu rumah di satu malam (lewat riwayat malam itu). */
async function saved(date: string, houseId: number) {
  const { collections } = (await admin.get(`/api/riwayat/${date}`)).data as { collections: Collection[] };
  return collections.find((c) => c.houseId === houseId) ?? null;
}

const put = (entries: unknown[]) => admin.put("/api/admin/riwayat", { entries });

describe("isi massal kotak rekap (banyak rumah × banyak malam)", () => {
  it("satu baris rumah beberapa malam sekaligus, mis. warga yang bayar bulanan", async () => {
    const res = await put([d2, d1, d0].map((date) => ({ date, houseId: q1, status: "filled", amount: 500 })));
    expect(res).toMatchObject({ status: 200, data: { success: "3 kotak tersimpan." } });
    for (const date of [d0, d1, d2]) expect(await saved(date, q1)).toMatchObject({ status: "filled", amount: 500 });
  });

  it("campuran di beberapa malam: Kosong untuk rumah lain, hapus catatan yang salah isi", async () => {
    await put([d1, d2].flatMap((date) => [q2, q3].map((houseId) => ({ date, houseId, status: "filled", amount: 1000 }))));
    const res = await put([
      { date: d0, houseId: q2, status: "empty", amount: 0 },
      // Hapus di dua malam dan dua rumah sekaligus.
      ...[d1, d2].flatMap((date) => [q2, q3].map((houseId) => ({ date, houseId, status: "none", amount: 0 }))),
    ]);
    expect(res.status).toBe(200);
    expect(await saved(d0, q2)).toMatchObject({ status: "empty" });
    for (const date of [d1, d2]) {
      expect(await saved(date, q2)).toBeNull();
      expect(await saved(date, q3)).toBeNull();
      // Rumah lain di malam yang sama tidak ikut terhapus.
      expect(await saved(date, q1)).toMatchObject({ status: "filled" });
    }
  });

  it("kotak yang sama dua kali: yang terakhir yang dipakai", async () => {
    const res = await put([
      { date: d0, houseId: q3, status: "filled", amount: 500 },
      { date: d0, houseId: q3, status: "filled", amount: 2000 },
    ]);
    expect(res.data).toEqual({ success: "1 kotak tersimpan." });
    expect(await saved(d0, q3)).toMatchObject({ status: "filled", amount: 2000 });
  });

  it("menolak malam yang belum tiba, tanggal salah, rumah tak dikenal, nominal kosong, dan terlalu banyak kotak", async () => {
    const one = (date: string, houseId = q1, status = "filled", amount = 500) => [{ date, houseId, status, amount }];
    expect((await put(one(addDays(today, 1)))).data).toEqual({ error: "Tanggalnya belum lewat." });
    expect((await put(one("2026-13-40"))).status).toBe(400);
    expect((await put(one(d0, 999_999))).status).toBe(404);
    expect((await put(one(d0, q1, "filled", 0))).data).toEqual({ error: "Isi nominal yang benar." });
    expect((await put([])).status).toBe(400);
    const tooMany = Array.from({ length: 3101 }, () => one(d0)[0]);
    expect((await put(tooMany)).status).toBe(400);
    // Tidak ada yang berubah oleh permintaan yang ditolak.
    expect(await saved(d0, q1)).toMatchObject({ status: "filled", amount: 500 });
  });

  it("hanya admin", async () => {
    const res = await apiClient(env).put("/api/admin/riwayat", { entries: [{ date: d0, houseId: q1, status: "empty", amount: 0 }] });
    expect([401, 403]).toContain(res.status);
  });
});
