import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { buildRecapSheets } from "@/lib/recap-xlsx";
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

describe("rekap bulanan sebagai xlsx", () => {
  it.each(["monthly", "weekly"] as const)("Excel memberi label %s dan mengecualikan periode dari rumah yang belum dicek", async (cadence) => {
    const data: MonthRecap = {
      ...recap, houses: [recap.houses[0]], cells: {},
      paymentCadences: { 1: [cadence] },
      paymentPeriods: [{ houseId: 1, planId: 1, cadence, start: recap.dates[0], end: recap.dates[1], expected: 1000, paid: 0, remaining: 1000, status: "unpaid" }],
    };
    const sheets = buildRecapSheets(data, "Natura");
    const label = cadence === "monthly" ? "Bulanan" : "Mingguan";
    expect(sheets[0].data[3][3]?.value).toBe(label);
    const nightLabel = cadence === "monthly" ? "Belum" : null;
    expect(sheets[0].data[3].slice(4).map((c) => c?.value ?? null)).toEqual([nightLabel, nightLabel, 0, 0, 0, 0, 0, 0, 0]);
    expect(sheets[1].data.slice(3, 5).map((row) => row[3]?.value)).toEqual([0, 0]);
    const files = unzipSync(new Uint8Array(await writeXlsxFile(sheets).toBuffer()));
    expect(strFromU8(files["xl/sharedStrings.xml"])).toContain(`<t>${label}</t>`);
  });

  it("Excel hanya mengecualikan malam selama periode berlaku dari hitungan tidak dicek", () => {
    const data: MonthRecap = {
      ...recap, houses: [recap.houses[0]], cells: {},
      paymentCadences: { 1: ["daily", "monthly"] },
      paymentPeriods: [{ houseId: 1, planId: 1, cadence: "monthly", start: recap.dates[1], end: "2026-10-31", expected: 13000, paid: 0, remaining: 13000, status: "unpaid" }],
    };
    const [perHouse, perNight] = buildRecapSheets(data, "Natura");
    expect(perHouse.data[3][3]?.value).toBe("Harian → Bulanan");
    expect(perHouse.data[3][4]).toBeNull();
    expect(perHouse.data[3][5]).toMatchObject({ value: "Belum", backgroundColor: "#fef9c3" });
    expect(perHouse.data[3][8]?.value).toBe(1);
    expect(perNight.data.slice(3, 5).map((row) => row[3]?.value)).toEqual([1, 0]);
  });

  it.each([0, 500, 1000])("blok bulanan berubah dari kuning ke hijau hanya setelah lunas (dibayar %i)", async (paid) => {
    const settled = paid === 1000;
    const data: MonthRecap = {
      ...recap, houses: [recap.houses[0]], cells: { "1:2026-10-05": { status: "empty", amount: 0 } },
      paymentCadences: { 1: ["monthly"] },
      paymentPeriods: [{ houseId: 1, planId: 1, cadence: "monthly", start: recap.dates[0], end: recap.dates[1], expected: 1000, paid, remaining: 1000 - paid, status: settled ? "paid" : "unpaid" }],
      paymentCells: Object.fromEntries(recap.dates.map((date) => [`1:${date}`, { amount: paid / 2, monthlyAmount: paid / 2, weeklyAmount: 0, paid: settled }])),
    };
    const sheets = buildRecapSheets(data, "Natura");
    const expected = { value: settled ? "Lunas" : "Belum", backgroundColor: settled ? "#dcfce7" : "#fef9c3", textColor: settled ? "#15803d" : "#854d0e" };
    for (const cell of sheets[0].data[3].slice(4, 6)) expect(cell).toMatchObject(expected);
    expect(sheets[0].data[3].slice(-4).map((cell) => cell?.value)).toEqual([0, 0, paid, paid]);
    expect(sheets[1].data.slice(3, 5).map((row) => row[4]?.value)).toEqual([0, 0]);
    const files = unzipSync(new Uint8Array(await writeXlsxFile(sheets).toBuffer()));
    expect(strFromU8(files["xl/sharedStrings.xml"])).toContain(`<t>${expected.value}</t>`);
    expect(strFromU8(files["xl/styles.xml"])).toContain(expected.backgroundColor.slice(1).toUpperCase());
  });

  it("lembar per rumah: nominal tiap malam, jumlah, dan total", () => {
    const [perHouse, perNight] = buildRecapSheets(recap, "Natura");
    expect(perHouse.sheet).toBe("Per rumah");
    const values = (row: (typeof perHouse.data)[number]) => row.map((c) => c?.value ?? null);
    expect(values(perHouse.data[2])).toEqual(["Blok", "No", "Nama KK", "Status", "5", "6", "Ada", "Kosong", "Tidak dicek", "Harian (Rp)", "Mingguan (Rp)", "Bulanan (Rp)", "Total (Rp)"]);
    expect(values(perHouse.data[3])).toEqual(["AD", "3", "Yusuf", "Dihuni", 500, 1000, 2, 0, 0, 1500, 0, 0, 1500]);
    expect(values(perHouse.data[4])).toEqual(["AD", "5", "=Wawan", "Dihuni", "kosong", null, 0, 1, 1, 0, 0, 0, 0]);
    // Rumah mudik tidak dihitung "tidak dicek".
    expect(values(perHouse.data[5])).toEqual(["AF", "7", "", "Mudik", null, null, 0, 0, 0, 0, 0, 0, 0]);
    expect(values(perHouse.data.at(-1)!)).toEqual(["Total", null, null, null, 500, 1000, 2, 1, 1, 1500, 0, 0, 1500]);
    expect(perNight.data.slice(3).map(values)).toEqual([
      ["Senin, 5 Oktober 2026", 1, 1, 0, 500],
      ["Selasa, 6 Oktober 2026", 1, 0, 1, 1000],
      ["Total hasil ronda", null, null, null, 1500],
    ]);
  });

  it("menghasilkan file xlsx yang bisa dibuka (tiga lembar, nama tidak jadi rumus)", async () => {
    const buffer = await writeXlsxFile(buildRecapSheets(recap, "Natura")).toBuffer();
    const files = unzipSync(new Uint8Array(buffer));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    expect(workbook).toContain('name="Per rumah"');
    expect(workbook).toContain('name="Per malam"');
    expect(workbook).toContain('name="Pembayaran periode"');
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).not.toContain("<f>");
    expect(strFromU8(files["xl/sharedStrings.xml"] ?? new Uint8Array())).toContain("=Wawan");
  });
  it("rekap dengan pembayaran bulanan saja tetap punya judul bulan dan rincian transaksi", async () => {
    const data: MonthRecap = { month: "2026-11", houses: [recap.houses[0]], dates: [], cells: {}, paymentCells: { "1:2026-11-01": { amount: 500, monthlyAmount: 500, weeklyAmount: 0, paid: true } }, periodPayments: [{ id: 1, houseId: 1, receivedDate: "2026-10-07", periodStart: "2026-11-01", periodEnd: "2026-11-30", cadence: "monthly", amount: 15000 }] };
    const sheets = buildRecapSheets(data, "Natura");
    expect(sheets[0].data[0][0]?.value).toContain("November 2026");
    expect(sheets[0].data[3].slice(-4).map((c) => c?.value)).toEqual([0, 0, 500, 500]);
    expect(sheets[2].data[3].map((c) => c?.value)).toEqual(["AD-3", "Yusuf", "Bulanan", "2026-10-07", "2026-11-01", "2026-11-30", 15000]);
    const files = unzipSync(new Uint8Array(await writeXlsxFile(sheets).toBuffer()));
    expect(files["xl/worksheets/sheet3.xml"]).toBeDefined();
  });

  it("tiga sumber uang tetap terpisah saat rumah berganti cara bayar", () => {
    const mixed = { ...recap, paymentCells: { "1:2026-10-05": { amount: 4000, monthlyAmount: 3000, weeklyAmount: 1000, paid: true } } };
    const [sheet] = buildRecapSheets(mixed, "Natura");
    expect(sheet.data[3].slice(-4).map((c) => c?.value)).toEqual([1500, 1000, 3000, 5500]);
    expect(sheet.data[0][0]?.columnSpan).toBe(sheet.columns.length);
  });
});
