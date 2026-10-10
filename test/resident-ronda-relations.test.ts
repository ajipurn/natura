import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { listSchedule, replaceSlots, saveSchedule } from "@/server/schedule";
import { listResidents } from "@/server/residents";
import { dutyDays } from "@/server/collections";
import { houses, rondaSchedule, users } from "@/server/schema";
import { apiClient, createTestEnv } from "./helpers/db";

let env: Awaited<ReturnType<typeof createTestEnv>>["env"];
let admin: ReturnType<typeof apiClient>;
let a1: number;
let a2: number;
let personId: number;
let accountId: number;
let neighbourId: number;
beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  await admin.post("/api/auth/setup", { communityName: "Natura", defaultAmount: 500, name: "Admin", pin: "1234", pinConfirm: "1234" });
  const rows = await env.db.insert(houses).values([
    { block: "A", number: "1", token: "RELATIONA1" },
    { block: "A", number: "2", token: "RELATIONA2" },
  ]).returning();
  a1 = rows[0].id; a2 = rows[1].id;
  personId = Number((await admin.post("/api/admin/warga", { name: "Ipung", houseId: a1, phone: "081234567890" })).data.id);
  neighbourId = Number((await admin.post("/api/admin/warga", { name: "Tetangga", houseId: a1 })).data.id);
});

describe("orang, tempat tinggal, akses, dan tugas ronda", () => {
  it("menugaskan warga tertentu sebelum memiliki akun, tanpa menugaskan penghuni serumah", async () => {
    const result = await admin.put("/api/admin/jadwal/slot", { slots: [
      { day: 1, residentId: personId, houseId: null, name: null, color: "orange" },
      { day: 3, houseId: a2, name: null },
    ] });
    expect(result.status).toBe(200);
    expect((await listSchedule(env.db))[0]).toMatchObject({ residentId: personId, name: "Ipung", userId: null, houseId: a1, color: "orange" });
    expect((await admin.delete(`/api/admin/warga/${personId}`)).status).toBe(409);
    expect((await listSchedule(env.db)).some((s) => s.residentId === neighbourId)).toBe(false);
  });

  it("membuat akun mempertahankan profil dan tugas orang itu; alamat tidak menambah tugas", async () => {
    const result = await admin.post("/api/admin/petugas", { residentId: personId, name: "Ipung", pin: "1234", role: "petugas", houseId: a1 });
    expect(result.status).toBe(200);
    accountId = Number(result.data.id);
    expect((await listResidents(env.db)).find((r) => r.id === personId)).toMatchObject({ userId: accountId, houseId: a1, phone: "081234567890" });
    expect([...await dutyDays(env.db, accountId)]).toEqual([1]);
    expect((await listResidents(env.db)).filter((r) => r.houseId === a1)).toHaveLength(2);
    expect((await listSchedule(env.db))[0]).toMatchObject({ residentId: personId, userId: accountId, color: "orange" });
  });

  it("pindah dan ubah nama tetap menunjuk orang yang sama, tanpa mewarisi tugas rumah tujuan", async () => {
    expect((await admin.patch(`/api/admin/warga/${personId}`, { name: "Pak Ipung", houseId: a2 })).status).toBe(200);
    expect([...await dutyDays(env.db, accountId)]).toEqual([1]);
    expect((await listSchedule(env.db))[0]).toMatchObject({ residentId: personId, userId: accountId, name: "Pak Ipung", houseId: a2 });
    expect(await env.db.select().from(rondaSchedule).where(eq(rondaSchedule.houseId, a2))).toHaveLength(1);
  });

  it("impor tidak menugaskan satu-satunya akun di rumah jika nama orangnya berbeda", async () => {
    await saveSchedule(env.db, [{ day: 4, position: 0, name: "Orang lain", block: "A", number: "2" }], { fillNames: false, overwriteNames: false });
    expect((await listSchedule(env.db))[0]).toMatchObject({ residentId: null, userId: null, name: "Orang lain (A-2)" });
    expect([...await dutyDays(env.db, accountId)]).toEqual([]);
    expect((await listResidents(env.db)).find((r) => r.id === personId)?.name).toBe("Pak Ipung");
  });

  it("impor tidak memindahkan akun tanpa rumah; nama kembar dalam satu rumah tetap perlu dipilih", async () => {
    const created = await admin.post("/api/admin/petugas", { name: "Belum beralamat", role: "petugas", pin: "1234", houseId: null, residentId: null });
    const id = Number(created.data.id);
    await saveSchedule(env.db, [{ day: 4, position: 0, name: "Belum beralamat", block: "A", number: "1" }], { fillNames: false, overwriteNames: false });
    expect((await env.db.select().from(users).where(eq(users.id, id)))[0].houseId).toBeNull();
    const one = Number((await admin.post("/api/admin/warga", { name: "Nama kembar", houseId: a1 })).data.id);
    await admin.post("/api/admin/warga", { name: "Nama kembar", houseId: a1 });
    await saveSchedule(env.db, [{ day: 5, position: 0, name: "Nama kembar", block: "A", number: "1" }], { fillNames: false, overwriteNames: false });
    expect((await listSchedule(env.db))[0].residentId).toBeNull();
    expect(await replaceSlots(env.db, [{ day: 5, residentId: one, houseId: null, name: null }])).toBeNull();
    expect((await listSchedule(env.db))[0].residentId).toBe(one);
  });

  it("akun baru dengan nama berbeda tidak mengambil profil penghuni lain hanya karena rumahnya sama", async () => {
    const before = (await listResidents(env.db)).find((r) => r.id === neighbourId)!;
    expect((await admin.post("/api/admin/petugas", { name: "Warga lain", role: "petugas", pin: "1234", houseId: a1 })).status).toBe(200);
    expect((await listResidents(env.db)).find((r) => r.id === neighbourId)).toEqual(before);
  });
});
