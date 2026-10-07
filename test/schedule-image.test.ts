import { describe, expect, it } from "vitest";
import { scheduleImageRows, wrapImageText } from "@/lib/schedule-image";
import type { ScheduleDTO } from "@/lib/types";

const slot = (overrides: Partial<ScheduleDTO>): ScheduleDTO => ({
  id: 1,
  day: 0,
  position: 0,
  name: "Yusuf",
  block: "AD",
  number: "3",
  houseId: null,
  ownerName: null,
  userId: 1,
  userActive: true,
  color: "green",
  ...overrides,
});

describe("gambar jadwal ronda", () => {
  it("selalu Ahad–Sabtu, urut sesuai posisi, dan malam yang lebih pendek diberi sel kosong", () => {
    const schedule = [
      slot({ id: 3, day: 6, name: "Tafib", block: "AA", number: "7" }),
      slot({ id: 2, position: 4, name: "Aji", number: "8", color: "yellow" }),
      slot({}),
    ];
    const before = structuredClone(schedule);
    const rows = scheduleImageRows(schedule);
    expect(rows).toEqual([
      [{ text: "YUSUF (AD-3)", color: "green" }, null, null, null, null, null, { text: "TAFIB (AA-7)", color: "green" }],
      [{ text: "AJI (AD-8)", color: "yellow" }, null, null, null, null, null, null],
    ]);
    expect(schedule).toEqual(before);
  });

  it("memakai nama akun atau pemilik terbaru, serta menyertakan rumah tanpa nama dan nama bebas", () => {
    const rows = scheduleImageRows([
      slot({ name: "Nama akun baru", ownerName: "Nama pemilik lama" }),
      slot({ id: 2, day: 1, name: null, ownerName: "Bu Ros", userId: null, houseId: 2, color: "orange" }),
      slot({ id: 3, day: 2, name: null, ownerName: null, userId: null, houseId: 3, block: "AB", number: "1", color: null }),
      slot({ id: 4, day: 3, name: "Satpam", block: "", number: "", houseId: null, userId: null }),
      slot({ id: 5, day: 4, name: "Apri (C-1)", block: "", number: "", houseId: null, userId: null }),
      slot({ id: 6, day: 5, name: "Petugas nonaktif", userActive: false, color: "blue" }),
    ]);
    expect(rows[0].map((cell) => cell?.text ?? "")).toEqual([
      "NAMA AKUN BARU (AD-3)", "BU ROS (AD-3)", "(AB-1)", "SATPAM", "APRI (C-1)", "PETUGAS NONAKTIF (AD-3)", "",
    ]);
    expect(rows[0][1]?.color).toBe("orange");
    expect(rows[0][2]?.color).toBeNull();
    expect(rows[0][5]?.color).toBe("blue");
    expect(scheduleImageRows([])).toEqual([]);
  });

  it("nama panjang dibungkus tanpa dipotong atau merusak karakter Unicode", () => {
    const measure = (text: string) => Array.from(text).length;
    expect(wrapImageText("  ARIF/WARIS   (AE-2) ", 10, measure)).toEqual(["ARIF/WARIS", "(AE-2)"]);
    expect(wrapImageText("ABCDEFGHIJKL (AD-3)", 6, measure)).toEqual(["ABCDEF", "GHIJKL", "(AD-3)"]);
    expect(wrapImageText("😀😀😀😀😀", 3, measure)).toEqual(["😀😀😀", "😀😀"]);
    expect(wrapImageText("", 10, measure)).toEqual([]);
  });
});
