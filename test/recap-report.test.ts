import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildRecapReport } from "@/lib/recap-report";
import { buildRecapDocx } from "@/lib/recap-report-docx";
import { buildRecapPdf } from "@/lib/recap-report-pdf";
import type { MonthRecap } from "@/lib/types";

const recap: MonthRecap = {
  month: "2026-10", houses: [
    { id: 2, block: "AF", number: "13", ownerName: "Akli & keluarga", token: "PRIVATE-TOKEN", status: "active" },
    { id: 1, block: "A", number: "5", ownerName: "Widodo", token: "ANOTHER-TOKEN", status: "active" },
    { id: 3, block: "AA", number: "7", ownerName: null, token: "T3", status: "vacant" },
  ], dates: ["2026-10-01", "2026-10-02"],
  cells: { "2:2026-10-01": { status: "filled", amount: 500 }, "2:2026-10-02": { status: "empty", amount: 0 } },
  paymentCadences: { 1: ["monthly"], 2: ["daily"], 3: ["daily"] },
  paymentCells: {
    "1:2026-10-01": { amount: 500, monthlyAmount: 500, weeklyAmount: 0, paid: true },
    "1:2026-10-02": { amount: 500, monthlyAmount: 500, weeklyAmount: 0, paid: true },
    "1:2026-10-31": { amount: 500, monthlyAmount: 500, weeklyAmount: 0, paid: true },
    "2:2026-10-02": { amount: 500, monthlyAmount: 0, weeklyAmount: 0, rapelAmount: 500, paid: true },
  }, paymentPeriods: [{ houseId: 1, planId: 1, cadence: "monthly", start: "2026-10-01", end: "2026-10-31", expected: 15500, paid: 1500, remaining: 14000, status: "unpaid" }],
  // Nominal receipt tidak boleh ikut dijumlahkan lagi, terlebih jika periode melintasi bulan.
  periodPayments: [{ id: 1, houseId: 1, receivedDate: "2026-09-30", periodStart: "2026-10-01", periodEnd: "2026-11-30", cadence: "monthly", amount: 30500 }],
};
const now = new Date("2026-10-10T18:15:00Z"); // Tanggal dibuat sudah 11 Oktober WIB.

describe("laporan bulanan jimpitan", () => {
  it("total sama dengan rekap, alokasi di luar malam ronda tetap masuk, receipt tidak dijumlahkan ulang", () => {
    const before = JSON.stringify(recap);
    const report = buildRecapReport(recap, "Natura", "2026-10", now);
    expect(report.metrics.find((m) => m.label === "Total jimpitan")?.value).toBe("Rp 2.500");
    expect(report.tables[0].rows).toEqual([["Hasil ronda", "Rp 500"], ["Pembayaran bulanan", "Rp 1.500"], ["Rapel harian", "Rp 500"]]);
    expect(report.tables[1].rows.map((r) => r[0])).toEqual(["A", "AA", "AF"]);
    expect(report.tables[2].total?.at(-1)).toBe("Rp 500");
    expect(report.tables[3].rows[0]).toEqual(["A-5\nWidodo", "Bulanan", "0", "0", "0", "Rp 1.500"]);
    expect(report.tables[3].rows[2]).toEqual(["AF-13\nAkli & keluarga", "Dihuni", "2", "0", "0", "Rp 1.000"]);
    expect(report.tables[4].rows[0].slice(2)).toEqual(["Rp 15.500", "Rp 1.500", "Rp 14.000"]);
    expect(report.generatedLabel).toBe("Dibuat Minggu, 11 Oktober 2026");
    expect(JSON.stringify(report)).not.toContain("PRIVATE-TOKEN");
    expect(JSON.stringify(recap)).toBe(before);
  });

  it("bulan tanpa ronda tetap melaporkan pembayaran periode dan tidak memberi hitungan kunjungan palsu", () => {
    const report = buildRecapReport({ ...recap, dates: [], cells: {} }, "Natura", "2026-10", now);
    expect(report.monthLabel).toBe("Oktober 2026");
    expect(report.metrics.find((m) => m.label === "Total jimpitan")?.value).toBe("Rp 2.000");
    expect(report.tables[2].rows).toEqual([]);
    expect(report.tables[3].rows[0][2]).toBe("0");
  });

  it("menolak data placeholder bulan sebelumnya", () => {
    expect(() => buildRecapReport(recap, "Natura", "2026-11", now)).toThrow("belum sesuai bulan");
  });

  it("DOCX berisi judul, tabel editable, header berulang, dan nominal yang sama", async () => {
    const blob = await buildRecapDocx(buildRecapReport(recap, "Natura", "2026-10", now));
    expect(blob.type).toContain("wordprocessingml.document");
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("Laporan bulanan jimpitan");
    expect(xml).toContain("Oktober 2026");
    expect(xml).toContain("Rp 2.500");
    expect(xml).toContain("Akli &amp; keluarga");
    expect(xml).toContain("w:tblHeader");
    expect(xml).toContain("w:pageBreakBefore");
    expect(xml).not.toContain("PRIVATE-TOKEN");
  });

  it("PDF menghasilkan file valid dan lebih dari satu halaman untuk laporan lengkap", async () => {
    const blob = buildRecapPdf(buildRecapReport(recap, "Natura", "2026-10", now));
    expect(blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = new TextDecoder().decode(bytes);
    expect(Number(pdf.match(/\/Count (\d+)/)?.[1])).toBeGreaterThan(1);
  });
});
