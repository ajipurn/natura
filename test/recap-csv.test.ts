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
  it.each([
    ["monthly", "Bulanan", "unpaid"],
    ["monthly", "Bulanan", "paid"],
    ["weekly", "Mingguan", "unpaid"],
    ["weekly", "Mingguan", "paid"],
  ] as const)("Sheets memberi keterangan %s (%s, %s) tanpa membuat uang harian atau hitungan tidak dicek", (cadence, label, status) => {
    const paid = status === "paid";
    const data: MonthRecap = {
      ...recap, houses: [recap.houses[0]], cells: {},
      paymentCadences: { 1: [cadence] },
      paymentPeriods: [{ houseId: 1, planId: 1, cadence, start: recap.dates[0], end: recap.dates[1], expected: 1000, paid: paid ? 1000 : 0, remaining: paid ? 0 : 1000, status }],
      paymentCells: paid ? Object.fromEntries(recap.dates.map((date) => [`1:${date}`, { amount: 500, monthlyAmount: cadence === "monthly" ? 500 : 0, weeklyAmount: cadence === "weekly" ? 500 : 0, paid: true }])) : {},
    };
    const lines = buildSheetsCsv(data, "2026-10", "Natura").split("\r\n");
    const nightLabel = cadence === "monthly" ? paid ? "Lunas" : "Belum" : "";
    expect(lines[3].split(",")).toEqual([
      "AD", "3", label, paid ? "1000" : "0", "0", "0", "0", nightLabel, nightLabel,
      paid && cadence === "monthly" ? "1000" : "0", paid && cadence === "weekly" ? "1000" : "0", "0",
    ]);
    expect(lines[2].split(",").slice(4, 9)).toEqual(["0", "0", "0", "0", "0"]);
    expect(lines[1].split(",")[7]).toBe("5"); // Tanggal tetap mulai kolom H.
    expect(lines.join("\n")).not.toContain("Yusuf");
  });

  it("Sheets mengikuti pergantian cara bayar dan tetap memberi status Mudik pada rumah kosong", () => {
    const data: MonthRecap = {
      ...recap, houses: [recap.houses[0], recap.houses[2]], cells: {},
      paymentCadences: { 1: ["daily", "monthly"], 3: ["monthly"] },
      paymentPeriods: [1, 3].map((houseId) => ({ houseId, planId: houseId, cadence: "monthly", start: recap.dates[1], end: "2026-10-31", expected: 13000, paid: 0, remaining: 13000, status: "unpaid" })),
    };
    const lines = buildSheetsCsv(data, "2026-10", "Natura").split("\r\n");
    expect(lines[3]).toBe("AD,3,Harian → Bulanan,0,0,0,1,,Belum,0,0,0");
    expect(lines[4]).toBe("AF,7,Mudik,0,0,0,0,,,0,0,0");
  });

  it.each(["unpaid", "paid"] as const)("seluruh blok bulanan %s mengikuti pelunasan periode tanpa menghilangkan nominal ronda asli", (status) => {
    const data: MonthRecap = {
      ...recap, houses: [recap.houses[0]],
      cells: { "1:2026-10-05": { status: "filled", amount: 500 }, "1:2026-10-06": { status: "empty", amount: 0 } },
      paymentCadences: { 1: ["monthly"] },
      paymentPeriods: [{ houseId: 1, planId: 1, cadence: "monthly", start: recap.dates[0], end: recap.dates[1], expected: 1000, paid: status === "paid" ? 1000 : 500, remaining: status === "paid" ? 0 : 500, status }],
      paymentCells: status === "paid" ? { "1:2026-10-06": { amount: 500, monthlyAmount: 500, weeklyAmount: 0, paid: true } } : {},
    };
    const lines = buildSheetsCsv(data, "2026-10", "Natura").split("\r\n");
    const label = status === "paid" ? "Lunas" : "Belum";
    expect(lines[3].split(",").slice(7)).toEqual([label, label, status === "paid" ? "500" : "0", "0", "500"]);
    expect(lines[3].split(",").slice(3, 5)).toEqual([status === "paid" ? "1000" : "500", "1"]);
    expect(lines[2].split(",").slice(7, 9)).toEqual(["500", "0"]);
  });

  it("unduhan: dengan nama KK, nama tidak jadi rumus", () => {
    expect(buildRecapCsv(recap).split("\r\n")).toEqual([
      "Blok,No,Nama KK,2026-10-05,2026-10-06,Jumlah Ada,Harian (Rp),Mingguan (Rp),Bulanan (Rp),Total (Rp)",
      "AD,3,Yusuf,500,1000,2,1500,0,0,1500",
      "AD,5,'=Wawan,K,,0,0,0,0,0",
      "AF,7,,,,0,0,0,0,0",
      ",,Total,500,1000,,1500,0,0,1500",
    ]);
  });

  it("link Google Sheets: posisi tetap, tanpa nama warga", () => {
    expect(buildSheetsCsv(recap, "2026-10", "Natura").split("\r\n")).toEqual([
      "Rekap jimpitan Natura · Oktober 2026",
      "Blok,No,Status,Total (Rp),Ada,Kosong,Tidak dicek,5,6,Bulanan (Rp),Mingguan (Rp),Harian (Rp)",
      "Total,,,1500,2,1,1,500,1000,0,0,1500",
      "AD,3,Dihuni,1500,2,0,0,500,1000,0,0,1500",
      "AD,5,Dihuni,0,0,1,1,kosong,,0,0,0",
      // Rumah mudik tidak dihitung "tidak dicek".
      "AF,7,Mudik,0,0,0,0,,,0,0,0",
    ]);
  });

  it("link Google Sheets di awal bulan, sebelum ada malam ronda", () => {
    expect(buildSheetsCsv({ ...recap, dates: [], cells: {} }, "2026-11", "Natura").split("\r\n").slice(0, 3)).toEqual([
      "Rekap jimpitan Natura · November 2026",
      "Blok,No,Status,Total (Rp),Ada,Kosong,Tidak dicek,Bulanan (Rp),Mingguan (Rp),Harian (Rp)",
      "Total,,,0,0,0,0,0,0,0",
    ]);
  });

  it("bulanan terpisah dari uang hasil ronda, termasuk bulan tanpa ronda", () => {
    const paid = { ...recap, dates: [], cells: {}, paymentCells: { "1:2026-10-01": { amount: 500, monthlyAmount: 500, weeklyAmount: 0, paid: true } } };
    expect(buildRecapCsv(paid).split("\r\n")[1]).toBe("AD,3,Yusuf,0,0,0,500,500");
    expect(buildSheetsCsv(paid, "2026-10", "Natura").split("\r\n")[3]).toBe("AD,3,Dihuni,500,0,0,0,500,0,0");
  });

  it("memisahkan tiga sumber nominal meskipun ada di rumah yang sama, tanpa menggandakan total", () => {
    const mixed = { ...recap, paymentCells: { "1:2026-10-05": { amount: 4000, monthlyAmount: 3000, weeklyAmount: 1000, paid: true } } };
    expect(buildRecapCsv(mixed).split("\r\n")[1]).toBe("AD,3,Yusuf,500,1000,2,1500,1000,3000,5500");
    expect(buildSheetsCsv(mixed, "2026-10", "Natura").split("\r\n")[3]).toBe("AD,3,Dihuni,5500,2,0,0,500,1000,3000,1000,1500");
  });
});
