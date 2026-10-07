import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { addDays, daysInMonth, formatDateLong, formatMonth, shiftMonth } from "@/lib/dates";
import { Button, cx } from "./ui";

/** Tanda kecil di bawah tanggal: `full` = lengkap, `partial` = sebagian. */
export type CalendarMark = "full" | "partial";

const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** 0 = Minggu … 6 = Sabtu. */
const weekday = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();

/**
 * Kalender satu bulan (minggu mulai hari Minggu). Tanggal setelah `max` tidak bisa dipilih.
 * Keyboard: panah pindah hari/minggu, Home/End awal/akhir minggu, PageUp/PageDown pindah bulan.
 * Bulan yang tampil dikendalikan pemanggil (`month`), supaya datanya bisa dimuat per bulan.
 */
export function Calendar({
  month,
  onMonthChange,
  selected,
  today,
  todayLabel = "malam ini",
  max,
  marks,
  markLabels,
  onSelect,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  selected?: string;
  today: string;
  /** Kalender transaksi memakai "hari ini", kalender ronda memakai "malam ini". */
  todayLabel?: string;
  max: string;
  marks?: Record<string, CalendarMark>;
  /** Keterangan tiap tanda untuk pembaca layar, mis. { full: "lengkap" }. */
  markLabels?: Partial<Record<CalendarMark | "none", string>>;
  onSelect: (date: string) => void;
}) {
  const days = daysInMonth(month);
  const clamp = (date: string) => (date > max ? max : date);
  const [focused, setFocused] = useState(() => clamp(selected?.startsWith(month) ? selected : today.startsWith(month) ? today : days[0]));
  const gridRef = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  // Tanggal yang bisa difokus selalu ada di bulan yang tampil.
  const active = focused.startsWith(month) ? focused : clamp(days[0]);

  useEffect(() => {
    if (!keyboard.current) return;
    keyboard.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${active}"]`)?.focus();
  }, [active]);

  function moveTo(date: string) {
    const next = clamp(date);
    keyboard.current = true;
    setFocused(next);
    if (!next.startsWith(month)) onMonthChange(next.slice(0, 7));
  }

  function onKeyDown(e: KeyboardEvent) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(active, -1),
      ArrowRight: () => addDays(active, 1),
      ArrowUp: () => addDays(active, -7),
      ArrowDown: () => addDays(active, 7),
      Home: () => addDays(active, -weekday(active)),
      End: () => addDays(active, 6 - weekday(active)),
      PageUp: () => sameDayIn(shiftMonth(month, -1), active),
      PageDown: () => sameDayIn(shiftMonth(month, 1), active),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    moveTo(move());
  }

  function changeMonth(delta: number) {
    const next = shiftMonth(month, delta);
    onMonthChange(next);
    setFocused(clamp(sameDayIn(next, active)));
  }

  // Sel kosong sebelum tanggal 1, lalu dibagi per minggu.
  const cells: (string | null)[] = [...Array<null>(weekday(days[0])).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <div className="w-[17.5rem] max-w-full select-none">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => changeMonth(-1)} aria-label={`Bulan sebelumnya, ${formatMonth(shiftMonth(month, -1))}`}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="font-semibold" aria-live="polite">
          {formatMonth(month)}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => changeMonth(1)}
          disabled={month >= max.slice(0, 7)}
          aria-label={`Bulan berikutnya, ${formatMonth(shiftMonth(month, 1))}`}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div ref={gridRef} role="grid" aria-label={formatMonth(month)} onKeyDown={onKeyDown}>
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((name) => (
            <span key={name} role="columnheader" aria-label={name} className="pb-1 text-center text-[11px] font-medium text-muted">
              {name.slice(0, 3)}
            </span>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div key={i} role="row" className="grid grid-cols-7">
            {week.map((date, j) => {
              if (!date) return <span key={j} role="gridcell" />;
              const disabled = date > max;
              const mark = marks?.[date];
              const isSelected = date === selected;
              const isToday = date === today;
              const markText = markLabels?.[mark ?? "none"];
              return (
                <span key={date} role="gridcell" aria-selected={isSelected} className="flex justify-center py-0.5">
                  <button
                    type="button"
                    data-date={date}
                    tabIndex={date === active ? 0 : -1}
                    disabled={disabled}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={[formatDateLong(date), isToday && todayLabel, !disabled && markText].filter(Boolean).join(", ")}
                    onClick={() => onSelect(date)}
                    onFocus={() => setFocused(date)}
                    className={cx(
                      "relative flex size-9 items-center justify-center rounded-lg text-sm tabular-nums outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-primary/50",
                      disabled ? "cursor-not-allowed text-muted/40" : "cursor-pointer hover:bg-idle-soft",
                      isToday && !isSelected && "font-bold text-primary ring-1 ring-inset ring-primary/40",
                      isSelected && "bg-primary font-semibold text-primary-fg hover:bg-primary",
                    )}
                  >
                    {Number(date.slice(8))}
                    {mark && !disabled && (
                      <span
                        aria-hidden
                        className={cx(
                          "absolute bottom-1 size-1 rounded-full",
                          isSelected ? "bg-primary-fg" : mark === "full" ? "bg-filled" : "bg-warn",
                        )}
                      />
                    )}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tanggal yang sama di bulan lain; dipotong ke akhir bulan (31 → 30/28). */
function sameDayIn(month: string, isoDate: string) {
  const days = daysInMonth(month);
  return days[Math.min(Number(isoDate.slice(8)), days.length) - 1];
}
