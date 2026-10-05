import { ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
import { houseLabel } from "@/lib/houses";
import { dayLabel, scheduleDay } from "@/lib/schedule";
import type { ScheduleDTO } from "@/lib/types";

const COLLAPSED_COUNT = 6;

/** Siapa yang dijadwalkan jaga di malam ronda ini (dari jadwal ronda mingguan). */
export function TonightGuards({ schedule, date }: { schedule: ScheduleDTO[]; date: string }) {
  const [expanded, setExpanded] = useState(false);
  const day = scheduleDay(date);
  const entries = schedule.filter((e) => e.day === day);
  if (entries.length === 0) return null;

  const shown = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);
  return (
    <section aria-label="Jaga malam ini" className="mb-4 rounded-2xl border border-line bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> Jaga malam ini
          </p>
          <p className="text-xs text-muted">{dayLabel(day)}</p>
        </div>
        <Link to="/petugas/jadwal" className="shrink-0 text-xs font-semibold text-primary">
          Jadwal lengkap
        </Link>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((e) => {
          const name = e.name ?? e.ownerName;
          return (
            <li key={e.position} className="rounded-full bg-idle-soft px-2.5 py-1 text-sm">
              {name && <span className="font-medium">{name} </span>}
              <span className={name ? "text-muted" : "font-medium"}>{houseLabel(e)}</span>
            </li>
          );
        })}
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
