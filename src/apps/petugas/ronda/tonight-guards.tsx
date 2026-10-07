import { ChevronDown, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
import { GuardChip } from "@/components/guard-chip";
import { Button, cx } from "@/components/ui";
import { shownToGuards } from "@/lib/guard-color";
import { NIGHT_OF, scheduleDay, slotHouseLabel } from "@/lib/schedule";
import type { ScheduleDTO } from "@/lib/types";

/**
 * Siapa yang dijadwalkan jaga di malam ronda ini, diringkas jadi satu baris
 * ("Kamu jaga · bersama Nino, Sahrul +5") yang bisa dibuka untuk melihat semuanya. Baris rumah yang
 * belum ada nama warganya dan baris putih (kosong/tidak dihuni, lihat `shownToGuards`) tidak ditampilkan
 * dan tidak dihitung; warna lainnya tidak dipakai.
 */
export function TonightGuards({ schedule, date, userId }: { schedule: ScheduleDTO[]; date: string; userId?: number }) {
  const [expanded, setExpanded] = useState(false);
  const day = scheduleDay(date);
  const entries = schedule
    .flatMap((e) => {
      const name = e.name ?? e.ownerName;
      return e.day === day && name && shownToGuards(e, userId) ? [{ ...e, name }] : [];
    })
    // Petugas yang sedang masuk ditaruh paling depan.
    .sort((a, b) => Number(b.userId === userId) - Number(a.userId === userId) || a.position - b.position);
  if (entries.length === 0) return null;
  const mine = userId === undefined ? undefined : entries.find((e) => e.userId === userId);
  const others = entries.filter((e) => e !== mine).map((e) => e.name);
  const names = others.length > 2 ? `${others.slice(0, 2).join(", ")} +${others.length - 2}` : others.join(", ");
  // Saat terbuka nama-namanya sudah terlihat di bawah, jadi judulnya cukup jumlahnya.
  const detail = expanded ? `${entries.length} orang` : mine ? names && `bersama ${names}` : names;

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
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <strong>{mine ? "Kamu jaga malam ini" : "Jaga malam ini"}</strong>
          {detail && <span className="text-muted"> · {detail}</span>}
        </span>
        <ChevronDown className={cx("size-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} aria-hidden />
      </Button>
      {expanded && (
        <div className="border-t border-line px-3 pb-3 pt-2">
          <div className="flex items-baseline justify-between gap-2">
            {/* Tanggalnya sudah ada di kartu ringkasan. */}
            <p className="text-xs text-muted">Malam {NIGHT_OF[day]}</p>
            <Link to="/petugas/jadwal" className="shrink-0 text-xs font-semibold text-primary">
              Jadwal lengkap
            </Link>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {entries.map((e) => (
              <GuardChip
                key={e.id}
                name={e.name}
                house={slotHouseLabel(e)}
                color={null}
                me={userId !== undefined && e.userId === userId}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
