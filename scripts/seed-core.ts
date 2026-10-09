/**
 * Isi seed awal Cluster Natura (dipakai `scripts/seed.ts` dan endpoint seed di server dev):
 * rumah dari denah, akun petugas untuk setiap nama di jadwal (PIN acak, tinggal di rumah yang
 * tertulis di jadwal), dan jadwal ronda (scripts/jadwal-natura.tsv) beserta warna selnya
 * (scripts/jadwal-natura-warna.tsv). Aman diulang: rumah, akun, dan jadwal yang sudah ada tidak ditimpa.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, count, eq, isNull, sql, type SQL } from "drizzle-orm";
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
import type { Db, Executor, Statement } from "../src/server/db";
import { hashPin } from "../src/server/pin";
import { houses, rondaSchedule, users } from "../src/server/schema";
import { SITE_PLAN } from "../src/site-plan";
import { houseName } from "../src/server/house-name";
import { adoptLegacyResidents } from "../src/server/residents";

const MAX_NAME = 40;
const COLOR_CODES: Record<string, GuardColor> = { H: "green", K: "yellow", O: "orange", B: "blue" };

export type SeedOptions = {
  /** Folder proyek (tempat scripts/ dan file PIN). */
  root: string;
  /** Nama database tujuan untuk ditampilkan. */
  label: string;
  /** Database Supabase: file PIN-nya dibedakan. */
  remote: boolean;
  /** `--jadwal`: ganti jadwal yang ada dengan isi file jadwal. */
  replaceSchedule: boolean;
  log: (line: string) => void;
};

export async function seed(db: Db, { root, label, remote, replaceSchedule, log }: SeedOptions) {
  const pinFile = path.join(root, remote ? "petugas-pin-remote.csv" : "petugas-pin.csv");
  log(`Seed ke ${label}…`);

  if ((await db.select({ id: users.id }).from(users).limit(1)).length === 0) {
    throw new Error("Belum ada admin. Buka /admin/setup dulu untuk membuat admin pertama, lalu jalankan seed lagi.");
  }
  const [{ n: scheduled }] = await db.select({ n: count() }).from(rondaSchedule);
  const writeSchedule = scheduled === 0 || replaceSchedule;

  // 1. Rumah: semua kavling berpenghuni di denah yang belum terdaftar.
  const existingHouses = new Set((await db.select({ block: houses.block, number: houses.number }).from(houses)).map(houseKey));
  const newLots = SITE_PLAN.lots.filter((lot) => lot.built && lot.number && !existingHouses.has(houseKey({ block: lot.block, number: lot.number })));
  if (newLots.length) {
    await db
      .insert(houses)
      .values(newLots.map((lot) => ({ block: lot.block, number: lot.number!, token: newToken() })))
      .onConflictDoNothing();
  }
  const houseRows = await db.select({ id: houses.id, block: houses.block, number: houses.number, ownerName: houseName }).from(houses);
  const byKey = new Map(houseRows.map((h) => [houseKey(h), h]));

  const { entries, warnings } = parseSchedule(readFileSync(path.join(root, "scripts/jadwal-natura.tsv"), "utf8"));
  if (warnings.length) log(warnings.join("\n"));

  // 2. Akun petugas untuk setiap nama di jadwal, tinggal di rumahnya. Nama kembar dibedakan rumahnya.
  //    Rumah yang dihuni petugas memakai nama akunnya, jadi nama KK rumah itu dikosongkan.
  const accounts: GuardAccount[] = await db.select({ id: users.id, name: users.name, houseId: users.houseId }).from(users);
  const created: { name: string; house: string; night: string; pin: string }[] = [];
  const skipped: string[] = [];
  const newUsers: (typeof users.$inferInsert)[] = [];
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
    newUsers.push({ name, pinHash: await hashPin(pin), role: "petugas", houseId });
  }
  await db.transaction(async (tx) => {
    if (newUsers.length) await tx.insert(users).values(newUsers);
    await tx
      .update(houses)
      .set({ ownerName: null })
      .where(sql`${houses.id} in (select ${users.houseId} from ${users} where ${users.houseId} is not null)`);
  });
  const residents: GuardAccount[] = await db.select({ id: users.id, name: users.name, houseId: users.houseId }).from(users);

  // 3. Jadwal ronda dari file, kalau jadwal masih kosong (atau diminta diganti dengan --jadwal).
  //    Baris jadwal menunjuk akun petugas atau rumah, beserta warna selnya.
  const colorGrid = readFileSync(path.join(root, "scripts/jadwal-natura-warna.tsv"), "utf8")
    .split("\n")
    .map((line) => line.split("\t"));
  const colorOf = (e: ScheduleEntry) => COLOR_CODES[colorGrid[e.cell?.row ?? -1]?.[e.cell?.col ?? -1]?.trim()] ?? null;
  const resolved = entries.map((e) => ({ e, slot: resolveEntry(e, byKey, residents), color: colorOf(e) }));
  const statements: ((tx: Executor) => Statement)[] = [];
  if (writeSchedule) {
    statements.push((tx) => tx.delete(rondaSchedule));
    if (resolved.length) {
      statements.push((tx) =>
        tx.insert(rondaSchedule).values(
          resolved.map(({ e, slot, color }) => ({ dayOfWeek: e.day, position: e.position, userId: slot.userId, houseId: slot.houseId, name: slot.name, color })),
        ),
      );
    }
  } else {
    // Jadwal sudah ada (mungkin sudah diatur di dashboard): hanya isi warna yang masih kosong.
    // Petugas/rumah yang muncul sekali dicocokkan tanpa malamnya, jadi tetap kena walau sudah dipindah malam.
    const sourceKey = (slot: SlotSource) => (slot.userId ? `u${slot.userId}` : slot.houseId ? `h${slot.houseId}` : `n${slot.name}`);
    const source = (slot: SlotSource): SQL =>
      slot.userId ? eq(rondaSchedule.userId, slot.userId) : slot.houseId ? eq(rondaSchedule.houseId, slot.houseId) : eq(rondaSchedule.name, slot.name ?? "");
    const perSource = new Map<string, number>();
    for (const { slot } of resolved) perSource.set(sourceKey(slot), (perSource.get(sourceKey(slot)) ?? 0) + 1);
    for (const { e, slot, color } of resolved) {
      if (!color) continue;
      const sameDay = perSource.get(sourceKey(slot))! > 1 ? eq(rondaSchedule.dayOfWeek, e.day) : undefined;
      statements.push((tx) => tx.update(rondaSchedule).set({ color }).where(and(source(slot), sameDay, isNull(rondaSchedule.color))));
    }
  }

  // 4. Nama KK dari jadwal untuk rumah tanpa akun yang nama KK-nya masih kosong.
  const { unknown, conflicting, uniqueNames } = analyzeSchedule(entries, new Set(byKey.keys()));
  const withAccount = new Set(residents.map((u) => u.houseId));
  let namesFilled = 0;
  for (const [key, name] of uniqueNames) {
    const house = byKey.get(key);
    if (!house || house.ownerName !== null || withAccount.has(house.id)) continue;
    statements.push((tx) => tx.update(houses).set({ ownerName: name }).where(and(eq(houses.id, house.id), isNull(houses.ownerName))));
    namesFilled++;
  }
  await db.transaction(async (tx) => {
    for (const statement of statements) await statement(tx);
    await adoptLegacyResidents(tx);
  });

  log(`\n✓ ${newLots.length} rumah baru dari denah (${houseRows.length} rumah terdaftar).`);
  log(
    writeSchedule
      ? `✓ ${entries.length} baris jadwal untuk ${new Set(entries.map((e) => e.day)).size} malam.`
      : `• Jadwal sudah ada (${scheduled} baris), tidak diubah; warna yang masih kosong diisi. Pakai --jadwal untuk menggantinya dengan isi file.`,
  );
  log(`✓ ${namesFilled} nama KK diisi.`);
  if (unknown.length) log(`  Belum ada di data rumah (tidak ada di denah): ${unknown.join(", ")}`);
  if (conflicting.length) log(`  Nama ganda, nama KK tidak diisi: ${conflicting.join("; ")}`);
  log(`✓ ${created.length} akun petugas baru.`);
  if (skipped.length) log(`  Sudah ada, PIN tidak diubah: ${[...new Set(skipped)].join(", ")}`);

  if (created.length) {
    const csv = ["Nama,Rumah,Jaga,PIN", ...created.map((c) => [c.name, c.house, c.night, c.pin].map((v) => `"${v}"`).join(","))];
    writeFileSync(pinFile, csv.join("\n") + "\n");
    log(`\nPIN petugas baru disimpan di ${path.relative(root, pinFile)} (tidak ikut di-commit).`);
    log("Bagikan PIN-nya lewat chat pribadi, lalu hapus file itu. Petugas bisa ganti PIN di menu Akun.");
  }
}
