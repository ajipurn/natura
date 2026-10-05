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
