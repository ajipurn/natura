import { describe, expect, it } from "vitest";
import { moveSlot, sameSchedule, shiftSlot, toDraft, toSlots, type DraftSlot } from "@/apps/admin/jadwal/draft";
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

  it("naik/turun hanya di malam yang sama", () => {
    const draft = toDraft(schedule);
    expect(names(shiftSlot(draft, "slot-2", -1), 0)).toEqual(["Widi", "Yusuf"]);
    expect(shiftSlot(draft, "slot-3", -1)).toBe(draft);
  });

  it("nama dari akun tidak disimpan ulang; tanpa perubahan = sama", () => {
    const draft = toDraft(schedule);
    expect(toSlots(draft)[0]).toEqual({ day: 0, name: null, block: "A", number: "1", userId: 10, color: "green" });
    expect(sameSchedule(draft, toDraft(schedule))).toBe(true);
    expect(sameSchedule(draft, shiftSlot(draft, "slot-2", -1))).toBe(false);
  });
});
