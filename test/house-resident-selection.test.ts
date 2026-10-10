import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { listResidents } from "@/server/residents";
import { listSchedule } from "@/server/schedule";
import { families, houses, residents, residenceMoves, rondaSchedule, users } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

let env: Awaited<ReturnType<typeof createTestEnv>>["env"];
let admin: ReturnType<typeof apiClient>;
let nextHouse = 0;
beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
});
async function house() {
  const number = String(++nextHouse);
  const [row] = await env.db.insert(houses).values({ block: "Z", number, token: `SELECT${number}` }).returning();
  return row;
}
async function person(name: string, houseId: number | null = null, account = false) {
  const result = await admin.post("/api/admin/warga", { name, houseId, phone: "08123456789" });
  expect(result.status).toBe(200);
  const id = Number(result.data.id);
  if (account) expect((await admin.post("/api/admin/petugas", { residentId: id, name, houseId, pin: "1234", role: "petugas" })).status).toBe(200);
  return (await listResidents(env.db)).find((r) => r.id === id)!;
}
const patch = (home: Awaited<ReturnType<typeof house>>, residentId: number | null, previousResidentId: number | null) =>
  admin.patch(`/api/admin/rumah/${home.id}`, { block: home.block, number: home.number, status: home.status, residentId, previousResidentId });

it("mengganti penghuni memakai ID, menjaga identitas, akun, PIN, telepon dan tugas kedua orang", async () => {
  const target = await house(), source = await house();
  const old = await person("Penghuni lama", target.id, true), chosen = await person("Penghuni baru", source.id, true);
  await env.db.insert(rondaSchedule).values([
    { dayOfWeek: 1, position: 0, residentId: old.id, color: "green" },
    { dayOfWeek: 2, position: 0, residentId: chosen.id, color: "blue" },
  ]);
  const accountsBefore = await env.db.select().from(users);
  const peopleBefore = await listResidents(env.db);
  expect((await patch(target, chosen.id, old.id)).status).toBe(200);
  const people = await listResidents(env.db);
  expect(people).toHaveLength(peopleBefore.length);
  expect(people.find((r) => r.id === old.id)).toMatchObject({ name: old.name, userId: old.userId, houseId: null, phone: old.phone });
  expect(people.find((r) => r.id === chosen.id)).toMatchObject({ name: chosen.name, userId: chosen.userId, houseId: target.id, phone: chosen.phone });
  for (const id of [old.userId!, chosen.userId!]) {
    const before = accountsBefore.find((u) => u.id === id)!;
    const [after] = await env.db.select().from(users).where(eq(users.id, id));
    expect(after).toEqual({ ...before, houseId: id === old.userId ? null : target.id });
  }
  expect((await listSchedule(env.db)).filter((s) => [old.id, chosen.id].includes(s.residentId!))).toEqual(expect.arrayContaining([
    expect.objectContaining({ residentId: old.id, day: 1, houseId: null, color: "green" }),
    expect.objectContaining({ residentId: chosen.id, day: 2, houseId: target.id, color: "blue" }),
  ]));
  expect((await env.db.select().from(houses).where(eq(houses.id, target.id)))[0]).toEqual(target);
  const moves = await env.db.select().from(residenceMoves);
  expect(moves).toEqual(expect.arrayContaining([
    expect.objectContaining({ residentId: old.id, fromHouseId: target.id, toHouseId: null }),
    expect.objectContaining({ residentId: chosen.id, fromHouseId: source.id, toHouseId: target.id }),
  ]));
});

it("rumah baru memakai profil yang dipilih di antara nama kembar tanpa membuat warga baru", async () => {
  const first = await person("Nama kembar"), chosen = await person("Nama kembar");
  const before = await listResidents(env.db);
  expect((await admin.post("/api/admin/rumah", { block: "P", numbers: "1", residentId: chosen.id })).status).toBe(200);
  const [home] = await env.db.select().from(houses).where(eq(houses.block, "P"));
  const after = await listResidents(env.db);
  expect(after).toHaveLength(before.length);
  expect(after.find((r) => r.id === first.id)?.houseId).toBeNull();
  expect(after.find((r) => r.id === chosen.id)?.houseId).toBe(home.id);
  expect((await patch(home, null, chosen.id)).status).toBe(200);
  expect((await listResidents(env.db)).find((r) => r.id === chosen.id)).toMatchObject({ name: chosen.name, houseId: null });
});

it("perubahan blok/nomor/status saja tidak menyentuh penghuni, termasuk beberapa warga dalam satu rumah", async () => {
  const home = await house();
  const first = await person("Satu", home.id, true), second = await person("Dua", home.id);
  const before = await listResidents(env.db);
  expect((await admin.patch(`/api/admin/rumah/${home.id}`, { block: "X", number: home.number, status: "vacant" })).status).toBe(200);
  expect((await listResidents(env.db)).filter((r) => [first.id, second.id].includes(r.id)))
    .toEqual(before.filter((r) => [first.id, second.id].includes(r.id)).map((r) => ({ ...r, block: "X" })));
  expect((await patch(home, null, first.id)).status).toBe(409);
  expect((await env.db.select().from(houses).where(eq(houses.id, home.id)))[0]).toMatchObject({ block: "X", status: "vacant" });
  expect((await listResidents(env.db)).filter((r) => r.houseId === home.id)).toHaveLength(2);
});

it("pilihan dari layar lama ditolak jika penghuni sudah berubah; seluruh edit dibatalkan", async () => {
  const home = await house();
  const old = await person("Pindah lebih dulu", home.id), current = await person("Penghuni terkini"), chosen = await person("Pilihan lama");
  expect((await admin.patch(`/api/admin/warga/${old.id}`, { name: old.name, houseId: null })).status).toBe(200);
  expect((await admin.patch(`/api/admin/warga/${current.id}`, { name: current.name, houseId: home.id })).status).toBe(200);
  const result = await admin.patch(`/api/admin/rumah/${home.id}`, { block: "Y", number: home.number, status: "vacant", residentId: chosen.id, previousResidentId: old.id });
  expect(result.status).toBe(409);
  expect(result.data.error).toContain("Penghuni rumah sudah berubah");
  expect((await env.db.select().from(houses).where(eq(houses.id, home.id)))[0]).toEqual(home);
  expect((await listResidents(env.db)).find((r) => r.id === chosen.id)?.houseId).toBeNull();
});

it("pilihan warga yang tidak ada dan isian nama bersama ID ditolak tanpa menulis rumah", async () => {
  const home = await house();
  for (const input of [
    { residentId: 999999, previousResidentId: null },
    { residentId: null },
    { residentId: "1", previousResidentId: null },
    { residentId: null, previousResidentId: null, ownerName: "Nama bebas" },
  ]) {
    const result = await admin.patch(`/api/admin/rumah/${home.id}`, { block: "BAD", number: home.number, status: "vacant", ...input });
    expect([400, 404]).toContain(result.status);
  }
  expect((await env.db.select().from(houses).where(eq(houses.id, home.id)))[0]).toEqual(home);
  expect((await admin.post("/api/admin/rumah", { block: "BAD", numbers: "1", residentId: 999999 })).status).toBe(404);
  expect(await env.db.select().from(houses).where(eq(houses.block, "BAD"))).toHaveLength(0);
  expect((await admin.patch("/api/admin/rumah/999999", { block: "BAD", number: "1", status: "active" })).status).toBe(404);
});

it("kegagalan memindahkan warga pilihan mengembalikan hubungan penghuni lama dan riwayatnya", async () => {
  const home = await house(), source = await house(), other = await house();
  const old = await person("Penghuni sebelum gagal", home.id, true);
  const chosen = await person("Login sama", source.id, true);
  await person("Login sama", other.id, true);
  // Akun tanpa rumah dengan nama kembar akan membuat login ambigu saat perpindahan berikutnya.
  await env.db.update(users).set({ houseId: null }).where(eq(users.houseId, other.id));
  const before = await listResidents(env.db);
  const moves = await env.db.select().from(residenceMoves);
  expect((await patch(home, chosen.id, old.id)).status).toBe(409);
  expect(await listResidents(env.db)).toEqual(before);
  expect(await env.db.select().from(residenceMoves)).toEqual(moves);
});

it("pilihan warga tidak diterapkan pada rumah yang sudah ada atau penambahan banyak nomor", async () => {
  const home = await house();
  const chosen = await person("Tetap di rumahnya", home.id);
  expect((await admin.post("/api/admin/rumah", { block: home.block, numbers: home.number, residentId: chosen.id })).status).toBe(409);
  expect((await admin.post("/api/admin/rumah", { block: "BULK", numbers: "1-3", residentId: chosen.id })).status).toBe(400);
  expect(await env.db.select().from(houses).where(eq(houses.block, "BULK"))).toHaveLength(0);
  expect((await listResidents(env.db)).find((r) => r.id === chosen.id)?.houseId).toBe(home.id);
});

it("pemilihan di Rumah tidak melepaskan hubungan keluarga dan boleh menyimpan pilihan yang tetap", async () => {
  const home = await house(), destination = await house();
  const head = await person("Kepala keluarga", home.id), replacement = await person("Pengganti");
  const [family] = await env.db.insert(families).values({ headResidentId: head.id }).returning();
  await env.db.update(residents).set({ familyId: family.id, familyRelation: "head" }).where(eq(residents.id, head.id));
  const movesBefore = await env.db.select().from(residenceMoves);
  expect((await patch(home, replacement.id, head.id)).status).toBe(409);
  expect((await patch(destination, head.id, null)).status).toBe(409);
  expect((await admin.post("/api/admin/rumah", { block: "FAMILY", numbers: "1", residentId: head.id })).status).toBe(409);
  expect(await env.db.select().from(houses).where(eq(houses.block, "FAMILY"))).toHaveLength(0);
  expect((await patch(home, head.id, head.id)).status).toBe(200);
  expect((await listResidents(env.db)).find((r) => r.id === head.id)).toMatchObject({ houseId: home.id, familyId: family.id });
  expect(await env.db.select().from(residenceMoves)).toEqual(movesBefore);
});
