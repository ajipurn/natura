import { beforeAll, describe, expect, it } from "vitest";
import { applyEntries } from "@/server/collections";
import type { Db } from "@/server/db";
import { getCollectionsForDate, getMonthRecap, listPatrols } from "@/server/queries";
import { houses, rondaSchedule, users } from "@/server/schema";
import type { SessionUser } from "@/server/auth";
import type { EntryInput } from "@/lib/types";
import { createTestEnv } from "./helpers/d1";

let db: Db;
let petugas: SessionUser;
let houseA1: number;
let houseA2: number;

// 22:00 WIB, 4 Oktober 2026
const NOW = new Date("2026-10-04T15:00:00Z");

function entry(partial: Partial<EntryInput> & { houseId: number }): EntryInput {
  return {
    clientId: crypto.randomUUID(),
    status: "filled",
    amount: 500,
    method: "scan",
    recordedAt: NOW.toISOString(),
    ...partial,
  };
}

beforeAll(async () => {
  ({ db } = await createTestEnv());
  const [u] = await db
    .insert(users)
    .values({ name: "Budi", pinHash: "x", role: "petugas" })
    .returning();
  petugas = { id: u.id, name: u.name, role: u.role };
  // Budi jaga setiap malam, supaya tes di bawah hanya soal cara menyimpan catatan.
  await db.insert(rondaSchedule).values([0, 1, 2, 3, 4, 5, 6].map((day) => ({ dayOfWeek: day, position: 0, userId: u.id })));
  const rows = await db
    .insert(houses)
    .values([
      { block: "A", number: "1", token: "TOKENA1AAA" },
      { block: "A", number: "2", token: "TOKENA2AAA" },
    ])
    .returning();
  houseA1 = rows[0].id;
  houseA2 = rows[1].id;
});

describe("applyEntries", () => {
  it("menyimpan catatan dan menolak data yang tidak masuk akal", async () => {
    const results = await applyEntries(
      db,
      petugas,
      [
        entry({ houseId: houseA1 }),
        entry({ houseId: 9999 }),
        entry({ houseId: houseA2, recordedAt: "2026-10-04T16:00:00Z" }), // 1 jam di masa depan
        entry({ houseId: houseA2, recordedAt: "2026-09-20T15:00:00Z" }), // terlalu lama
      ],
      NOW,
    );
    expect(results.map((r) => r.ok)).toEqual([true, false, false, false]);
    expect(results[0]).toMatchObject({ ok: true, date: "2026-10-04" });

    const saved = await getCollectionsForDate(db, "2026-10-04");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ houseId: houseA1, status: "filled", amount: 500, collectorName: "Budi" });
  });

  it("catatan terbaru menang, sinkron telat tidak menimpa koreksi", async () => {
    const later = new Date(NOW.getTime() + 60_000).toISOString();
    await applyEntries(db, petugas, [entry({ houseId: houseA1, status: "empty", recordedAt: later })], NOW);
    // Catatan lama (dari HP lain yang baru online) datang belakangan.
    await applyEntries(db, petugas, [entry({ houseId: houseA1, status: "filled", amount: 1000 })], NOW);

    const saved = await getCollectionsForDate(db, "2026-10-04");
    expect(saved[0]).toMatchObject({ status: "empty", amount: 0 });
  });

  it("menghapus catatan dengan status none", async () => {
    const later = new Date(NOW.getTime() + 120_000).toISOString();
    await applyEntries(db, petugas, [entry({ houseId: houseA1, status: "none", recordedAt: later })], NOW);
    expect(await getCollectionsForDate(db, "2026-10-04")).toHaveLength(0);
  });

  it("catatan lewat tengah malam masuk malam sebelumnya", async () => {
    const afterMidnight = "2026-10-04T18:30:00Z"; // 01:30 WIB tanggal 5
    const results = await applyEntries(
      db,
      petugas,
      [entry({ houseId: houseA2, recordedAt: afterMidnight })],
      new Date("2026-10-04T19:00:00Z"),
    );
    expect(results[0]).toMatchObject({ ok: true, date: "2026-10-04" });
  });

  it("muncul di daftar riwayat dan rekap bulanan", async () => {
    const patrols = await listPatrols(db);
    expect(patrols[0]).toMatchObject({ date: "2026-10-04", filled: 1, empty: 0, total: 500, collectors: "Budi" });

    const recap = await getMonthRecap(db, "2026-10");
    expect(recap.dates).toEqual(["2026-10-04"]);
    expect(recap.cells[`${houseA2}:2026-10-04`]).toEqual({ status: "filled", amount: 500 });
    expect(recap.cells[`${houseA1}:2026-10-04`]).toBeUndefined();
  });
});

describe("applyEntries dengan banyak catatan sekaligus", () => {
  it("antrean panjang dari HP (lebih dari batas 100 parameter D1) tersimpan semua", async () => {
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const [row] = await db
        .insert(houses)
        .values({ block: "Z", number: String(i + 1), token: `TOKENZ${String(i).padStart(4, "0")}` })
        .returning({ id: houses.id });
      rows.push(row);
    }
    const at = "2026-10-03T14:00:00Z"; // 21:00 WIB tanggal 3
    const entries = rows.flatMap((r, i) => [
      entry({ houseId: r.id, status: "empty", recordedAt: at }),
      // Dikoreksi semenit kemudian di HP yang sama.
      entry({ houseId: r.id, status: i % 2 ? "filled" : "none", amount: 700, recordedAt: "2026-10-03T14:01:00Z" }),
    ]);
    const results = await applyEntries(db, petugas, entries, NOW);
    expect(results.every((r) => r.ok)).toBe(true);
    const saved = await getCollectionsForDate(db, "2026-10-03");
    expect(saved).toHaveLength(20);
    expect(saved.every((c) => c.status === "filled" && c.amount === 700)).toBe(true);
  });
});

describe("hanya petugas yang jaga malam itu yang bisa mencatat", () => {
  it("di luar malam jaganya ditolak, admin juga", async () => {
    const [rina, admin] = await db
      .insert(users)
      .values([
        { name: "Rina", pinHash: "x", role: "petugas" },
        { name: "Pak RT", pinHash: "x", role: "admin" },
      ])
      .returning();
    // Rina hanya jaga Sabtu (malam Minggu).
    await db.insert(rondaSchedule).values({ dayOfWeek: 6, position: 1, userId: rina.id });
    const asRina = { id: rina.id, name: rina.name, role: rina.role };
    const saturday = "2026-10-03T14:30:00Z"; // 21:30 WIB Sabtu 3 Oktober
    const results = await applyEntries(
      db,
      asRina,
      [entry({ houseId: houseA1, recordedAt: saturday }), entry({ houseId: houseA2 })],
      NOW,
    );
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(results[1]).toMatchObject({ error: "Bukan jadwal jagamu: Ahad (malam Senin)." });
    const sunday = await getCollectionsForDate(db, "2026-10-04");
    expect(sunday.find((c) => c.houseId === houseA2)?.collectorName).not.toBe("Rina");

    const asAdmin = { id: admin.id, name: admin.name, role: admin.role };
    expect((await applyEntries(db, asAdmin, [entry({ houseId: houseA2 })], NOW))[0].ok).toBe(false);
    // Begitu dijadwalkan malam itu, admin bisa mencatat.
    await db.insert(rondaSchedule).values({ dayOfWeek: 0, position: 1, userId: admin.id });
    expect((await applyEntries(db, asAdmin, [entry({ houseId: houseA2 })], NOW))[0].ok).toBe(true);
  });
});
