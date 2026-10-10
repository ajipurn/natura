import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CalendarDays, Check, Clock3, Minus, X } from "lucide-react";
import { QueryState } from "@/components/query-state";
import { guardColorClass } from "@/components/guard-color-class";
import { GuardColorLegend } from "@/components/guard-color-legend";
import { Card, PageHeader, cx } from "@/components/ui";
import { rondaDate } from "@/lib/dates";
import { GUARD_COLOR_LABEL, GUARD_COLOR_MEANING, shownToGuards } from "@/lib/guard-color";
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

  return (
    <>
      <PageHeader title="Jadwal ronda" subtitle={`Malam ini: ${dayLabel(tonight)}`} />
      {intro}
      <GuardColorLegend />
      <QueryState query={query}>
        {({ schedule: all }) => {
          // Baris rumah yang belum ada nama warganya dan baris putih (kosong/tidak dihuni) tidak
          // ditampilkan dan tidak dihitung.
          const schedule = all.filter((e) => (e.name ?? e.ownerName) && shownToGuards(e, currentUserId));
          return schedule.length === 0 ? (
              <Card className="text-center">
                <CalendarDays className="mx-auto size-10 text-muted" />
                <p className="mt-2 font-semibold">Belum ada jadwal ronda</p>
                <p className="mt-1 text-sm text-muted">{emptyHint}</p>
              </Card>
            ) : (
              <ScheduleList schedule={schedule} tonight={tonight} currentUserId={currentUserId} />
            );
        }}
      </QueryState>
    </>
  );
}

/** Daftar mingguan tanpa kontrol ubah, juga dipakai pengurus dengan akses baca. */
export function ScheduleList({ schedule, tonight, currentUserId }: { schedule: ScheduleDTO[]; tonight: number; currentUserId?: number }) {
  const days = DAY_NAMES.map((_, i) => (tonight + i) % 7);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {days.map((day) => (
        <DayCard key={day} day={day} tonight={day === tonight} entries={schedule.filter((entry) => entry.day === day)} currentUserId={currentUserId} />
      ))}
    </div>
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
            const status = `${e.color ? GUARD_COLOR_LABEL[e.color] : "Putih"}: ${GUARD_COLOR_MEANING[e.color ?? "white"]}`;
            const StatusIcon = e.color === "green" ? Check : e.color === "yellow" || e.color === "orange" ? Clock3 : e.color === "blue" ? X : Minus;
            return (
              <li key={e.id} className={cx("flex items-center gap-3 py-1.5", me && "-mx-2 rounded-lg bg-primary/10 px-2")}>
                <span role="img" aria-label={status} title={status} className={cx("flex size-5 shrink-0 items-center justify-center rounded-md", guardColorClass(e.color))}>
                  <StatusIcon aria-hidden className="size-3.5" strokeWidth={1.5} />
                </span>
                <span className="w-14 shrink-0 font-bold">{slotHouseLabel(e) || "—"}</span>
                <span className="min-w-0 flex-1 truncate">{e.name ?? e.ownerName ?? <span className="text-muted">—</span>}</span>
                {e.residentId === null && <span className="shrink-0 text-xs text-muted">Belum dipilih</span>}
                {me && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg">Kamu</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
