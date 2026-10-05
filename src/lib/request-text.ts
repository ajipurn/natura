import { DAY_NAMES } from "./schedule";

/** "Ahad → Rabu", atau "Tambah Rabu" untuk petugas yang belum punya jadwal. */
export function requestChange(fromDay: number | null, toDay: number): string {
  return fromDay === null ? `Tambah ${DAY_NAMES[toDay]}` : `${DAY_NAMES[fromDay]} → ${DAY_NAMES[toDay]}`;
}

export const REQUEST_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Menunggu", tone: "bg-warn-soft text-warn" },
  approved: { label: "Disetujui", tone: "bg-filled-soft text-filled" },
  rejected: { label: "Ditolak", tone: "bg-empty-soft text-empty" },
  cancelled: { label: "Dibatalkan", tone: "bg-idle-soft text-muted" },
};
