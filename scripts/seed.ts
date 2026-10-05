/**
 * Seed awal Cluster Natura: rumah dari denah, akun petugas untuk setiap nama di jadwal (PIN acak,
 * tinggal di rumah yang tertulis di jadwal), dan jadwal ronda (scripts/jadwal-natura.tsv) beserta
 * warna selnya (scripts/jadwal-natura-warna.tsv).
 *
 *   bun run seed           → D1 lokal (untuk `bun run dev`)
 *   bun run seed:remote    → D1 di Cloudflare
 *
 * Jalankan setelah admin pertama dibuat di /admin/setup. Aman diulang: rumah, akun, dan jadwal yang
 * sudah ada tidak ditimpa. `--jadwal` mengganti jadwal yang ada dengan isi file jadwal.
 * Argumen lain diteruskan ke wrangler, mis. `bun run seed --persist-to <folder>`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { houseLabel } from "../src/lib/houses";
import { newToken } from "../src/lib/qr";
import { randomPin } from "../src/lib/random-pin";
import type { GuardColor } from "../src/lib/guard-color";
import {
  analyzeSchedule,
  dayLabel,
  matchGuardAccount,
  parseSchedule,
  resolveEntry,
  type GuardAccount,
  type ScheduleEntry,
  type SlotSource,
} from "../src/lib/schedule";
import { houseKey } from "../src/lib/site-plan";
import { hashPin } from "../src/server/pin";
import { SITE_PLAN } from "../src/site-plan";

const ROOT = path.resolve(import.meta.dirname, "..");
const remote = process.argv.includes("--remote");
const replaceSchedule = process.argv.includes("--jadwal");
const wranglerArgs = [
  remote ? "--remote" : "--local",
  ...process.argv.slice(2).filter((a) => a !== "--remote" && a !== "--jadwal"),
];
const pinFile = path.join(ROOT, remote ? "petugas-pin-remote.csv" : "petugas-pin.csv");
const MAX_NAME = 40;
const COLOR_CODES: Record<string, GuardColor> = { H: "green", K: "yellow", O: "orange" };

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

/** Jalankan banyak perintah SQL sekaligus lewat file (lebih cepat dari satu per satu). */
function run(statements: string[]) {
  if (statements.length === 0) return;
  const dir = mkdtempSync(path.join(tmpdir(), "jimpitan-seed-"));
  const file = path.join(dir, "seed.sql");
  writeFileSync(file, statements.join("\n") + "\n");
  try {
    wrangler(["--file", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`Seed ke D1 ${remote ? "Cloudflare (remote)" : "lokal"}…`);

  if (query<{ id: number }>("select id from users limit 1").length === 0) {
    console.error("✗ Belum ada admin. Buka /admin/setup dulu untuk membuat admin pertama, lalu jalankan seed lagi.");
    process.exit(1);
  }
  const [{ n: scheduled }] = query<{ n: number }>("select count(*) as n from ronda_schedule");
  const writeSchedule = scheduled === 0 || replaceSchedule;
  const now = Date.now();

  // 1. Rumah: semua kavling berpenghuni di denah yang belum terdaftar.
  const existingHouses = new Set(query<{ block: string; number: string }>("select block, number from houses").map(houseKey));
  const newLots = SITE_PLAN.lots.filter((lot) => lot.built && lot.number && !existingHouses.has(houseKey({ block: lot.block, number: lot.number })));
  run(
    newLots.map(
      (lot) =>
        `insert into houses (block, number, owner_name, token, status, created_at) values (${str(lot.block)}, ${str(lot.number!)}, NULL, ${str(newToken())}, 'active', ${now}) on conflict do nothing;`,
    ),
  );
  const houses = query<{ id: number; block: string; number: string; owner_name: string | null }>(
    "select id, block, number, owner_name from houses",
  );
  const byKey = new Map(houses.map((h) => [houseKey(h), h]));

  const { entries, warnings } = parseSchedule(readFileSync(path.join(ROOT, "scripts/jadwal-natura.tsv"), "utf8"));
  if (warnings.length) console.warn(warnings.join("\n"));

  // 2. Akun petugas untuk setiap nama di jadwal, tinggal di rumahnya. Nama kembar dibedakan rumahnya.
  //    Rumah yang dihuni petugas memakai nama akunnya, jadi nama KK rumah itu dikosongkan.
  const accounts = query<GuardAccount>("select id, name, house_id as houseId from users");
  const created: { name: string; house: string; night: string; pin: string }[] = [];
  const skipped: string[] = [];
  const accountSql: string[] = [];
  for (const e of entries) {
    if (!e.name) continue;
    const houseId = byKey.get(houseKey(e))?.id ?? null;
    const name = e.name.slice(0, MAX_NAME);
    // Sudah ada kalau rumahnya sudah punya akun sebelum seed ini (mungkin namanya sudah diubah admin),
    // namanya cocok, atau ada akun yang namanya memuat nama ini (mis. "Pak Agus Situmorang" untuk "Situmorang").
    if (
      (houseId !== null && accounts.some((a) => a.houseId === houseId && a.id > 0)) ||
      matchGuardAccount(accounts, name, houseId) ||
      accounts.some((a) => (a.houseId === null || houseId === null) && ` ${a.name.toLowerCase()} `.includes(` ${name.toLowerCase()} `))
    ) {
      if (!created.some((c) => c.name === name && c.house === houseLabel(e))) skipped.push(name);
      continue;
    }
    // Akun sementara (id negatif) supaya nama yang sama di rumah yang sama tidak dibuat dua kali.
    accounts.push({ id: -accounts.length - 1, name, houseId });
    const pin = randomPin();
    created.push({ name, house: houseLabel(e), night: dayLabel(e.day), pin });
    accountSql.push(
      `insert into users (name, pin_hash, role, active, failed_attempts, session_version, house_id, created_at) values (${str(name)}, ${str(await hashPin(pin))}, 'petugas', 1, 0, 1, ${houseId ?? "NULL"}, ${now});`,
    );
  }
  accountSql.push("update houses set owner_name = null where id in (select house_id from users where house_id is not null);");
  run(accountSql);
  const residents = query<GuardAccount>("select id, name, house_id as houseId from users");

  // 3. Jadwal ronda dari file, kalau jadwal masih kosong (atau diminta diganti dengan --jadwal).
  //    Baris jadwal menunjuk akun petugas atau rumah, beserta warna selnya.
  const colorGrid = readFileSync(path.join(ROOT, "scripts/jadwal-natura-warna.tsv"), "utf8")
    .split("\n")
    .map((line) => line.split("\t"));
  const colorOf = (e: ScheduleEntry) => COLOR_CODES[colorGrid[e.cell?.row ?? -1]?.[e.cell?.col ?? -1]?.trim()] ?? null;
  const resolved = entries.map((e) => ({ e, slot: resolveEntry(e, byKey, residents), color: colorOf(e) }));
  const scheduleSql: string[] = [];
  if (writeSchedule) {
    scheduleSql.push("delete from ronda_schedule;");
    for (const { e, slot, color } of resolved) {
      scheduleSql.push(
        `insert into ronda_schedule (day_of_week, position, user_id, house_id, name, color) values (${e.day}, ${e.position}, ${slot.userId ?? "NULL"}, ${slot.houseId ?? "NULL"}, ${str(slot.name)}, ${str(color)});`,
      );
    }
  } else {
    // Jadwal sudah ada (mungkin sudah diatur di dashboard): hanya isi warna yang masih kosong.
    // Petugas/rumah yang muncul sekali dicocokkan tanpa malamnya, jadi tetap kena walau sudah dipindah malam.
    const source = (slot: SlotSource) =>
      slot.userId ? `user_id = ${slot.userId}` : slot.houseId ? `house_id = ${slot.houseId}` : `name = ${str(slot.name)}`;
    const perSource = new Map<string, number>();
    for (const { slot } of resolved) perSource.set(source(slot), (perSource.get(source(slot)) ?? 0) + 1);
    for (const { e, slot, color } of resolved) {
      if (!color) continue;
      const sameDay = perSource.get(source(slot))! > 1 ? ` and day_of_week = ${e.day}` : "";
      scheduleSql.push(`update ronda_schedule set color = ${str(color)} where ${source(slot)}${sameDay} and color is null;`);
    }
  }

  // 4. Nama KK dari jadwal untuk rumah tanpa akun yang nama KK-nya masih kosong.
  const { unknown, conflicting, uniqueNames } = analyzeSchedule(entries, new Set(byKey.keys()));
  const withAccount = new Set(residents.map((u) => u.houseId));
  let namesFilled = 0;
  for (const [key, name] of uniqueNames) {
    const house = byKey.get(key);
    if (!house || house.owner_name !== null || withAccount.has(house.id)) continue;
    scheduleSql.push(`update houses set owner_name = ${str(name)} where id = ${house.id} and owner_name is null;`);
    namesFilled++;
  }
  run(scheduleSql);

  console.log(`\n✓ ${newLots.length} rumah baru dari denah (${houses.length} rumah terdaftar).`);
  console.log(
    writeSchedule
      ? `✓ ${entries.length} baris jadwal untuk ${new Set(entries.map((e) => e.day)).size} malam.`
      : `• Jadwal sudah ada (${scheduled} baris), tidak diubah; warna yang masih kosong diisi. Pakai --jadwal untuk menggantinya dengan isi file.`,
  );
  console.log(`✓ ${namesFilled} nama KK diisi.`);
  if (unknown.length) console.log(`  Belum ada di data rumah (tidak ada di denah): ${unknown.join(", ")}`);
  if (conflicting.length) console.log(`  Nama ganda, nama KK tidak diisi: ${conflicting.join("; ")}`);
  console.log(`✓ ${created.length} akun petugas baru.`);
  if (skipped.length) console.log(`  Sudah ada, PIN tidak diubah: ${[...new Set(skipped)].join(", ")}`);

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
