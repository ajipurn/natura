import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { listSchedule, saveSchedule } from "@/server/schedule";
import { houses } from "@/server/schema";
import type { ScheduleEntry } from "@/lib/schedule";
import { createTestEnv } from "./helpers/d1";

let db: Db;
beforeAll(async () => {
  ({ db } = await createTestEnv());
});

const entries: ScheduleEntry[] = [
  { day: 0, position: 0, name: "Yusuf", block: "AD", number: "3" },
  { day: 1, position: 0, name: "Bu Ros", block: "AB", number: "8" },
  { day: 1, position: 1, name: "Kantor", block: "AB", number: "1" },
  { day: 5, position: 0, name: "Eko", block: "AB", number: "1" },
  { day: 2, position: 0, name: "Apri", block: "C", number: "1" },
  { day: 2, position: 1, name: null, block: "AD", number: "3" },
];

describe("saveSchedule", () => {
  it("menyimpan jadwal dan mengisi nama KK yang masih kosong", async () => {
    await db.insert(houses).values([
      { block: "AD", number: "3", token: "SCHEDAD3XX" },
      { block: "AB", number: "8", token: "SCHEDAB8XX", ownerName: "Lama" },
      { block: "AB", number: "1", token: "SCHEDAB1XX" },
    ]);

    const summary = await saveSchedule(db, entries, { fillNames: true, overwriteNames: false });
    expect(summary).toEqual({
      saved: 6,
      days: 4,
      namesFilled: 1,
      unknown: ["C-1"],
      conflicting: ["AB-1 (Kantor, Eko)"],
    });

    const rows = await listSchedule(db);
    expect(rows.map((r) => [r.day, r.position, r.name, `${r.block}-${r.number}`, r.houseId !== null])).toEqual([
      [0, 0, "Yusuf", "AD-3", true],
      [1, 0, "Bu Ros", "AB-8", true],
      [1, 1, "Kantor", "AB-1", true],
      [2, 0, "Apri", "C-1", false],
      [2, 1, null, "AD-3", true],
      [5, 0, "Eko", "AB-1", true],
    ]);
    const byKey = Object.fromEntries(rows.map((r) => [`${r.block}-${r.number}`, r.ownerName]));
    expect(byKey).toMatchObject({ "AD-3": "Yusuf", "AB-8": "Lama", "AB-1": null });
  });

  it("impor ulang mengganti jadwal; opsi timpa mengganti nama yang sudah ada", async () => {
    const summary = await saveSchedule(db, entries.slice(0, 2), { fillNames: true, overwriteNames: true });
    expect(summary.saved).toBe(2);
    expect(summary.namesFilled).toBe(1); // AB-8: Lama → Bu Ros; AD-3 sudah "Yusuf"
    const rows = await listSchedule(db);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.block === "AB")?.ownerName).toBe("Bu Ros");
  });

  it("tanpa isi nama, data rumah tidak berubah", async () => {
    const summary = await saveSchedule(db, [{ day: 3, position: 0, name: "Baru", block: "AD", number: "3" }], {
      fillNames: false,
      overwriteNames: true,
    });
    expect(summary.namesFilled).toBe(0);
    expect((await listSchedule(db))[0].ownerName).toBe("Yusuf");
  });
});
