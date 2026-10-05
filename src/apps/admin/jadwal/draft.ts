import type { ScheduleDTO } from "@/lib/types";

/** Satu baris jadwal yang sedang diedit (belum disimpan). Urutan dalam satu malam = urutan di daftar. */
export type DraftSlot = Omit<ScheduleDTO, "id" | "position"> & { key: string };

let nextKey = 0;
export const newKey = () => `baru-${++nextKey}`;

export function toDraft(schedule: ScheduleDTO[]): DraftSlot[] {
  return [...schedule]
    .sort((a, b) => a.day - b.day || a.position - b.position)
    .map(({ id, position: _position, ...slot }) => ({ ...slot, key: `slot-${id}` }));
}

/** Isi jadwal untuk dibandingkan (ada perubahan atau tidak) dan dikirim ke server. */
export function toSlots(draft: DraftSlot[]) {
  return [...draft]
    .map((s, index) => ({ s, index }))
    .sort((a, b) => a.s.day - b.s.day || a.index - b.index)
    // Jadwal hanya menyimpan rujukan: akun petugas, rumah tanpa akun, atau nama bebas.
    .map(({ s }) => ({
      day: s.day,
      userId: s.userId,
      houseId: s.userId ? null : s.houseId,
      name: s.userId || s.houseId ? null : s.name,
      color: s.color,
    }));
}

export function sameSchedule(a: DraftSlot[], b: DraftSlot[]) {
  return JSON.stringify(toSlots(a)) === JSON.stringify(toSlots(b));
}

/** Pindahkan satu baris ke malam `day`, sebelum baris `beforeKey` (atau paling akhir). */
export function moveSlot(draft: DraftSlot[], key: string, day: number, beforeKey?: string): DraftSlot[] {
  const slot = draft.find((s) => s.key === key);
  if (!slot || key === beforeKey) return draft;
  const rest = draft.filter((s) => s.key !== key);
  const moved = { ...slot, day };
  let index = beforeKey ? rest.findIndex((s) => s.key === beforeKey) : -1;
  if (index === -1) {
    const lastOfDay = rest.findLastIndex((s) => s.day === day);
    index = lastOfDay === -1 ? rest.findIndex((s) => s.day > day) : lastOfDay + 1;
    if (index === -1) index = rest.length;
  }
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}

/** Tukar dengan baris sebelum (-1) atau sesudahnya (+1) di malam yang sama. */
export function shiftSlot(draft: DraftSlot[], key: string, delta: -1 | 1): DraftSlot[] {
  const slot = draft.find((s) => s.key === key);
  if (!slot) return draft;
  const sameDay = draft.filter((s) => s.day === slot.day);
  const neighbour = sameDay[sameDay.indexOf(slot) + delta];
  if (!neighbour) return draft;
  const a = draft.indexOf(slot);
  const b = draft.indexOf(neighbour);
  const next = [...draft];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
