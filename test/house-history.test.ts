import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { addDays } from "@/lib/dates";
import { houses } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

type Night = { date: string; status: "filled" | "empty" | null; amount: number | null };
type HouseStats = { id: number; filled: number; empty: number; total: number };

let admin: ReturnType<typeof apiClient>;
let warga: ReturnType<typeof apiClient>;
let db: Db;
let house: { id: number; token: string };
const dates = Array.from({ length: 6 }, (_, i) => `2025-03-0${i + 1}`);

beforeAll(async () => {
  const test = await createTestEnv();
  db = test.db;
  const { env } = test;
  admin = apiClient(env);
  warga = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Aji", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "A", numbers: "1" });
  house = ((await admin.get("/api/admin/rumah")).data.houses as { id: number; token: string; block: string }[]).find((h) => h.block === "A")!;
  await db.update(houses).set({ createdAt: new Date("2025-03-05T12:00:00+07:00") }).where(eq(houses.id, house.id));
  const { data } = await admin.post("/api/admin/pengaturan/kode-warga", { enabled: true });
  expect((await warga.post("/api/warga/masuk", { code: data.wargaCode })).status).toBe(200);
  const saved = await admin.put("/api/admin/riwayat", {
    entries: dates.map((date) => ({ date, houseId: house.id, status: "filled", amount: 500 })),
  });
  expect(saved.status).toBe(200);
});

describe("riwayat rumah dan rekap warga", () => {
  it("menampilkan enam catatan dari 31 malam berjalan, termasuk isian sebelum rumah didaftarkan", async () => {
    const recap = await warga.get("/api/warga/rekap?bulan=2025-03");
    const stats = (recap.data.perHouse as HouseStats[]).find((h) => h.id === house.id)!;
    expect(stats).toMatchObject({ filled: 6, empty: 0, total: 3000 });
    expect(recap.data.nights).toBe(31);

    const detail = await warga.get(`/api/warga/rumah/${house.id}`);
    expect(detail.status).toBe(200);
    const history = detail.data.history as Night[];
    expect(history.filter((n) => n.status === "filled")).toHaveLength(stats.filled);
    expect(history.map((n) => n.date)).toEqual([...dates].reverse());
    expect(history.reduce((sum, n) => sum + (n.amount ?? 0), 0)).toBe(stats.total);

    // Halaman dari stiker QR memakai riwayat yang sama.
    const page = await warga.get(`/api/rumah/${house.token}`);
    expect(page.status).toBe(200);
    expect(page.data.history).toEqual(history);
  });

  it("menyertakan catatan kosong sebelum pendaftaran, tanpa menganggap malam rumah lain sebagai tidak dicek", async () => {
    await admin.post("/api/admin/rumah", { block: "A", numbers: "2" });
    const second = ((await admin.get("/api/admin/rumah")).data.houses as { id: number; block: string; number: string }[])
      .find((h) => h.block === "A" && h.number === "2")!;
    await db.update(houses).set({ createdAt: new Date("2025-03-05T12:00:00+07:00") }).where(eq(houses.id, second.id));
    const saved = await admin.put("/api/admin/riwayat", {
      entries: [
        { date: dates[1], houseId: second.id, status: "empty", amount: 0 },
        { date: dates[5], houseId: second.id, status: "filled", amount: 700 },
      ],
    });
    expect(saved.status).toBe(200);

    const detail = await warga.get(`/api/warga/rumah/${second.id}`);
    expect(detail.data.history).toEqual([
      { date: dates[5], status: "filled", amount: 700 },
      { date: dates[4], status: null, amount: null },
      { date: dates[1], status: "empty", amount: 0 },
    ]);
  });

  it("rumah yang didaftarkan sebelum subuh tetap menyertakan malam sebelumnya", async () => {
    await admin.post("/api/admin/rumah", { block: "A", numbers: "3" });
    const third = ((await admin.get("/api/admin/rumah")).data.houses as { id: number; block: string; number: string }[])
      .find((h) => h.block === "A" && h.number === "3")!;
    await db.update(houses).set({ createdAt: new Date("2025-03-05T05:59:00+07:00") }).where(eq(houses.id, third.id));

    const detail = await warga.get(`/api/warga/rumah/${third.id}`);
    expect(detail.data.history).toEqual(dates.slice(3).reverse().map((date) => ({ date, status: null, amount: null })));
  });

  it("bulan yang dipilih tetap lengkap walaupun ada lebih dari 100 catatan setelahnya", async () => {
    const saved = await admin.put("/api/admin/riwayat", { entries: Array.from({ length: 105 }, (_, i) => ({ date: addDays("2025-04-01", i), houseId: house.id, status: "filled", amount: 500 })) });
    expect(saved.status).toBe(200);
    const detail = await warga.get(`/api/warga/rumah/${house.id}?bulan=2025-03`);
    expect(detail.status).toBe(200);
    expect((detail.data.history as Night[]).map((n) => n.date)).toEqual([...dates].reverse());
    expect(JSON.stringify(detail.data)).not.toMatch(/ownerName|token/);
    expect((await warga.get(`/api/warga/rumah/${house.id}?bulan=2025-13`)).status).toBe(400);
  });
});
