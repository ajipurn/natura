import { readFileSync } from "node:fs";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, describe, expect, it } from "vitest";

/** Jalankan satu file migrasi apa adanya (dipisah per `--> statement-breakpoint`, seperti wrangler). */
async function applyMigration(d1: { prepare: (sql: string) => { run: () => Promise<unknown> } }, file: string) {
  const sql = readFileSync(`drizzle/${file}`, "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await d1.prepare(statement).run();
  }
}

describe("migrasi 0001: hubungkan petugas dengan jadwal", () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({ workers: [{ name: "m", modules: true, script: "export default {}", d1Databases: { DB: "m" } }] }),
  );
  afterAll(() => mf.dispose());

  it("menautkan jadwal hasil seed lama ke akun dan rumah petugas", async () => {
    const d1 = await mf.getD1Database("DB");
    await applyMigration(d1, "0000_init.sql");
    // Data seperti hasil seed sebelum migrasi ini: akun dan jadwal hanya cocok lewat nama.
    await d1.batch(
      [
        `insert into houses (id, block, number, token, status, created_at) values (1, 'AD', '3', 'T1', 'active', 0), (2, 'AD', '5', 'T2', 'active', 0), (3, 'AF', '7', 'T3', 'active', 0), (4, 'AD', '8', 'T4', 'active', 0)`,
        `insert into users (id, name, pin_hash, role, active, failed_attempts, session_version, created_at) values (1, 'Aji', 'x', 'admin', 1, 0, 1, 0), (2, 'Yusuf', 'x', 'petugas', 1, 0, 1, 0), (3, 'Wawan (AD-5)', 'x', 'petugas', 1, 0, 1, 0), (4, 'Wawan (AF-7)', 'x', 'petugas', 1, 0, 1, 0)`,
        `insert into ronda_schedule (day_of_week, position, name, block, number) values (0, 0, 'Yusuf', 'AD', '3'), (0, 1, 'Aji', 'AD', '8'), (6, 0, 'Wawan', 'AD', '5'), (4, 0, 'Wawan', 'AF', '7'), (2, 0, NULL, 'AA', '8'), (3, 0, 'Tanpa Akun', 'AB', '1')`,
      ].map((sql) => d1.prepare(sql)),
    );
    await applyMigration(d1, "0001_link_petugas.sql");

    const slots = await d1
      .prepare("select name, block, number, user_id from ronda_schedule order by day_of_week, position")
      .all<{ name: string | null; block: string; number: string; user_id: number | null }>();
    type Slot = { name: string | null; block: string; number: string; user_id: number | null };
    expect((slots.results as Slot[]).map((r) => [r.name, `${r.block}-${r.number}`, r.user_id])).toEqual([
      ["Yusuf", "AD-3", 2],
      ["Aji", "AD-8", 1],
      [null, "AA-8", null],
      ["Tanpa Akun", "AB-1", null],
      ["Wawan", "AF-7", 4],
      ["Wawan", "AD-5", 3],
    ]);
    const users = await d1.prepare("select name, house_id from users order by id").all<{ name: string; house_id: number | null }>();
    expect((users.results as { name: string; house_id: number | null }[]).map((r) => [r.name, r.house_id])).toEqual([
      ["Aji", 4],
      ["Yusuf", 1],
      ["Wawan (AD-5)", 2],
      ["Wawan (AF-7)", 3],
    ]);
  });
});

describe("migrasi 0003: nama dan rumah satu sumber", () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({ workers: [{ name: "m3", modules: true, script: "export default {}", d1Databases: { DB: "m3" } }] }),
  );
  afterAll(() => mf.dispose());

  it("nama warga pindah ke akun petugas, jadwal menunjuk akun atau rumah", async () => {
    const d1 = await mf.getD1Database("DB");
    for (const file of ["0000_init.sql", "0001_link_petugas.sql", "0002_jadwal_warna_permintaan.sql"]) await applyMigration(d1, file);
    await d1.batch(
      [
        `insert into houses (id, block, number, owner_name, token, status, created_at) values
          (1, 'AD', '5', 'Wawan', 'T1', 'active', 0), (2, 'AF', '7', 'Wawan', 'T2', 'active', 0),
          (3, 'AF', '18', 'Pak Agus Situmorang', 'T3', 'active', 0), (4, 'AC', '10', NULL, 'T4', 'active', 0),
          (5, 'AA', '8', NULL, 'T5', 'active', 0), (6, 'AB', '1', NULL, 'T6', 'active', 0), (7, 'AD', '3', 'Yusuf', 'T7', 'active', 0)`,
        `insert into users (id, name, pin_hash, role, active, failed_attempts, session_version, house_id, created_at) values
          (1, 'Wawan (AD-5)', 'x', 'petugas', 1, 0, 1, 1, 0), (2, 'Wawan (AF-7)', 'x', 'petugas', 1, 0, 1, 2, 0),
          (3, 'Situmorang', 'x', 'petugas', 1, 0, 1, 3, 0), (4, 'Apri', 'x', 'admin', 1, 0, 1, 4, 0),
          (5, 'Yusuf Maulana', 'x', 'petugas', 1, 0, 1, 7, 0)`,
        `insert into ronda_schedule (day_of_week, position, name, block, number, user_id, color) values
          (6, 0, 'Wawan', 'AD', '5', 1, 'green'), (5, 0, 'Wawan', 'AF', '7', 2, NULL), (5, 1, 'Situmorang', 'A', '18', 3, NULL),
          (0, 0, 'Apri', 'C', '1', 4, 'yellow'), (3, 0, NULL, 'AA', '8', NULL, 'orange'), (3, 1, 'Kantor', 'AB', '1', NULL, NULL),
          (4, 0, 'Tamu', 'ZZ', '9', NULL, NULL), (4, 1, NULL, 'AD', '3', NULL, NULL)`,
      ].map((sql) => d1.prepare(sql)),
    );
    await applyMigration(d1, "0003_satu_sumber.sql");

    type Row = Record<string, unknown>;
    const users = await d1.prepare("select id, name from users order by id").all();
    expect((users.results as Row[]).map((u) => u.name)).toEqual(["Wawan", "Wawan", "Pak Agus Situmorang", "Apri", "Yusuf Maulana"]);
    // Rumah yang dihuni akun tidak menyimpan nama sendiri; nama di jadwal untuk rumah tanpa akun jadi nama KK.
    const houses = await d1.prepare("select id, owner_name from houses order by id").all();
    expect((houses.results as Row[]).map((h) => h.owner_name)).toEqual([null, null, null, null, null, "Kantor", null]);
    const slots = await d1
      .prepare("select day_of_week as day, user_id, house_id, name, color from ronda_schedule order by day_of_week, position")
      .all();
    expect((slots.results as Row[]).map((s) => [s.day, s.user_id, s.house_id, s.name, s.color])).toEqual([
      [0, 4, null, null, "yellow"],
      [3, null, 5, null, "orange"],
      [3, null, 6, null, null],
      [4, null, null, "Tamu (ZZ-9)", null],
      // Baris rumah AD-3 yang dihuni Yusuf jadi baris akunnya.
      [4, 5, null, null, null],
      [5, 2, null, null, null],
      [5, 3, null, null, null],
      [6, 1, null, null, "green"],
    ]);
    // Satu baris tanpa akun, rumah, atau nama ditolak.
    await expect(d1.prepare("insert into ronda_schedule (day_of_week, position) values (1, 0)").run()).rejects.toThrow(/CHECK/);
  });
});
