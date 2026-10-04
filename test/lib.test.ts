import { describe, expect, it } from "vitest";
import { addDays, daysInMonth, formatDateLong, isIsoDate, rondaDate, shiftMonth } from "@/lib/dates";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { compareHouses, groupByBlock, parseNumberList } from "@/lib/houses";
import { houseUrl, newToken, parseQrToken } from "@/lib/qr";
import { buildRecapText, summarize } from "@/lib/recap";

describe("rondaDate", () => {
  it("menghitung lewat tengah malam sebagai malam sebelumnya", () => {
    // 01:30 WIB tanggal 5 Oktober = 18:30 UTC tanggal 4
    expect(rondaDate(new Date("2026-10-04T18:30:00Z"))).toBe("2026-10-04");
    // 11:59 WIB tanggal 5 masih malam tanggal 4
    expect(rondaDate(new Date("2026-10-05T04:59:00Z"))).toBe("2026-10-04");
    // 12:00 WIB tanggal 5 sudah masuk tanggal 5
    expect(rondaDate(new Date("2026-10-05T05:00:00Z"))).toBe("2026-10-05");
    // 21:00 WIB tanggal 4
    expect(rondaDate(new Date("2026-10-04T14:00:00Z"))).toBe("2026-10-04");
  });
});

describe("tanggal", () => {
  it("memformat dan menghitung tanggal", () => {
    expect(formatDateLong("2026-10-04")).toBe("Minggu, 4 Oktober 2026");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(daysInMonth("2028-02")).toHaveLength(29);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("formatRupiah", () => {
  it("memakai titik sebagai pemisah ribuan", () => {
    expect(formatRupiah(23500)).toBe("Rp 23.500");
    expect(formatRupiah(0)).toBe("Rp 0");
  });
});

describe("rumah", () => {
  it("mengurutkan nomor secara alami", () => {
    const sorted = [
      { block: "B", number: "1" },
      { block: "A", number: "10" },
      { block: "A", number: "2" },
    ].sort(compareHouses);
    expect(sorted.map((h) => `${h.block}${h.number}`)).toEqual(["A2", "A10", "B1"]);
  });

  it("mengelompokkan per blok", () => {
    const groups = groupByBlock([
      { block: "B", number: "1" },
      { block: "A", number: "1" },
    ]);
    expect(groups.map(([block]) => block)).toEqual(["A", "B"]);
  });

  it("mengurai daftar nomor", () => {
    expect(parseNumberList("1-3, 5, 7a")).toEqual(["1", "2", "3", "5", "7A"]);
    expect(parseNumberList("3-1")).toBeNull();
    expect(parseNumberList("1-1000")).toBeNull();
    expect(parseNumberList("A-12")).toBeNull();
    expect(parseNumberList("")).toBeNull();
  });
});

describe("QR", () => {
  it("membuat kode acak 10 karakter", () => {
    const token = newToken();
    expect(token).toMatch(/^[2-9A-HJKMNP-Z]{10}$/);
    expect(newToken()).not.toBe(token);
  });

  it("membaca kode dari URL atau teks mentah", () => {
    expect(parseQrToken(houseUrl("https://jimpitan.example/", "ABCD234567"))).toBe("ABCD234567");
    expect(parseQrToken("https://domain-lama.example/r/abcd234567/")).toBe("ABCD234567");
    expect(parseQrToken("  ABCD234567 ")).toBe("ABCD234567");
    expect(parseQrToken("https://example.com/lain/ABCD234567")).toBeNull();
    expect(parseQrToken("A-12")).toBeNull();
  });
});

describe("rekap", () => {
  const houses = [
    { id: 1, block: "A", number: "1", status: "active" as const },
    { id: 2, block: "A", number: "2", status: "active" as const },
    { id: 3, block: "A", number: "3", status: "active" as const },
    { id: 4, block: "B", number: "1", status: "vacant" as const },
  ];
  const collections = [
    { houseId: 1, status: "filled" as const, amount: 500, collectorName: "Budi" },
    { houseId: 2, status: "empty" as const, amount: 0, collectorName: "Andi" },
    { houseId: 4, status: "empty" as const, amount: 0, collectorName: "Andi" },
  ];

  it("tidak menghitung rumah kosong/mudik sebagai bolong", () => {
    const s = summarize(houses, collections);
    expect(s.expected).toBe(3);
    expect(s.checked).toBe(2);
    expect(s.empty.map((h) => h.id)).toEqual([2]);
    expect(s.unchecked.map((h) => h.id)).toEqual([3]);
    expect(s.total).toBe(500);
    expect(s.collectors).toEqual(["Andi", "Budi"]);
  });

  it("membuat teks untuk WhatsApp", () => {
    const text = buildRecapText({ communityName: "RT 05", date: "2026-10-04", houses, collections });
    expect(text).toBe(
      [
        "*Jimpitan RT 05*",
        "Minggu, 4 Oktober 2026",
        "",
        "✅ Ada: 1 rumah",
        "⭕ Kosong: 1 rumah (A-2)",
        "⬜ Belum dicek: 1 rumah (A-3)",
        "🏠 Rumah kosong/mudik: 1 rumah",
        "💰 Total: Rp 500",
        "👮 Petugas: Andi, Budi",
      ].join("\n"),
    );
  });
});

describe("formatAmountShort", () => {
  it("meringkas nominal untuk kotak kecil", () => {
    expect(formatAmountShort(500)).toBe("500");
    expect(formatAmountShort(1000)).toBe("1rb");
    expect(formatAmountShort(2500)).toBe("2,5rb");
  });
});
