import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { guardColorClass } from "@/components/guard-color-class";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, cx } from "@/components/ui";
import { rondaDate } from "@/lib/dates";
import { DAY_NAMES, dayLabel, scheduleDay, slotHouseLabel } from "@/lib/schedule";
import type { ScheduleDTO } from "@/lib/types";
import { scheduleQuery } from "./queries";

/** Jadwal ronda mingguan (hanya baca), mulai dari malam ini. `emptyHint` = petunjuk kalau jadwal masih kosong. */
export function SchedulePage({
  emptyHint,
  currentUserId,
  intro,
}: {
  emptyHint: string;
  /** Tampil di bawah judul, sebelum jadwal. */
  intro?: ReactNode;
  /** Tandai baris jadwal milik petugas yang sedang masuk. */
  currentUserId?: number;
}) {
  const query = useQuery(scheduleQuery);
  const tonight = scheduleDay(rondaDate(new Date()));
  // Mulai dari malam ini, lalu malam-malam berikutnya.
  const days = DAY_NAMES.map((_, i) => (tonight + i) % 7);

  return (
    <>
      <PageHeader title="Jadwal ronda" subtitle={`Malam ini: ${dayLabel(tonight)}`} />
      {intro}
      <QueryState query={query}>
        {({ schedule }) => (
          <>
            {schedule.length === 0 ? (
              <Card className="text-center">
                <CalendarDays className="mx-auto size-10 text-muted" />
                <p className="mt-2 font-semibold">Belum ada jadwal ronda</p>
                <p className="mt-1 text-sm text-muted">{emptyHint}</p>
              </Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {days.map((day) => (
                  <DayCard
                    key={day}
                    day={day}
                    tonight={day === tonight}
                    entries={schedule.filter((e) => e.day === day)}
                    currentUserId={currentUserId}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}

function DayCard({
  day,
  tonight,
  entries,
  currentUserId,
}: {
  day: number;
  tonight: boolean;
  entries: ScheduleDTO[];
  currentUserId?: number;
}) {
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
          {entries.map((e) => {
            const me = currentUserId !== undefined && e.userId === currentUserId;
            return (
              <li key={e.id} className={cx("flex items-center gap-3 py-1.5", me && "-mx-2 rounded-lg bg-primary/10 px-2")}>
                <span aria-hidden className={cx("size-3 shrink-0 rounded-full", guardColorClass(e.color))} />
                <span className="w-14 shrink-0 font-bold">{slotHouseLabel(e) || "—"}</span>
                <span className="min-w-0 flex-1 truncate">{e.name ?? e.ownerName ?? <span className="text-muted">—</span>}</span>
                {me && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg">Kamu</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
