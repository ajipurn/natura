import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { listResidents } from "@/server/residents";
import { listHouses, listLoginUsers } from "@/server/queries";
import { listSchedule } from "@/server/schedule";
import { houses, residents, rondaSchedule, users } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

type Resident = Awaited<ReturnType<typeof listResidents>>[number];
let db: Db;
let admin: ReturnType<typeof apiClient>;
let env: Awaited<ReturnType<typeof createTestEnv>>["env"];
let a1: number;
let a2: number;
let b1: number;

const directory = async () => (await admin.get("/api/admin/warga")).data.residents as Resident[];
async function add(name: string, houseId: number | null = null, phone = "") {
  const result = await admin.post("/api/admin/warga", { name, houseId, phone });
  expect(result.status).toBe(200);
  return Number(result.data.id);
}

beforeAll(async () => {
  const test = await createTestEnv();
  db = test.db; env = test.env; admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Pengurus", pin: "1234", pinConfirm: "1234" });
  await admin.post("/api/admin/rumah", { block: "A", numbers: "1", ownerName: "Penghuni awal" });
  await admin.post("/api/admin/rumah", { block: "A", numbers: "2" });
  await admin.post("/api/admin/rumah", { block: "B", numbers: "1" });
  const rows = await listHouses(db);
  a1 = rows.find((h) => h.block === "A" && h.number === "1")!.id;
  a2 = rows.find((h) => h.block === "A" && h.number === "2")!.id;
  b1 = rows.find((h) => h.block === "B")!.id;
});

describe("pendataan warga per orang", () => {
  it("akun awal dan nama yang diisi melalui Rumah langsung masuk daftar warga", async () => {
    expect(await directory()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Pengurus", userId: expect.any(Number), houseId: null, role: "admin" }),
      expect.objectContaining({ name: "Penghuni awal", userId: null, houseId: a1, block: "A", number: "1" }),
    ]));
    expect((await db.select().from(houses).where(eq(houses.id, a1)))[0].ownerName).toBeNull();
  });

  it("beberapa warga dapat memakai rumah yang sama tanpa otomatis membuat akun", async () => {
    const before = await listLoginUsers(db);
    await add("Anggota satu", a1, "08123456789");
    await add("Anggota dua", a1);
    expect((await directory()).filter((r) => r.houseId === a1).map((r) => r.name)).toEqual(["Anggota dua", "Anggota satu", "Penghuni awal"]);
    expect(await listLoginUsers(db)).toEqual(before);
    const data = (await admin.get("/api/admin/rumah")).data.houses as { id: number; residents: { name: string }[] }[];
    expect(data.find((h) => h.id === a1)?.residents).toHaveLength(3);
    expect((await listHouses(db)).find((h) => h.id === a1)?.ownerName).toBe("Penghuni awal");
  });

  it("warga tanpa rumah dapat dihubungkan, dipindahkan, lalu dilepas tanpa berganti identitas", async () => {
    const id = await add("Warga berpindah");
    expect((await directory()).find((r) => r.id === id)).toMatchObject({ houseId: null, block: null, number: null });
    for (const houseId of [a2, b1, null]) {
      expect((await admin.patch(`/api/admin/warga/${id}`, { name: "Warga berpindah", houseId })).status).toBe(200);
      expect((await directory()).find((r) => r.id === id)?.houseId).toBe(houseId);
    }
  });

  it("nama kembar tetap menjadi dua orang dan nama panjang diperbolehkan tanpa akun", async () => {
    const first = await add("Nama kembar", a1);
    const second = await add("Nama kembar", a1);
    expect(first).not.toBe(second);
    const id = await add("W".repeat(100));
    expect((await directory()).find((r) => r.id === id)?.name).toHaveLength(100);
  });

  it("rumah tidak valid dan input yang salah ditolak sebelum menyimpan", async () => {
    const before = (await directory()).length;
    expect((await admin.post("/api/admin/warga", { name: "Tidak disimpan", houseId: 999999 })).status).toBe(404);
    for (const input of [{ name: " " }, { name: "W".repeat(101) }, { name: "Contoh", phone: "abc" }, { name: "Contoh", houseId: "1" }]) {
      expect((await admin.post("/api/admin/warga", input)).status).toBe(400);
    }
    expect((await directory()).length).toBe(before);
    expect((await admin.patch("/api/admin/warga/999999", { name: "Tidak ada" })).status).toBe(404);
    expect((await admin.patch("/api/admin/warga/0", { name: "Tidak ada" })).status).toBe(400);
  });

  it("hapus warga mempertahankan rumah; rumah dengan riwayat hunian tetap tersimpan", async () => {
    const id = await add("Warga dihapus", b1);
    expect((await admin.delete(`/api/admin/warga/${id}`)).status).toBe(200);
    expect((await directory()).find((r) => r.id === id)).toBeUndefined();
    expect((await listHouses(db)).some((h) => h.id === b1)).toBe(true);
    const created = await admin.post("/api/admin/rumah", { block: "Z", numbers: "9" });
    expect(created.status).toBe(200);
    const home = (await listHouses(db)).find((h) => h.block === "Z")!;
    const person = await add("Rumah dilepas", home.id);
    expect((await admin.delete(`/api/admin/rumah/${home.id}`)).status).toBe(409);
    expect((await directory()).find((r) => r.id === person)).toMatchObject({ name: "Rumah dilepas", houseId: home.id });
  });
});

describe("warga terhubung akun petugas", () => {
  it("membuat akun memakai profil yang sama, menyimpan telepon, dan mengambil jadwal rumah", async () => {
    const id = await add("Petugas dari warga", a2, "08111222333");
    await db.insert(rondaSchedule).values({ dayOfWeek: 2, position: 0, houseId: a2 });
    const result = await admin.post("/api/admin/petugas", { residentId: id, name: "Petugas dari warga", pin: "1234", role: "petugas", houseId: a2 });
    expect(result.status).toBe(200);
    const userId = Number(result.data.id);
    expect((await directory()).filter((r) => r.name === "Petugas dari warga")).toEqual([
      expect.objectContaining({ id, userId, houseId: a2, phone: "08111222333" }),
    ]);
    expect((await db.select().from(residents).where(eq(residents.id, id)))[0]).toMatchObject({ name: null, houseId: null, userId });
    expect((await listSchedule(db)).find((s) => s.userId === userId)).toMatchObject({ day: 2, houseId: a2 });
    expect((await admin.post("/api/admin/petugas", { residentId: id, name: "Akun kedua", pin: "1234", role: "petugas" })).status).toBe(409);

    const before = (await db.select().from(users).where(eq(users.id, userId)))[0];
    await db.insert(rondaSchedule).values({ dayOfWeek: 4, position: 0, houseId: b1 });
    expect((await admin.patch(`/api/admin/warga/${id}`, { name: "Nama akun berubah", houseId: b1, phone: "+62 811-1222-333" })).status).toBe(200);
    const after = (await db.select().from(users).where(eq(users.id, userId)))[0];
    expect(after).toMatchObject({ name: "Nama akun berubah", houseId: b1, role: before.role, active: before.active, pinHash: before.pinHash, sessionVersion: before.sessionVersion });
    expect((await listSchedule(db)).filter((s) => s.userId === userId).map((s) => [s.day, s.houseId])).toEqual([[2, b1], [4, b1]]);

    expect((await admin.patch(`/api/admin/petugas/${userId}`, { name: "Nama dari akun", role: "petugas", active: true, houseId: a2 })).status).toBe(200);
    expect((await directory()).find((r) => r.id === id)).toMatchObject({ name: "Nama dari akun", houseId: a2, phone: "+62 811-1222-333" });
    expect((await admin.delete(`/api/admin/warga/${id}`)).status).toBe(409);
  });

  it("perubahan yang membuat nama login ambigu dibatalkan seluruhnya", async () => {
    const first = await admin.post("/api/admin/petugas", { name: "Nama login kembar", pin: "1234", role: "petugas", houseId: a1, residentId: null });
    const second = await admin.post("/api/admin/petugas", { name: "Nama login kembar", pin: "1234", role: "petugas", houseId: b1, residentId: null });
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    const resident = (await directory()).find((r) => r.userId === Number(first.data.id))!;
    expect((await admin.patch(`/api/admin/warga/${resident.id}`, { name: resident.name, houseId: b1, phone: "08111111111" })).status).toBe(409);
    expect((await directory()).find((r) => r.id === resident.id)).toMatchObject({ houseId: a1, phone: null });
    expect((await admin.patch(`/api/admin/warga/${resident.id}`, { name: "W".repeat(41), houseId: a1 })).status).toBe(400);
  });

  it("hanya admin dapat mengakses daftar atau mengubah data warga", async () => {
    const guest = apiClient(env);
    for (const response of [await guest.get("/api/admin/warga"), await guest.post("/api/admin/warga", { name: "Dilarang" })]) expect(response.status).toBe(401);
    const account = (await db.select().from(users)).find((u) => u.name === "Nama dari akun")!;
    expect((await guest.post("/api/auth/login", { userId: account.id, pin: "1234" })).status).toBe(200);
    expect((await guest.get("/api/admin/warga")).status).toBe(403);
    expect((await guest.patch("/api/admin/warga/1", { name: "Dilarang" })).status).toBe(403);
    const response = await admin.get("/api/admin/warga");
    expect(response.status).toBe(200);
  });

  it("nomor telepon warga tidak ikut ke info QR atau daftar login", async () => {
    const house = (await listHouses(db)).find((h) => h.id === a1)!;
    const guest = apiClient(env);
    expect(JSON.stringify((await guest.get(`/api/rumah/${house.token}`)).data)).not.toContain("08123456789");
    expect(JSON.stringify(await listLoginUsers(db))).not.toMatch(/08123456789|phone/);
  });
});

it("migrasi memindahkan nama lama sambil mempertahankan akun, rumah, QR, dan PIN", async () => {
  const legacy = await createTestEnv();
  const [h1, h2] = await legacy.db.insert(houses).values([
    { block: "M", number: "1", ownerName: " Warga lama ", token: "MIGRATE1" },
    { block: "M", number: "2", ownerName: "Nama rumah yang diabaikan", token: "MIGRATE2" },
  ]).returning();
  const [account] = await legacy.db.insert(users).values({ name: "Nama akun asli", pinHash: "existing-hash", role: "petugas", houseId: h2.id }).returning();
  await legacy.db.execute(sql`drop table residents cascade`); // Hanya database tes yang terisolasi.
  const migration = readFileSync(new URL("../drizzle/0007_residents.sql", import.meta.url), "utf8");
  await legacy.db.transaction(async (tx) => {
    for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
  });
  const migrated = (await legacy.db.execute(sql`select coalesce(r.name, u.name) as name, coalesce(r.house_id, u.house_id) as "houseId", r.user_id as "userId" from residents r left join users u on u.id = r.user_id`)).rows;
  expect(migrated).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Warga lama", houseId: h1.id, userId: null }),
    expect.objectContaining({ name: "Nama akun asli", houseId: h2.id, userId: account.id }),
  ]));
  expect(await legacy.db.select().from(users)).toEqual([account]);
  expect((await legacy.db.select().from(houses)).map((h) => [h.token, h.ownerName])).toEqual([[h1.token, null], [h2.token, null]]);
  const result = await legacy.db.execute<{ enabled: boolean }>(sql`select relrowsecurity as enabled from pg_class where relname = 'residents'`);
  expect(result.rows[0].enabled).toBe(true);
}, 15_000); // Database baru + migrasi ulang PGlite membutuhkan waktu saat suite berjalan paralel.
