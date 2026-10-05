import { ChevronDown, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
import { GuardChip } from "@/components/guard-chip";
import { guardColorClass } from "@/components/guard-color-class";
import { Button, cx } from "@/components/ui";
import { dayLabel, scheduleDay, slotHouseLabel } from "@/lib/schedule";
import type { ScheduleDTO } from "@/lib/types";

/** Di layar lebar ada ruang, jadi daftar jaga langsung terbuka. */
const wideScreen = () => typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches;

/**
 * Siapa yang dijadwalkan jaga di malam ronda ini, diringkas jadi satu baris
 * ("Kamu jaga · bersama Nino, Sahrul +8") yang bisa dibuka untuk melihat semuanya.
 */
export function TonightGuards({ schedule, date, userId }: { schedule: ScheduleDTO[]; date: string; userId?: number }) {
  const [expanded, setExpanded] = useState(wideScreen);
  const day = scheduleDay(date);
  // Petugas yang sedang masuk ditaruh paling depan.
  const entries = schedule
    .filter((e) => e.day === day)
    .sort((a, b) => Number(b.userId === userId) - Number(a.userId === userId) || a.position - b.position);
  if (entries.length === 0) return null;
  const mine = userId === undefined ? undefined : entries.find((e) => e.userId === userId);
  const others = entries.filter((e) => e !== mine).map((e) => e.name ?? e.ownerName ?? slotHouseLabel(e));
  const names = others.length > 2 ? `${others.slice(0, 2).join(", ")} +${others.length - 2}` : others.join(", ");

  return (
    <section
      aria-label="Jaga malam ini"
      className={cx("rounded-2xl border bg-card", mine ? "border-primary/60" : "border-line")}
    >
      <Button
        variant="plain"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
      >
        {mine ? (
          <span aria-hidden className={cx("size-3 shrink-0 rounded-full", guardColorClass(mine.color ?? null))} />
        ) : (
          <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">
          <strong>{mine ? "Kamu jaga malam ini" : "Jaga malam ini"}</strong>
          {names && <span className="text-muted"> · {mine ? `bersama ${names}` : names}</span>}
        </span>
        <ChevronDown className={cx("size-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} aria-hidden />
      </Button>
      {expanded && (
        <div className="border-t border-line px-3 pb-3 pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs text-muted">{dayLabel(day)}</p>
            <Link to="/petugas/jadwal" className="shrink-0 text-xs font-semibold text-primary">
              Jadwal lengkap
            </Link>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {entries.map((e) => (
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
        </div>
      )}
    </section>
  );
}
