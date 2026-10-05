import { ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
import { GuardChip } from "@/components/guard-chip";
import { cx } from "@/components/ui";
import { dayLabel, scheduleDay, slotHouseLabel } from "@/lib/schedule";
import type { ScheduleDTO } from "@/lib/types";

const COLLAPSED_COUNT = 6;

/** Siapa yang dijadwalkan jaga di malam ronda ini (dari jadwal ronda mingguan). */
export function TonightGuards({ schedule, date, userId }: { schedule: ScheduleDTO[]; date: string; userId?: number }) {
  const [expanded, setExpanded] = useState(false);
  const day = scheduleDay(date);
  // Petugas yang sedang masuk ditaruh paling depan.
  const entries = schedule
    .filter((e) => e.day === day)
    .sort((a, b) => Number(b.userId === userId) - Number(a.userId === userId) || a.position - b.position);
  if (entries.length === 0) return null;
  const onDuty = userId !== undefined && entries.some((e) => e.userId === userId);

  const shown = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);
  return (
    <section
      aria-label="Jaga malam ini"
      className={cx("mb-4 rounded-2xl border bg-card p-3", onDuty ? "border-primary ring-2 ring-primary/25" : "border-line")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> {onDuty ? "Kamu jaga malam ini" : "Jaga malam ini"}
          </p>
          <p className="text-xs text-muted">{dayLabel(day)}</p>
        </div>
        <Link to="/petugas/jadwal" className="shrink-0 text-xs font-semibold text-primary">
          Jadwal lengkap
        </Link>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((e) => (
          <GuardChip
            key={e.id}
            name={e.name ?? e.ownerName}
            house={slotHouseLabel(e)}
            // Salinan lama di HP (sebelum ada warna) belum punya `color`.
            color={e.color ?? null}
            me={userId !== undefined && e.userId === userId}
          />
        ))}
      </ul>
      {entries.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-semibold text-primary"
          aria-expanded={expanded}
        >
          {expanded ? "Ringkas" : `+${entries.length - COLLAPSED_COUNT} lainnya`}
        </button>
      )}
    </section>
  );
}
