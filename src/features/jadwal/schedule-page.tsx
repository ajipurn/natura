import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, cx } from "@/components/ui";
import { rondaDate } from "@/lib/dates";
import { houseLabel } from "@/lib/houses";
import { DAY_NAMES, dayLabel, scheduleDay } from "@/lib/schedule";
import type { ScheduleDTO } from "@/lib/types";
import { scheduleQuery } from "./queries";

/**
 * Jadwal ronda mingguan, mulai dari malam ini. `admin` = bagian impor (hanya di app admin);
 * `emptyHint` = petunjuk kalau jadwal masih kosong.
 */
export function SchedulePage({ admin, emptyHint }: { admin?: (hasSchedule: boolean) => ReactNode; emptyHint: string }) {
  const query = useQuery(scheduleQuery);
  const tonight = scheduleDay(rondaDate(new Date()));
  // Mulai dari malam ini, lalu malam-malam berikutnya.
  const days = DAY_NAMES.map((_, i) => (tonight + i) % 7);

  return (
    <>
      <PageHeader title="Jadwal ronda" subtitle={`Malam ini: ${dayLabel(tonight)}`} />
      <QueryState query={query}>
        {({ schedule }) => (
          <>
            {admin?.(schedule.length > 0)}
            {schedule.length === 0 ? (
              <Card className="text-center">
                <CalendarDays className="mx-auto size-10 text-muted" />
                <p className="mt-2 font-semibold">Belum ada jadwal ronda</p>
                <p className="mt-1 text-sm text-muted">{emptyHint}</p>
              </Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {days.map((day) => (
                  <DayCard key={day} day={day} tonight={day === tonight} entries={schedule.filter((e) => e.day === day)} />
                ))}
              </div>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}

function DayCard({ day, tonight, entries }: { day: number; tonight: boolean; entries: ScheduleDTO[] }) {
  return (
    <section
      aria-label={dayLabel(day)}
      className={cx("rounded-2xl border bg-card p-4", tonight ? "border-primary ring-2 ring-primary/30" : "border-line")}
    >
      <h2 className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">
          {dayLabel(day)}
          {tonight && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg">
              Malam ini
            </span>
          )}
        </span>
        <span className="text-sm text-muted">{entries.length} orang</span>
      </h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Tidak ada jadwal.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {entries.map((e) => (
            <li key={e.position} className="flex items-center gap-3 py-1.5">
              <span className="w-14 shrink-0 font-bold">{houseLabel(e)}</span>
              <span className="min-w-0 flex-1 truncate">{e.name ?? e.ownerName ?? <span className="text-muted">—</span>}</span>
              {e.houseId === null && (
                <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">belum terdaftar</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
