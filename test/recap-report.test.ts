import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildRecapPeriodReport, buildRecapReport } from "@/lib/recap-report";
import { mergeReportRecaps, reportMonths } from "@/lib/recap-report-period";
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
const image = { dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFElEQVR4nGPkL8v7z4AEmJA5WAUAXcEB+OGNog0AAAAASUVORK5CYII=", width: 4, height: 3 };

describe("laporan bulanan jimpitan", () => {
  it("rentang menggabungkan bulan, mempertahankan sumber angka, dan tidak menggandakan rumah, receipt, atau tagihan lintas bulan", () => {
    const shared = { houseId: 2, planId: 3, cadence: "weekly" as const, start: "2026-10-29", end: "2026-11-04", expected: 3500, paid: 1500, remaining: 2000, status: "unpaid" as const };
    const oct: MonthRecap = { ...recap, paymentPeriods: [...recap.paymentPeriods!, shared] };
    const nov: MonthRecap = { ...recap, month: "2026-11", dates: ["2026-11-01"], cells: { "2:2026-11-01": { status: "filled", amount: 500 } },
      paymentCells: { "1:2026-11-01": { amount: 500, monthlyAmount: 500, weeklyAmount: 0, paid: true } },
      paymentPeriods: [{ ...recap.paymentPeriods![0], start: "2026-11-01", end: "2026-11-30", expected: 15000, paid: 500, remaining: 14500 }, shared] };
    const before = JSON.stringify([oct, nov]);
    const merged = mergeReportRecaps([oct, nov], "2026-10", "2026-11");
    expect(merged.houses).toHaveLength(3); expect(merged.periodPayments).toHaveLength(1); expect(merged.paymentPeriods).toHaveLength(3);
    const report = buildRecapPeriodReport([oct, nov], "Natura", "2026-10", "2026-11", now);
    expect(report.title).toBe("Laporan jimpitan"); expect(report.monthLabel).toBe("Oktober - November 2026");
    expect(report.metrics.find((m) => m.label === "Total jimpitan")?.value).toBe("Rp 3.500");
    expect(report.metrics.find((m) => m.label === "Periode laporan")?.value).toBe("1 Oktober 2026 - 30 November 2026");
    expect(report.tables[3].rows).toHaveLength(3);
    expect(report.monthlySummary?.rows).toEqual([["Oktober 2026", "Rp 500", "Rp 1.500", "Rp 500", "Rp 2.500"], ["November 2026", "Rp 500", "Rp 500", "Rp 0", "Rp 1.000"]]);
    expect(report.monthlySummary?.total?.at(-1)).toBe("Rp 3.500"); expect(JSON.stringify([oct, nov])).toBe(before);
  });

  it("rentang lintas tahun menampilkan tahun pada tanggal rincian dan tetap menerima bulan kosong", () => {
    const dec: MonthRecap = { month: "2026-12", houses: recap.houses, dates: ["2026-12-31"], cells: { "2:2026-12-31": { status: "filled", amount: 500 } } };
    const jan: MonthRecap = { ...dec, month: "2027-01", dates: ["2027-01-01"], cells: { "2:2027-01-01": { status: "filled", amount: 500 } } };
    const report = buildRecapPeriodReport([dec, jan], "Natura", "2026-12", "2027-01", now);
    expect(report.monthLabel).toBe("Desember 2026 - Januari 2027"); expect(report.tables[2].rows[0][0]).toContain("2026"); expect(report.tables[2].rows[1][0]).toContain("2027");
    const empty = buildRecapPeriodReport([{ ...dec, dates: [], cells: {} }, { ...jan, dates: [], cells: {} }], "Natura", "2026-12", "2027-01", now);
    expect(empty.metrics.find((m) => m.label === "Malam ronda tercatat")?.value).toBe("0"); expect(empty.monthlySummary?.total?.at(-1)).toBe("Rp 0");
  });

  it("menolak rentang terbalik, tidak valid, terlalu panjang, atau data bulan yang belum lengkap", () => {
    expect(reportMonths("2026-12", "2027-02")).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(reportMonths("2026-01", "2027-12")).toHaveLength(24);
    expect(() => reportMonths("", "2026-10")).toThrow("Pilih bulan");
    expect(() => reportMonths("2026-13", "2026-13")).toThrow("Pilih bulan");
    expect(() => reportMonths("2026-11", "2026-10")).toThrow("Bulan akhir");
    expect(() => reportMonths("2026-01", "2028-01")).toThrow("maksimal 24");
    expect(() => buildRecapPeriodReport([recap], "Natura", "2026-10", "2026-11", now)).toThrow("belum lengkap");
    expect(() => buildRecapPeriodReport([recap, recap], "Natura", "2026-10", "2026-11", now)).toThrow("belum lengkap");
  });
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

  it("identitas paguyuban memakai default, dapat diganti atau dikosongkan, dan tanggal pengesahan memakai WIB", () => {
    const report = buildRecapReport(recap, "Cluster Natura", "2026-10", now);
    expect(report.letterhead).toMatchObject({ organization: "Paguyuban Cluster Natura", address: "Karangsari, Kebumen" });
    expect(report.approval).toMatchObject({ chairName: "April Bambang Sumariawan", dateLabel: "Kebumen, 11 Oktober 2026" });
    const changed = buildRecapReport(recap, "Paguyuban Natura", "2026-10", now, { address: "Alamat baru", chairName: "Ketua berikutnya", place: "", logo: image, stamp: image });
    expect(changed.letterhead.organization).toBe("Paguyuban Natura");
    expect(changed.letterhead.address).toBe("Alamat baru");
    expect(changed.approval).toMatchObject({ chairName: "Ketua berikutnya", dateLabel: "11 Oktober 2026", stamp: image });
    expect(buildRecapReport(recap, "Natura", "2026-10", now, { address: "", chairName: "" }).approval.chairName).toBe("");
  });

  it("DOCX berisi judul, tabel editable, header berulang, dan nominal yang sama", async () => {
    const blob = await buildRecapDocx(buildRecapReport(recap, "Natura", "2026-10", now, { logo: image, stamp: image }));
    expect(blob.type).toContain("wordprocessingml.document");
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("LAPORAN BULANAN JIMPITAN");
    expect(xml).toContain("Oktober 2026");
    expect(xml).toContain("Rp 2.500");
    expect(xml).toContain("Akli &amp; keluarga");
    expect(xml).toContain("w:tblHeader");
    expect(xml).toContain("w:pageBreakBefore");
    expect(xml).toContain("PAGUYUBAN NATURA");
    expect(xml).toContain("Karangsari, Kebumen");
    expect(xml).toContain("April Bambang Sumariawan");
    expect(xml).toContain("Ketua Paguyuban");
    expect(xml).toContain("Stempel resmi paguyuban");
    expect(xml).toContain("w:keepNext");
    expect(Object.keys(files).some((path) => path.startsWith("word/media/"))).toBe(true);
    expect(xml).not.toContain("PRIVATE-TOKEN");
  });

  it("PDF menghasilkan file valid dan lebih dari satu halaman untuk laporan lengkap", async () => {
    const blob = buildRecapPdf(buildRecapReport(recap, "Natura", "2026-10", now, { logo: image, stamp: image }));
    expect(blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = new TextDecoder().decode(bytes);
    expect(Number(pdf.match(/\/Count (\d+)/)?.[1])).toBeGreaterThan(1);
    expect(pdf).toContain("/Subtype /Image");
  });
});
