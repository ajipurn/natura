import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@/server/schema";
import { ROLES, type Resource, can } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { apiClient, createTestEnv } from "./helpers/db";

let env: Awaited<ReturnType<typeof createTestEnv>>["env"];
let admin: ReturnType<typeof apiClient>;
const clients = new Map<Role, ReturnType<typeof apiClient>>();
let adminId: number;
let residentId: number;

beforeAll(async () => {
  ({ env } = await createTestEnv());
  admin = apiClient(env);
  expect(
    (
      await admin.post("/api/auth/setup", {
        communityName: "Natura",
        defaultAmount: 500,
        name: "Admin utama",
        pin: "1234",
        pinConfirm: "1234",
      })
    ).status,
  ).toBe(200);
  adminId = (await env.db.select().from(users))[0].id;
  clients.set("admin", admin);
  for (const role of ROLES.filter((r) => r !== "admin")) {
    const created = await admin.post("/api/admin/petugas", {
      name: `Akun ${role}`,
      role,
      pin: "1234",
      houseId: null,
    });
    expect(created.status).toBe(200);
    const [user] = await env.db
      .select()
      .from(users)
      .where(eq(users.name, `Akun ${role}`));
    const client = apiClient(env);
    expect(
      (await client.post("/api/auth/login", { userId: user.id, pin: "1234" }))
        .status,
    ).toBe(200);
    clients.set(role, client);
  }
  residentId = Number(
    (await admin.post("/api/admin/warga", { name: "Warga contoh" })).data.id,
  );
});

const READ_CASES: [Resource, string][] = [
  ["overview", "/api/admin/ringkasan"],
  ["residents", "/api/admin/warga"],
  ["residents", "/api/admin/keluarga"],
  ["houses", "/api/admin/rumah"],
  ["schedule", "/api/admin/permintaan"],
  ["patrols", "/api/admin/audit?tanggal=2024-02-01"],
  ["finance", "/api/admin/kas"],
  ["finance", "/api/admin/iuran"],
  ["finance", "/api/admin/pembayaran"],
  ["info", "/api/admin/info"],
  ["accounts", "/api/admin/petugas"],
  ["settings", "/api/admin/pengaturan"],
];

describe("akses pengurus dari peran di database", () => {
  for (const role of ROLES)
    it(`${role}: pemeriksaan seluruh kelompok rute baca`, async () => {
      const client = clients.get(role)!;
      for (const [resource, path] of READ_CASES) {
        const response = await client.get(path);
        expect(
          response.status,
          `${role} ${path}: ${JSON.stringify(response.data)}`,
        ).toBe(can(role, resource) ? 200 : 403);
      }
    });

  it("akses tulis dibatasi meski mengirim peran palsu di payload", async () => {
    for (const role of ["sekretaris", "bendahara", "petugas"] as const) {
      const client = clients.get(role)!;
      expect(
        (
          await client.post("/api/admin/petugas", {
            name: "Terselundup",
            role: "admin",
            pin: "1234",
          })
        ).status,
      ).toBe(403);
      expect(
        (await client.patch("/api/admin/petugas/1", { role: "admin" })).status,
      ).toBe(403);
      expect(
        (await client.post("/api/admin/pengaturan/token-ekspor")).status,
      ).toBe(403);
    }
    expect(
      (
        await clients
          .get("bendahara")!
          .post("/api/admin/rumah", { block: "A", numbers: "1" })
      ).status,
    ).toBe(403);
    expect(
      (
        await clients
          .get("bendahara")!
          .patch(`/api/admin/warga/${residentId}`, { name: "Dilarang" })
      ).status,
    ).toBe(403);
    expect(
      (await clients.get("sekretaris")!.post("/api/admin/iuran/jenis", {}))
        .status,
    ).toBe(403);
    expect(
      (
        await clients
          .get("sekretaris")!
          .patch("/api/admin/riwayat/2024-02-01/1", {})
      ).status,
    ).toBe(403);
    expect(
      (
        await clients
          .get("bendahara")!
          .patch("/api/admin/riwayat/2024-02-01/1", {})
      ).status,
    ).toBe(403);
  });

  it("sekretaris mengelola warga dan rumah, bendahara mengelola iuran", async () => {
    expect(
      (
        await clients
          .get("sekretaris")!
          .patch(`/api/admin/warga/${residentId}`, { name: "Warga tersimpan" })
      ).status,
    ).toBe(200);
    expect(
      (
        await clients
          .get("sekretaris")!
          .post("/api/admin/rumah", { block: "A", numbers: "1" })
      ).status,
    ).toBe(200);
    expect(
      (
        await clients.get("bendahara")!.post("/api/admin/iuran/jenis", {
          name: "Kebersihan",
          amount: 50000,
          cadence: "monthly",
          startMonth: "2024-02",
          dueDay: 10,
        })
      ).status,
    ).toBe(200);
  });

  it("pengunjung tanpa akun tidak bisa membaca data warga, keluarga, tagihan atau bukti", async () => {
    const guest = apiClient(env);
    for (const path of [
      "/api/admin/warga",
      "/api/admin/keluarga",
      "/api/admin/iuran",
      "/api/admin/iuran/pembayaran/1/bukti",
    ])
      expect((await guest.get(path)).status).toBe(401);
    for (const role of ["sekretaris", "petugas"] as const)
      expect(
        (await clients.get(role)!.get("/api/admin/iuran/pembayaran/1/bukti"))
          .status,
      ).toBe(403);
  });

  it("kode warga dan token ekspor hanya diberikan kepada peran yang mengelolanya", async () => {
    await env.db.execute(
      "update settings set export_token = 'token-rahasia', warga_code = 'kode-rahasia'",
    );
    expect(
      (await clients.get("bendahara")!.get("/api/admin/pengaturan")).data,
    ).toMatchObject({ exportToken: null, wargaCode: null });
    expect(
      (await clients.get("sekretaris")!.get("/api/admin/pengaturan")).data,
    ).toMatchObject({ exportToken: null, wargaCode: "kode-rahasia" });
    expect(
      (await clients.get("ketua")!.get("/api/admin/pengaturan")).data,
    ).toMatchObject({
      exportToken: "token-rahasia",
      wargaCode: "kode-rahasia",
    });
  });

  it("peran yang tidak dikenal ditolak dan akun sendiri tidak dapat diturunkan atau dinonaktifkan", async () => {
    expect(
      (
        await admin.post("/api/admin/petugas", {
          name: "Peran asing",
          pin: "1234",
          role: "superadmin",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.patch(`/api/admin/petugas/${adminId}`, {
          name: "Admin utama",
          role: "petugas",
          active: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.patch(`/api/admin/petugas/${adminId}`, {
          name: "Admin utama",
          role: "admin",
          active: false,
        })
      ).status,
    ).toBe(400);
    expect((await admin.get("/api/admin/warga")).status).toBe(200);
  });

  it("perubahan peran mencabut sesi lama dan login baru memakai izin terbaru", async () => {
    const created = await admin.post("/api/admin/petugas", {
      name: "Akun berpindah peran",
      role: "bendahara",
      pin: "1234",
    });
    expect(created.status).toBe(200);
    const [user] = await env.db
      .select()
      .from(users)
      .where(eq(users.name, "Akun berpindah peran"));
    const client = apiClient(env);
    await client.post("/api/auth/login", { userId: user.id, pin: "1234" });
    expect((await client.get("/api/admin/iuran")).status).toBe(200);
    expect(
      (
        await admin.patch(`/api/admin/petugas/${user.id}`, {
          name: user.name,
          role: "sekretaris",
          active: true,
        })
      ).status,
    ).toBe(200);
    expect((await client.get("/api/admin/iuran")).status).toBe(401);
    await client.post("/api/auth/login", { userId: user.id, pin: "1234" });
    expect((await client.get("/api/admin/iuran")).status).toBe(403);
    expect((await client.get("/api/admin/warga")).status).toBe(200);
  });

  it("perubahan akses bersamaan tetap menyisakan pengurus yang dapat mengelola akun", async () => {
    const [ketua] = await env.db
      .select()
      .from(users)
      .where(eq(users.role, "ketua"));
    const responses = await Promise.all([
      admin.patch(`/api/admin/petugas/${ketua.id}`, {
        name: ketua.name,
        role: "ketua",
        active: false,
      }),
      clients.get("ketua")!.patch(`/api/admin/petugas/${adminId}`, {
        name: "Admin utama",
        role: "admin",
        active: false,
      }),
    ]);
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1);
    expect([401, 409]).toContain(
      responses.find((response) => response.status !== 200)?.status,
    );
    const accounts = await env.db.select().from(users);
    expect(
      accounts.filter(
        (account) => account.active && can(account.role, "accounts", true),
      ),
    ).toHaveLength(1);
  });
});
