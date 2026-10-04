import { beforeAll, describe, expect, it } from "vitest";
import { applyEntries } from "@/server/collections";
import { getDb } from "@/server/db";
import { getCollectionsForDate, getMonthRecap, listPatrols } from "@/server/queries";
import { houses, users } from "@/server/schema";
import type { SessionUser } from "@/server/auth";
import type { EntryInput } from "@/lib/types";

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
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({ name: "Budi", pinHash: "x", role: "petugas" })
    .returning();
  petugas = { id: u.id, name: u.name, role: u.role };
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

    const saved = await getCollectionsForDate("2026-10-04");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ houseId: houseA1, status: "filled", amount: 500, collectorName: "Budi" });
  });

  it("catatan terbaru menang, sinkron telat tidak menimpa koreksi", async () => {
    const later = new Date(NOW.getTime() + 60_000).toISOString();
    await applyEntries(petugas, [entry({ houseId: houseA1, status: "empty", recordedAt: later })], NOW);
    // Catatan lama (dari HP lain yang baru online) datang belakangan.
    await applyEntries(petugas, [entry({ houseId: houseA1, status: "filled", amount: 1000 })], NOW);

    const saved = await getCollectionsForDate("2026-10-04");
    expect(saved[0]).toMatchObject({ status: "empty", amount: 0 });
  });

  it("menghapus catatan dengan status none", async () => {
    const later = new Date(NOW.getTime() + 120_000).toISOString();
    await applyEntries(petugas, [entry({ houseId: houseA1, status: "none", recordedAt: later })], NOW);
    expect(await getCollectionsForDate("2026-10-04")).toHaveLength(0);
  });

  it("catatan lewat tengah malam masuk malam sebelumnya", async () => {
    const afterMidnight = "2026-10-04T18:30:00Z"; // 01:30 WIB tanggal 5
    const results = await applyEntries(
      petugas,
      [entry({ houseId: houseA2, recordedAt: afterMidnight })],
      new Date("2026-10-04T19:00:00Z"),
    );
    expect(results[0]).toMatchObject({ ok: true, date: "2026-10-04" });
  });

  it("muncul di daftar riwayat dan rekap bulanan", async () => {
    const patrols = await listPatrols();
    expect(patrols[0]).toMatchObject({ date: "2026-10-04", filled: 1, empty: 0, total: 500, collectors: "Budi" });

    const recap = await getMonthRecap("2026-10");
    expect(recap.dates).toEqual(["2026-10-04"]);
    expect(recap.cells[`${houseA2}:2026-10-04`]).toEqual({ status: "filled", amount: 500 });
    expect(recap.cells[`${houseA1}:2026-10-04`]).toBeUndefined();
  });
});
