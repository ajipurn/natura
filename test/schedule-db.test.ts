import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { listSchedule, saveSchedule } from "@/server/schedule";
import { houses, users } from "@/server/schema";
import { slotHouseLabel, type ScheduleEntry } from "@/lib/schedule";
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
      linked: 0,
      housesLinked: 0,
      unknown: ["C-1"],
      conflicting: ["AB-1 (Kantor, Eko)"],
    });

    // Tanpa akun: baris menunjuk rumahnya (namanya dari data rumah); kode rumah tak terdaftar jadi nama.
    const rows = await listSchedule(db);
    expect(rows.map((r) => [r.day, r.position, r.name, slotHouseLabel(r), r.ownerName])).toEqual([
      [0, 0, null, "AD-3", "Yusuf"],
      [1, 0, null, "AB-8", "Lama"],
      [1, 1, null, "AB-1", null],
      [2, 0, "Apri (C-1)", "", null],
      [2, 1, null, "AD-3", "Yusuf"],
      [5, 0, null, "AB-1", null],
    ]);
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

describe("satu sumber: akun petugas dan rumah", () => {
  it("baris rumah yang dihuni petugas jadi baris petugas itu; nama kembar dibedakan rumahnya", async () => {
    const [ad5, af7] = await db
      .insert(houses)
      .values([
        { block: "AD", number: "5", token: "SCHEDAD5XX" },
        { block: "AF", number: "7", token: "SCHEDAF7XX" },
      ])
      .returning({ id: houses.id });
    await db.insert(users).values([
      { name: "Wawan", pinHash: "x", houseId: ad5.id },
      { name: "Wawan", pinHash: "x", houseId: af7.id },
      { name: "Nino", pinHash: "x" },
    ]);
    const summary = await saveSchedule(
      db,
      [
        { day: 6, position: 0, name: "Wawan", block: "AF", number: "7" },
        { day: 6, position: 1, name: null, block: "AD", number: "5" },
        { day: 1, position: 0, name: "Nino", block: "AB", number: "8" },
      ],
      { fillNames: true, overwriteNames: true },
    );
    expect(summary).toMatchObject({ linked: 3, housesLinked: 1, namesFilled: 0 });

    const rows = await listSchedule(db);
    expect(rows.map((r) => [r.day, r.name, slotHouseLabel(r), r.userId !== null])).toEqual([
      [1, "Nino", "AB-8", true],
      [6, "Wawan", "AF-7", true],
      [6, "Wawan", "AD-5", true],
    ]);
    // Nino belum punya rumah: diisi AB-8 dari jadwal, dan nama KK lama rumah itu diganti nama akunnya.
    expect(rows.map((r) => r.ownerName)).toEqual(["Nino", "Wawan", "Wawan"]);
  });
});
