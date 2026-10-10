import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  families,
  houses,
  residents,
  rondaSchedule,
  users,
} from "@/server/schema";
import { listResidents } from "@/server/residents";
import { listSchedule } from "@/server/schedule";
import { apiClient, createTestEnv } from "./helpers/db";

let env: Awaited<ReturnType<typeof createTestEnv>>["env"];
let admin: ReturnType<typeof apiClient>;
let a1: number,
  a2: number,
  headId: number,
  spouseId: number,
  childId: number,
  familyId: number,
  spouseUserId: number;
const date = "2024-02-01";
const people = () => listResidents(env.db);
async function add(
  name: string,
  houseId: number | null,
  housingStatus = "unknown",
) {
  const result = await admin.post("/api/admin/warga", {
    name,
    houseId,
    housingStatus,
    residentSince: houseId ? "2024-01-01" : null,
  });
  expect(result.status).toBe(200);
  return Number(result.data.id);
}
const familyBody = () => ({
  headResidentId: headId,
  houseId: a1,
  members: [
    { id: spouseId, relation: "spouse" },
    { id: childId, relation: "child" },
  ],
  moveDate: date,
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
  await admin.post("/api/admin/rumah", { block: "A", numbers: "1-2" });
  const rows = await env.db.select().from(houses);
  [a1, a2] = rows.map((h) => h.id);
  headId = await add("Kepala", a1, "owner");
  spouseId = await add("Pasangan", a1, "family");
  childId = await add("Anak", a1, "family");
  await admin.post("/api/admin/petugas", {
    residentId: spouseId,
    name: "Pasangan",
    houseId: a1,
    pin: "1234",
  });
  spouseUserId = (await people()).find((p) => p.id === spouseId)!.userId!;
});

describe("keluarga memakai data orang dan alamat yang sama", () => {
  it("menghubungkan kepala, pasangan, dan anak tanpa menduplikasi warga atau rumah", async () => {
    const before = await people();
    const result = await admin.post("/api/admin/keluarga", familyBody());
    expect(result.status).toBe(200);
    familyId = Number(result.data.id);
    const after = await people();
    expect(after).toHaveLength(before.length);
    expect(after.find((p) => p.id === headId)).toMatchObject({
      familyId,
      familyRelation: "head",
      housingStatus: "owner",
      houseId: a1,
    });
    expect(after.find((p) => p.id === spouseId)).toMatchObject({
      familyId,
      familyRelation: "spouse",
      userId: spouseUserId,
      name: "Pasangan",
      houseId: a1,
    });
    expect(after.find((p) => p.id === childId)).toMatchObject({
      familyId,
      familyRelation: "child",
    });
    const response = await admin.get("/api/admin/keluarga");
    expect(response.data.families).toEqual([
      expect.objectContaining({
        headName: "Kepala",
        block: "A",
        number: "1",
        members: expect.arrayContaining([
          expect.objectContaining({ id: childId }),
        ]),
      }),
    ]);
  });

  it("menolak pilihan berulang, warga dari keluarga lain, dan rumah yang hilang secara atomik", async () => {
    const other = await add("Kepala lain", a1);
    const before = await people();
    for (const input of [
      {
        headResidentId: other,
        houseId: a2,
        members: [{ id: other, relation: "child" }],
      },
      {
        headResidentId: other,
        houseId: a2,
        members: [{ id: childId, relation: "child" }],
      },
      { headResidentId: other, houseId: 9999, members: [] },
      {
        headResidentId: other,
        houseId: a2,
        members: [{ id: 9999, relation: "child" }],
      },
    ])
      expect(
        (await admin.post("/api/admin/keluarga", input)).status,
      ).toBeGreaterThanOrEqual(400);
    expect(await people()).toEqual(before);
    expect(await env.db.select().from(families)).toHaveLength(1);
  });

  it("satu rumah dapat memiliki beberapa keluarga", async () => {
    const other = (await people()).find((p) => p.name === "Kepala lain")!;
    const result = await admin.post("/api/admin/keluarga", {
      headResidentId: other.id,
      houseId: a1,
      members: [],
    });
    expect(result.status).toBe(200);
    expect((await admin.get("/api/admin/keluarga")).data.families).toHaveLength(
      2,
    );
  });

  it("kepala keluarga tidak bisa dipindahkan sendiri, dilepas, atau dihapus melalui jalan lain", async () => {
    expect(
      (
        await admin.patch(`/api/admin/warga/${headId}`, {
          name: "Kepala",
          houseId: a2,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin.patch(`/api/admin/warga/${headId}`, {
          name: "Kepala",
          houseId: a1,
          familyId: null,
        })
      ).status,
    ).toBe(409);
    expect((await admin.delete(`/api/admin/warga/${headId}`)).status).toBe(409);
    expect((await people()).find((p) => p.id === headId)?.houseId).toBe(a1);
  });

  it("pindah keluarga memperbarui akun, daftar warga, jadwal, dan riwayat tanpa mengganti PIN", async () => {
    const [accountBefore] = await env.db
      .select()
      .from(users)
      .where(eq(users.id, spouseUserId));
    await env.db.insert(rondaSchedule).values([
      { dayOfWeek: 1, position: 0, residentId: spouseId },
      { dayOfWeek: 3, position: 0, houseId: a2 },
    ]);
    const result = await admin.patch(`/api/admin/keluarga/${familyId}`, {
      ...familyBody(),
      houseId: a2,
    });
    expect(result.status).toBe(200);
    expect(
      (await people())
        .filter((p) => p.familyId === familyId)
        .every((p) => p.houseId === a2 && p.residentSince === date),
    ).toBe(true);
    const [accountAfter] = await env.db
      .select()
      .from(users)
      .where(eq(users.id, spouseUserId));
    expect(accountAfter).toMatchObject({
      houseId: a2,
      pinHash: accountBefore.pinHash,
      sessionVersion: accountBefore.sessionVersion,
    });
    expect(
      (await listSchedule(env.db))
        .filter((slot) => slot.userId === spouseUserId)
        .map((slot) => slot.day),
    ).toEqual([1]);
    for (const id of [headId, spouseId, childId]) {
      expect(
        (await admin.get(`/api/admin/warga/${id}/riwayat`)).data.moves,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fromHouseId: a1, toHouseId: a2, date }),
        ]),
      );
    }
  });

  it("perpindahan sebelum mulai tinggal ditolak dan seluruh keluarga tetap di rumah semula", async () => {
    const before = await people();
    expect(
      (
        await admin.patch(`/api/admin/keluarga/${familyId}`, {
          ...familyBody(),
          moveDate: "2023-01-01",
        })
      ).status,
    ).toBe(400);
    expect(await people()).toEqual(before);
  });

  it("anggota yang pindah sendiri dilepas dari keluarga lama dan riwayatnya tetap ada", async () => {
    const result = await admin.patch(`/api/admin/warga/${childId}`, {
      name: "Anak",
      houseId: a1,
      residentSince: "2024-03-01",
    });
    expect(result.status).toBe(200);
    expect((await people()).find((p) => p.id === childId)).toMatchObject({
      familyId: null,
      familyRelation: null,
      houseId: a1,
    });
    expect(
      (await admin.get(`/api/admin/warga/${childId}/riwayat`)).data.moves,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromHouseId: a2, toHouseId: a1 }),
      ]),
    );
  });

  it("menolak anggota berbeda rumah atau perubahan kepala melalui formulir warga", async () => {
    expect(
      (
        await admin.patch(`/api/admin/warga/${childId}`, {
          name: "Anak",
          houseId: a1,
          familyId,
          familyRelation: "child",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin.patch(`/api/admin/warga/${spouseId}`, {
          name: "Pasangan",
          houseId: a2,
          familyId,
          familyRelation: "head",
        })
      ).status,
    ).toBe(409);
  });

  it("kepala dapat diganti dan kelompok dihapus tanpa menghapus data anggotanya", async () => {
    expect(
      (
        await admin.patch(`/api/admin/keluarga/${familyId}`, {
          headResidentId: spouseId,
          houseId: a2,
          members: [{ id: headId, relation: "spouse" }],
        })
      ).status,
    ).toBe(200);
    expect(
      (await people()).find((p) => p.id === spouseId)?.familyRelation,
    ).toBe("head");
    expect((await people()).find((p) => p.id === headId)?.familyRelation).toBe(
      "spouse",
    );
    expect(
      (
        await admin.patch(`/api/admin/petugas/${spouseUserId}`, {
          name: "Pasangan",
          houseId: a1,
          role: "petugas",
          active: true,
        })
      ).status,
    ).toBe(409);
    const before = await people();
    expect((await admin.delete(`/api/admin/keluarga/${familyId}`)).status).toBe(
      200,
    );
    const after = await people();
    expect(after).toHaveLength(before.length);
    for (const id of [headId, spouseId])
      expect(after.find((p) => p.id === id)).toMatchObject({
        familyId: null,
        familyRelation: null,
        houseId: a2,
      });
  });

  it("membersihkan nama rumah tidak dapat melepas kepala keluarga dan transaksi rumah dibatalkan", async () => {
    const [home] = await env.db
      .insert(houses)
      .values({ block: "B", number: "1", token: "NATURATEST" })
      .returning();
    const head = await add("Kepala tunggal", home.id);
    await admin.post("/api/admin/keluarga", {
      headResidentId: head,
      houseId: home.id,
      members: [],
    });
    expect(
      (
        await admin.patch(`/api/admin/rumah/${home.id}`, {
          block: "B",
          number: "2",
          ownerName: "",
          status: "active",
        })
      ).status,
    ).toBe(409);
    expect(
      (await env.db.select().from(houses).where(eq(houses.id, home.id)))[0]
        .number,
    ).toBe("1");
    expect(
      (await env.db.select().from(residents).where(eq(residents.id, head)))[0]
        .houseId,
    ).toBe(home.id);
  });
});
