import { describe, expect, it } from "vitest";
import { applyKeysByDay, canSwapSlots, keysByDay, moveSlot, sameSchedule, shiftSlot, swapSlots, toDraft, toSlots, type DraftSlot } from "@/apps/admin/jadwal/draft";
import type { ScheduleDTO } from "@/lib/types";

const slot = (id: number, day: number, position: number, name: string, userId: number | null = null): ScheduleDTO => ({
  id,
  day,
  position,
  name,
  block: "A",
  number: String(id),
  houseId: id,
  ownerName: null,
  userId,
  userActive: userId ? true : null,
  color: id === 1 ? "green" : null,
});

const schedule = [slot(1, 0, 0, "Yusuf", 10), slot(2, 0, 1, "Widi"), slot(3, 1, 0, "Nino"), slot(4, 2, 0, "Tehe")];
const names = (draft: DraftSlot[], day: number) => draft.filter((s) => s.day === day).map((s) => s.name);

describe("draf jadwal", () => {
  it("pindah malam: ke akhir, atau sebelum baris tertentu", () => {
    const draft = toDraft(schedule);
    expect(names(moveSlot(draft, "slot-1", 1), 1)).toEqual(["Nino", "Yusuf"]);
    expect(names(moveSlot(draft, "slot-4", 0, "slot-2"), 0)).toEqual(["Yusuf", "Tehe", "Widi"]);
    // Malam yang kosong di tengah tetap urut.
    const moved = moveSlot(draft, "slot-2", 5);
    expect(names(moved, 5)).toEqual(["Widi"]);
    expect(toSlots(moved).map((s) => s.day)).toEqual([0, 1, 2, 5]);
  });

  it("drag and drop: urutan per malam, juga malam yang kosong", () => {
    const draft = toDraft(schedule);
    const groups = keysByDay(draft);
    expect(groups).toEqual({ 0: ["slot-1", "slot-2"], 1: ["slot-3"], 2: ["slot-4"], 3: [], 4: [], 5: [], 6: [] });
    // Tanpa perubahan: sama dengan yang tersimpan.
    expect(sameSchedule(applyKeysByDay(draft, groups), draft)).toBe(true);
    // Widi ke malam kosong (5), Tehe ke depan malam 1.
    const moved = applyKeysByDay(draft, { ...groups, 0: ["slot-1"], 2: [], 1: ["slot-4", "slot-3"], 5: ["slot-2"] });
    expect(names(moved, 0)).toEqual(["Yusuf"]);
    expect(names(moved, 1)).toEqual(["Tehe", "Nino"]);
    expect(names(moved, 5)).toEqual(["Widi"]);
    expect(toSlots(moved).map((s) => s.day)).toEqual([0, 1, 1, 5]);
  });

  it("naik/turun hanya di malam yang sama", () => {
    const draft = toDraft(schedule);
    expect(names(shiftSlot(draft, "slot-2", -1), 0)).toEqual(["Widi", "Yusuf"]);
    expect(shiftSlot(draft, "slot-3", -1)).toBe(draft);
  });

  it("yang disimpan hanya rujukan akun, rumah, atau nama; tanpa perubahan = sama", () => {
    const withName = [...schedule, { ...slot(5, 3, 0, "Satpam"), houseId: null, block: "", number: "" }];
    const draft = toDraft(withName);
    const slots = toSlots(draft);
    expect(slots[0]).toEqual({ day: 0, residentId: null, userId: 10, houseId: null, name: null, color: "green" });
    expect(slots[1]).toEqual({ day: 0, residentId: null, userId: null, houseId: 2, name: null, color: null });
    expect(slots.at(-1)).toEqual({ day: 3, residentId: null, userId: null, houseId: null, name: "Satpam", color: null });
    expect(sameSchedule(draft, toDraft(withName))).toBe(true);
    expect(sameSchedule(draft, shiftSlot(draft, "slot-2", -1))).toBe(false);
  });

  it("tukar malam mempertahankan posisi, warna, dan rujukan masing-masing tanpa mengubah baris lain", () => {
    const draft = toDraft(schedule);
    const swapped = swapSlots(draft, "slot-1", "slot-3");
    expect(names(swapped, 0)).toEqual(["Nino", "Widi"]);
    expect(names(swapped, 1)).toEqual(["Yusuf"]);
    expect(swapped.find((s) => s.key === "slot-1")).toEqual({ ...draft[0], day: 1 });
    expect(swapped.find((s) => s.key === "slot-3")).toEqual({ ...draft[2], day: 0 });
    expect(swapped[1]).toBe(draft[1]);
    expect(swapped[3]).toBe(draft[3]);
    expect(toSlots(swapped)).toEqual([
      { day: 0, residentId: null, userId: null, houseId: 3, name: null, color: null },
      { day: 0, residentId: null, userId: null, houseId: 2, name: null, color: null },
      { day: 1, residentId: null, userId: 10, houseId: null, name: null, color: "green" },
      { day: 2, residentId: null, userId: null, houseId: 4, name: null, color: null },
    ]);
    expect(draft).toEqual(toDraft(schedule));
    expect(swapSlots(swapped, "slot-1", "slot-3")).toEqual(draft);
  });

  it("tukar jadwal memakai draf terbaru, termasuk baris baru dan perubahan yang belum disimpan", () => {
    const edited = moveSlot(toDraft(schedule), "slot-2", 3).map((s) => s.key === "slot-1" ? { ...s, color: "orange" as const } : s);
    const fresh: DraftSlot = { ...edited[0], key: "baru-1", day: 5, userId: null, houseId: null, name: "Satpam", color: "yellow" };
    const swapped = swapSlots([...edited, fresh], "slot-1", fresh.key);
    expect(names(swapped, 0)).toEqual(["Satpam"]);
    expect(names(swapped, 3)).toEqual(["Widi"]);
    expect(swapped.find((s) => s.key === "slot-1")).toMatchObject({ day: 5, color: "orange", userId: 10 });
    expect(swapped.find((s) => s.key === fresh.key)).toMatchObject({ day: 0, color: "yellow", name: "Satpam" });
  });

  it("menahan pasangan pada malam yang sama, baris hilang, dan jadwal ganda di kedua arah", () => {
    const draft = toDraft(schedule);
    for (const target of ["slot-1", "slot-2", "hilang"]) {
      expect(canSwapSlots(draft, "slot-1", target)).toBe(false);
      expect(swapSlots(draft, "slot-1", target)).toBe(draft);
    }
    expect(swapSlots(draft, "hilang", "slot-3")).toBe(draft);
    const duplicates: DraftSlot[] = [
      { ...draft[0], key: "akun-sama", day: 1 },
      { ...draft[2], key: "rumah-sama", day: 0 },
    ];
    for (const duplicate of duplicates) {
      const withDuplicate = [...draft, duplicate];
      expect(canSwapSlots(withDuplicate, "slot-1", "slot-3")).toBe(false);
      expect(swapSlots(withDuplicate, "slot-1", "slot-3")).toBe(withDuplicate);
    }
    const named = [{ ...draft[0], userId: null, houseId: null, name: "Satpam" }, { ...draft[2], userId: null, houseId: null, name: "Satpam" }];
    expect(canSwapSlots(named, "slot-1", "slot-3")).toBe(false);
  });
});
