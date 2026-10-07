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
  it("lembar per rumah: nominal tiap malam, jumlah, dan total", () => {
    const [perHouse, perNight] = buildRecapSheets(recap, "Natura");
    expect(perHouse.sheet).toBe("Per rumah");
    const values = (row: (typeof perHouse.data)[number]) => row.map((c) => c?.value ?? null);
    expect(values(perHouse.data[2])).toEqual(["Blok", "No", "Nama KK", "Status", "5", "6", "Ada", "Kosong", "Tidak dicek", "Bulanan (Rp)", "Mingguan (Rp)", "Total (Rp)"]);
    expect(values(perHouse.data[3])).toEqual(["AD", "3", "Yusuf", "Dihuni", 500, 1000, 2, 0, 0, 0, 0, 1500]);
    expect(values(perHouse.data[4])).toEqual(["AD", "5", "=Wawan", "Dihuni", "kosong", null, 0, 1, 1, 0, 0, 0]);
    // Rumah mudik tidak dihitung "tidak dicek".
    expect(values(perHouse.data[5])).toEqual(["AF", "7", "", "Mudik", null, null, 0, 0, 0, 0, 0, 0]);
    expect(values(perHouse.data.at(-1)!)).toEqual(["Total", null, null, null, 500, 1000, 2, 1, 1, 0, 0, 1500]);
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
    expect(sheets[0].data[3].slice(-3).map((c) => c?.value)).toEqual([500, 0, 500]);
    expect(sheets[2].data[3].map((c) => c?.value)).toEqual(["AD-3", "Yusuf", "Bulanan", "2026-10-07", "2026-11-01", "2026-11-30", 15000]);
    const files = unzipSync(new Uint8Array(await writeXlsxFile(sheets).toBuffer()));
    expect(files["xl/worksheets/sheet3.xml"]).toBeDefined();
  });
});
