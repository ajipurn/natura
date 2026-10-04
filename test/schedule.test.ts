import { describe, expect, it } from "vitest";
import { dayLabel, parseDayHeading, parseSchedule, scheduleDay, titleCaseName } from "@/lib/schedule";

const short = (r: ReturnType<typeof parseSchedule>) =>
  r.entries.map((e) => `${e.day}:${e.position}:${e.name ?? "-"}:${e.block}-${e.number}`);

describe("hari jadwal", () => {
  it("membaca judul hari, termasuk 'malam X'", () => {
    expect(parseDayHeading("AHAD (MALAM SENIN)")).toBe(0);
    expect(parseDayHeading("AHAD\n(MALAM SENIN)")).toBe(0);
    expect(parseDayHeading("Minggu")).toBe(0);
    expect(parseDayHeading("JUM'AT")).toBe(5);
    expect(parseDayHeading("Malam Minggu")).toBe(6);
    expect(parseDayHeading("malam senin")).toBe(0);
    expect(parseDayHeading("1")).toBeNull();
    expect(parseDayHeading("YUSUF")).toBeNull();
  });

  it("menghitung hari dari tanggal ronda", () => {
    expect(scheduleDay("2026-10-04")).toBe(0); // Minggu malam = Ahad (malam Senin)
    expect(scheduleDay("2026-10-10")).toBe(6);
    expect(dayLabel(0)).toBe("Ahad (malam Senin)");
    expect(dayLabel(6)).toBe("Sabtu (malam Minggu)");
  });

  it("merapikan huruf besar nama", () => {
    expect(titleCaseName("BU ROS")).toBe("Bu Ros");
    expect(titleCaseName("ARIF/WARIS")).toBe("Arif/Waris");
    expect(titleCaseName("UMI ARIFAH")).toBe("Umi Arifah");
  });
});

describe("parseSchedule", () => {
  it("membaca tabel yang disalin dari spreadsheet", () => {
    const tsv = [
      "JADWAL RONDA JIMPITAN CLUSTER NATURA",
      '\t"AHAD\n(MALAM SENIN)"\tSENIN (MALAM SELASA)\tSABTU (MALAM MINGGU)',
      "1\tYUSUF (AD-3)\tNINO (AB-3)\tTAFIB (AA-7)",
      "2\tWIDI (AA-12)\tSAHRUL (AF-19)\tWAWAN (AD-5)",
      "8\tWIDODO (A-5)\tYOGA (AE-12)\t(AA-17)",
      "11\t(AF-6)\t(AF-11)\t",
    ].join("\n");
    expect(short(parseSchedule(tsv))).toEqual([
      "0:0:Yusuf:AD-3",
      "1:0:Nino:AB-3",
      "6:0:Tafib:AA-7",
      "0:1:Widi:AA-12",
      "1:1:Sahrul:AF-19",
      "6:1:Wawan:AD-5",
      "0:2:Widodo:A-5",
      "1:2:Yoga:AE-12",
      "6:2:-:AA-17",
      "0:3:-:AF-6",
      "1:3:-:AF-11",
    ]);
  });

  it("membaca teks per hari", () => {
    const text = [
      "Ahad (malam Senin)",
      "1. Yusuf (AD-3)",
      "- Arif/Waris (AE 2)",
      "Kamis (AB-2)",
      "",
      "Senin: Nino (AB-3), Bu Ros (AB-8); (AB-1)",
      "Catatan: bawa senter",
    ].join("\n");
    const result = parseSchedule(text);
    expect(short(result)).toEqual([
      "0:0:Yusuf:AD-3",
      "0:1:Arif/Waris:AE-2",
      "0:2:Kamis:AB-2",
      "1:0:Nino:AB-3",
      "1:1:Bu Ros:AB-8",
      "1:2:-:AB-1",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("memberi peringatan untuk baris sebelum judul hari", () => {
    const result = parseSchedule("Yusuf (AD-3)\nSenin\nNino (AB-3)");
    expect(short(result)).toEqual(["1:0:Nino:AB-3"]);
    expect(result.warnings).toHaveLength(1);
  });
});
