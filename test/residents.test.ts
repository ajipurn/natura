import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { syncResidents, type ResidentSource } from "../scripts/sync-residents";
import { houses, users } from "@/server/schema";
import { listHouses, listUsers } from "@/server/queries";
import { getPaymentPlansForHouse } from "@/server/payments";
import { apiClient, createTestEnv } from "./helpers/db";
import type { Db } from "@/server/db";

let db: Db;
let originalPin: string;
const source: ResidentSource = {
  residents: Array.from({ length: 94 }, (_, i) => ({ block: "Z", number: String(i + 1), ...(i === 9 ? {} : i === 0 || i === 21 ? { status: "vacant" as const } : { name: i === 12 ? "Nama akun baru" : "Warga contoh " + (i + 1), status: "active" as const }) })),
  plans: [
    { house: "Z-13", effectiveFrom: "2026-10-01", cadence: "monthly", ratePerNight: 500, dueTiming: "end", graceDays: 0, weekStart: 1 },
    { house: "Z-13", effectiveFrom: "2026-11-01", cadence: "monthly", ratePerNight: 500, dueTiming: "start", graceDays: 0, weekStart: 1 },
  ],
};
beforeAll(async () => {
  const test = await createTestEnv(); db = test.db;
  const admin = apiClient(test.env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Aji", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "Z", numbers: "13", ownerName: "Nama lama" });
  const [house] = await db.select().from(houses);
  await admin.post("/api/admin/petugas", { name: "Nama akun lama", pin: "1234", role: "petugas", active: true, houseId: house.id });
  originalPin = (await db.select().from(users).where(eq(users.houseId, house.id)))[0].pinHash;
  await db.insert(houses).values({ block: "Z", number: "10", ownerName: "Nama dipertahankan", status: "vacant", token: "KEEPZ10ABC" });
  await syncResidents(db, source);
});

describe("pembaruan warga dari berkas input lokal", () => {
  it("semua alamat ditambahkan sekali, penanda kosong menjadi status hunian", async () => {
    const rows = await listHouses(db);
    expect(rows).toHaveLength(source.residents.length);
    expect(rows.find((h) => h.number === "1")?.status).toBe("vacant");
    expect(rows.find((h) => h.number === "22")?.status).toBe("vacant");
    expect(rows.find((h) => h.number === "2")?.ownerName).toBe("Warga contoh 2");
    expect(rows.find((h) => h.number === "10")).toMatchObject({ ownerName: "Nama dipertahankan", status: "vacant" });
  });
  it("nama akun menjadi sumber nama rumah; PIN tetap dan daftar bulanan punya dua tanggal berlaku", async () => {
    const house = (await listHouses(db)).find((h) => h.number === "13")!;
    expect(house.ownerName).toBe("Nama akun baru");
    expect((await listUsers(db)).find((u) => u.houseId === house.id)?.name).toBe("Nama akun baru");
    const [raw] = await db.select().from(houses).where(eq(houses.id, house.id));
    expect(raw.ownerName).toBeNull();
    expect((await db.select().from(users).where(eq(users.houseId, house.id)))[0].pinHash).toBe(originalPin);
    expect((await getPaymentPlansForHouse(db, house.id)).map((p) => [p.effectiveFrom, p.dueTiming])).toEqual([["2026-10-01", "end"], ["2026-11-01", "start"]]);
  });
  it("pengulangan tidak membuat rumah atau kesepakatan ganda", async () => {
    expect((await syncResidents(db, source)).added).toEqual([]);
    const house = (await listHouses(db)).find((h) => h.number === "13")!;
    expect(await getPaymentPlansForHouse(db, house.id)).toHaveLength(2);
  });
});
