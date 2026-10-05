/**
 * Seed awal Cluster Natura: rumah dari denah, jadwal ronda (scripts/jadwal-natura.tsv), nama KK,
 * dan akun petugas untuk setiap nama di jadwal (PIN acak).
 *
 *   bun run seed           → D1 lokal (untuk `bun run dev`)
 *   bun run seed:remote    → D1 di Cloudflare
 *
 * Jalankan setelah admin pertama dibuat di /admin/setup. Aman diulang: rumah, nama KK, dan akun
 * yang sudah ada tidak ditimpa; hanya jadwal yang diganti dengan isi file jadwal.
 * Argumen lain diteruskan ke wrangler, mis. `bun run seed --persist-to <folder>`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { houseLabel } from "../src/lib/houses";
import { newToken } from "../src/lib/qr";
import { analyzeSchedule, dayLabel, parseSchedule } from "../src/lib/schedule";
import { houseKey } from "../src/lib/site-plan";
import { hashPin } from "../src/server/pin";
import { SITE_PLAN } from "../src/site-plan";

const ROOT = path.resolve(import.meta.dirname, "..");
const remote = process.argv.includes("--remote");
const wranglerArgs = [remote ? "--remote" : "--local", ...process.argv.slice(2).filter((a) => a !== "--remote")];
const pinFile = path.join(ROOT, remote ? "petugas-pin-remote.csv" : "petugas-pin.csv");
const MAX_NAME = 40;

function wrangler(args: string[]): string {
  return execFileSync(path.join(ROOT, "node_modules/.bin/wrangler"), ["d1", "execute", "DB", ...wranglerArgs, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
}

function query<T>(sql: string): T[] {
  const [result] = JSON.parse(wrangler(["--json", "--command", sql])) as { results: T[] }[];
  return result.results;
}

function str(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

/** PIN 4 angka acak, bukan yang mudah ditebak (1111, 1234, 4321). */
function randomPin(): string {
  for (;;) {
    const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10_000).padStart(4, "0");
    const digits = [...pin].map(Number);
    const steps = new Set(digits.slice(1).map((d, i) => d - digits[i]));
    if (steps.size > 1 || ![0, 1, -1].includes([...steps][0])) return pin;
  }
}

async function main() {
  console.log(`Seed ke D1 ${remote ? "Cloudflare (remote)" : "lokal"}…`);

  const users = query<{ name: string }>("select name from users");
  if (users.length === 0) {
    console.error("✗ Belum ada admin. Buka /admin/setup dulu untuk membuat admin pertama, lalu jalankan seed lagi.");
    process.exit(1);
  }
  const houses = query<{ block: string; number: string; owner_name: string | null }>(
    "select block, number, owner_name from houses",
  );

  const now = Date.now();
  const sql: string[] = [];

  // 1. Rumah: semua kavling berpenghuni di denah yang belum terdaftar.
  const known = new Map(houses.map((h) => [houseKey(h), h.owner_name]));
  const newLots = SITE_PLAN.lots.filter((lot) => lot.built && lot.number && !known.has(houseKey({ block: lot.block, number: lot.number })));
  for (const lot of newLots) {
    sql.push(
      `insert into houses (block, number, owner_name, token, status, created_at) values (${str(lot.block)}, ${str(lot.number)}, NULL, ${str(newToken())}, 'active', ${now}) on conflict do nothing;`,
    );
    known.set(houseKey({ block: lot.block, number: lot.number! }), null);
  }

  // 2. Jadwal ronda: diganti seluruhnya dengan isi file.
  const { entries, warnings } = parseSchedule(readFileSync(path.join(ROOT, "scripts/jadwal-natura.tsv"), "utf8"));
  if (warnings.length) console.warn(warnings.join("\n"));
  sql.push("delete from ronda_schedule;");
  for (const e of entries) {
    sql.push(
      `insert into ronda_schedule (day_of_week, position, name, block, number) values (${e.day}, ${e.position}, ${str(e.name)}, ${str(e.block)}, ${str(e.number)});`,
    );
  }

  // 3. Nama KK dari jadwal, hanya untuk rumah yang nama KK-nya masih kosong.
  const { unknown, conflicting, uniqueNames } = analyzeSchedule(entries, new Set(known.keys()));
  let namesFilled = 0;
  for (const [key, name] of uniqueNames) {
    if (known.get(key) !== null) continue;
    const [block, number] = key.split("-");
    sql.push(`update houses set owner_name = ${str(name)} where block = ${str(block)} and number = ${str(number)} and owner_name is null;`);
    namesFilled++;
  }

  // 4. Akun petugas untuk setiap nama di jadwal. Nama kembar dibedakan dengan rumahnya.
  const named = entries.filter((e): e is typeof e & { name: string } => e.name !== null);
  const count = new Map<string, Set<string>>();
  for (const e of named) count.set(e.name.toLowerCase(), (count.get(e.name.toLowerCase()) ?? new Set()).add(houseLabel(e)));
  const existing = new Set(users.map((u) => u.name.toLowerCase()));
  const created: { name: string; house: string; night: string; pin: string }[] = [];
  const skipped: string[] = [];
  for (const e of named) {
    const twin = (count.get(e.name.toLowerCase())?.size ?? 0) > 1;
    const name = (twin ? `${e.name} (${houseLabel(e)})` : e.name).slice(0, MAX_NAME);
    if (existing.has(name.toLowerCase())) {
      if (!created.some((c) => c.name === name)) skipped.push(name);
      continue;
    }
    existing.add(name.toLowerCase());
    const pin = randomPin();
    created.push({ name, house: houseLabel(e), night: dayLabel(e.day), pin });
    sql.push(
      `insert into users (name, pin_hash, role, active, failed_attempts, session_version, created_at) values (${str(name)}, ${str(await hashPin(pin))}, 'petugas', 1, 0, 1, ${now}) on conflict do nothing;`,
    );
  }

  const dir = mkdtempSync(path.join(tmpdir(), "jimpitan-seed-"));
  const file = path.join(dir, "seed.sql");
  writeFileSync(file, sql.join("\n") + "\n");
  try {
    wrangler(["--file", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n✓ ${newLots.length} rumah baru dari denah (${known.size} rumah terdaftar).`);
  console.log(`✓ ${entries.length} baris jadwal untuk ${new Set(entries.map((e) => e.day)).size} malam.`);
  console.log(`✓ ${namesFilled} nama KK diisi.`);
  if (unknown.length) console.log(`  Belum ada di data rumah (tidak ada di denah): ${unknown.join(", ")}`);
  if (conflicting.length) console.log(`  Nama ganda, nama KK tidak diisi: ${conflicting.join("; ")}`);
  console.log(`✓ ${created.length} akun petugas baru.`);
  if (skipped.length) console.log(`  Sudah ada, PIN tidak diubah: ${skipped.join(", ")}`);

  if (created.length) {
    const csv = ["Nama,Rumah,Jaga,PIN", ...created.map((c) => [c.name, c.house, c.night, c.pin].map((v) => `"${v}"`).join(","))];
    writeFileSync(pinFile, csv.join("\n") + "\n");
    console.log(`\nPIN petugas baru disimpan di ${path.relative(ROOT, pinFile)} (tidak ikut di-commit).`);
    console.log("Bagikan PIN-nya lewat chat pribadi, lalu hapus file itu. Petugas bisa ganti PIN di menu Akun.");
  }
}

main().catch((err) => {
  console.error("✗ Seed gagal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
