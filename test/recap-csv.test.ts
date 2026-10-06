import { describe, expect, it } from "vitest";
import { buildRecapCsv, buildSheetsCsv } from "@/lib/recap-csv";
import type { MonthRecap } from "@/lib/types";

const recap: MonthRecap = {
  houses: [
    { id: 1, block: "AD", number: "3", ownerName: "Yusuf", token: "T1", status: "active" },
    { id: 2, block: "AD", number: "5", ownerName: "=Wawan", token: "T2", status: "active" },
    { id: 3, block: "AF", number: "7", ownerName: null, token: "T3", status: "vacant" },
  ],
  dates: ["2026-10-05", "2026-10-06"],
  cells: {
    "1:2026-10-05": { status: "filled", amount: 500 },
    "1:2026-10-06": { status: "filled", amount: 1000 },
    "2:2026-10-05": { status: "empty", amount: 0 },
  },
};

describe("rekap bulanan sebagai CSV", () => {
  it("unduhan: dengan nama KK, nama tidak jadi rumus", () => {
    expect(buildRecapCsv(recap).split("\r\n")).toEqual([
      "Blok,No,Nama KK,2026-10-05,2026-10-06,Jumlah Ada,Total (Rp)",
      "AD,3,Yusuf,500,1000,2,1500",
      "AD,5,'=Wawan,K,,0,0",
      "AF,7,,,,0,0",
      ",,Total,500,1000,,1500",
    ]);
  });

  it("link Google Sheets: posisi tetap, tanpa nama warga", () => {
    expect(buildSheetsCsv(recap, "2026-10", "Natura").split("\r\n")).toEqual([
      "Rekap jimpitan Natura · Oktober 2026",
      "Blok,No,Status,Total (Rp),Ada,Kosong,Tidak dicek,5,6",
      "Total,,,1500,2,1,1,500,1000",
      "AD,3,Dihuni,1500,2,0,0,500,1000",
      "AD,5,Dihuni,0,0,1,1,kosong,",
      // Rumah mudik tidak dihitung "tidak dicek".
      "AF,7,Mudik,0,0,0,0,,",
    ]);
  });

  it("link Google Sheets di awal bulan, sebelum ada malam ronda", () => {
    expect(buildSheetsCsv({ ...recap, dates: [], cells: {} }, "2026-11", "Natura").split("\r\n").slice(0, 3)).toEqual([
      "Rekap jimpitan Natura · November 2026",
      "Blok,No,Status,Total (Rp),Ada,Kosong,Tidak dicek",
      "Total,,,0,0,0,0",
    ]);
  });
});
