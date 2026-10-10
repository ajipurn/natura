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
    for (const role of ["sekretaris", "bendahara", "humas", "petugas"] as const) {
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

  it("humas menerbitkan, menyunting, menyematkan, dan menghapus pengumuman serta mengelola kontak", async () => {
    const humas = clients.get("humas")!;
    expect((await humas.post("/api/admin/pengumuman", {
      title: "Kerja bakti", body: "Berkumpul di taman.", pinned: false,
    })).status).toBe(200);
    const info = (await humas.get("/api/admin/info")).data;
    const [announcement] = info.announcements as { id: number; title: string }[];
    expect(announcement.title).toBe("Kerja bakti");
    expect((await humas.patch(`/api/admin/pengumuman/${announcement.id}`, {
      title: "Kerja bakti hari Minggu", body: "Pukul 07.00 di taman.", pinned: true,
    })).status).toBe(200);
    expect((await humas.put("/api/admin/kontak", {
      contacts: [{ name: "Pengurus Humas", role: "Humas", phone: "081234567890" }],
    })).status).toBe(200);
    expect((await humas.get("/api/admin/info")).data).toMatchObject({
      announcements: [{ id: announcement.id, title: "Kerja bakti hari Minggu", pinned: true }],
      contacts: [{ name: "Pengurus Humas", role: "Humas", phone: "081234567890" }],
    });
    expect((await humas.delete(`/api/admin/pengumuman/${announcement.id}`)).status).toBe(200);
    expect((await humas.put("/api/admin/kontak", { contacts: [] })).status).toBe(200);
    expect((await humas.get("/api/admin/info")).data).toMatchObject({ announcements: [], contacts: [] });
  });

  it("humas membaca data lingkungan tetapi tidak mengubahnya atau mengakses keuangan dan akun", async () => {
    const humas = clients.get("humas")!;
    for (const path of ["/api/admin/warga", "/api/admin/keluarga", "/api/admin/rumah", "/api/jadwal"])
      expect((await humas.get(path)).status, path).toBe(200);
    for (const path of ["/api/admin/ringkasan", "/api/admin/petugas", "/api/admin/kas", "/api/admin/iuran", "/api/admin/pembayaran", "/api/admin/audit?tanggal=2024-02-01"])
      expect((await humas.get(path)).status, path).toBe(403);
    for (const path of ["/api/admin/warga", "/api/admin/keluarga", "/api/admin/rumah", "/api/admin/petugas", "/api/admin/kas"])
      expect((await humas.post(path, {})).status, path).toBe(403);
    for (const path of [`/api/admin/warga/${residentId}`, "/api/admin/keluarga/1", "/api/admin/rumah/1", "/api/admin/riwayat/2024-02-01/1"])
      expect((await humas.patch(path, {})).status, path).toBe(403);
    for (const path of [`/api/admin/warga/${residentId}`, "/api/admin/keluarga/1", "/api/admin/rumah/1"])
      expect((await humas.delete(path)).status, path).toBe(403);
    expect((await humas.put("/api/admin/jadwal/slot", { slots: [] })).status).toBe(403);
    expect((await humas.put("/api/admin/jadwal", {})).status).toBe(403);
    expect((await humas.put("/api/admin/pengaturan", {})).status).toBe(403);
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
    for (const role of ["sekretaris", "humas", "petugas"] as const)
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
      (await clients.get("humas")!.get("/api/admin/pengaturan")).data,
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
    expect((await admin.patch(`/api/admin/petugas/${user.id}`, {
      name: user.name, role: "humas", active: true,
    })).status).toBe(200);
    expect((await client.get("/api/admin/warga")).status).toBe(401);
    expect((await client.post("/api/auth/login", { userId: user.id, pin: "1234" })).data).toMatchObject({ user: { role: "humas" } });
    expect((await client.get("/api/admin/warga")).status).toBe(200);
    expect((await client.patch(`/api/admin/warga/${residentId}`, { name: "Dilarang" })).status).toBe(403);
    expect((await client.get("/api/admin/info")).status).toBe(200);
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
