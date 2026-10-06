import { Popover } from "@base-ui/react/popover";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Calendar, type CalendarMark } from "@/components/calendar";
import { Button, cx } from "@/components/ui";
import { rondaDate } from "@/lib/dates";
import { monthPatrolsQuery } from "./queries";

const MARK_LABELS = { full: "semua rumah dicek", partial: "sebagian rumah dicek", none: "belum ada catatan" };

/**
 * Tombol yang membuka kalender malam ronda, lalu membuka malam yang dipilih (`${basePath}/:tanggal`).
 * Malam yang sudah ada catatannya diberi titik: hijau kalau semua rumah dihuni sudah dicek, kuning
 * kalau baru sebagian. Malam yang belum tiba tidak bisa dipilih.
 */
export function NightPicker({
  basePath,
  search = "",
  selected,
  hint,
  label,
  children,
  triggerClassName,
  variant = "secondary",
  size = "sm",
}: {
  basePath: string;
  /** Ditambahkan ke alamat malam yang dipilih, mis. "?tab=log". */
  search?: string;
  /** Malam yang sedang dibuka. */
  selected?: string;
  /** Keterangan di bawah kalender. */
  hint?: ReactNode;
  /** Label tombol untuk pembaca layar (wajib untuk tombol ikon saja). */
  label?: string;
  children: ReactNode;
  triggerClassName?: string;
  variant?: "secondary" | "ghost";
  size?: "sm" | "icon-sm";
}) {
  const navigate = useNavigate();
  const today = rondaDate(new Date());
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((selected ?? today).slice(0, 7));
  const popupRef = useRef<HTMLDivElement>(null);
  const query = useQuery({ ...monthPatrolsQuery(month), enabled: open, placeholderData: (previous) => previous });

  const marks: Record<string, CalendarMark> = {};
  if (query.data && !query.isPlaceholderData) {
    const { patrols, activeHouses } = query.data;
    for (const p of patrols) marks[p.date] = activeHouses > 0 && p.filled + p.empty >= activeHouses ? "full" : "partial";
  }

  function pick(date: string) {
    setOpen(false);
    navigate(`${basePath}/${date}${search}`);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // Selalu mulai dari bulan malam yang sedang dibuka (atau bulan ini).
        if (next) setMonth((selected ?? today).slice(0, 7));
        setOpen(next);
      }}
    >
      <Popover.Trigger aria-label={label} render={<Button variant={variant} size={size} className={triggerClassName} />}>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-50 outline-none" sideOffset={6} align="end" collisionPadding={12}>
          <Popover.Popup
            ref={popupRef}
            initialFocus={() => popupRef.current?.querySelector<HTMLElement>('[role="grid"] button[tabindex="0"]') ?? true}
            className="origin-[var(--transform-origin)] rounded-2xl border border-line bg-card p-3 text-fg shadow-xl outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <Popover.Title className="sr-only">Pilih malam ronda</Popover.Title>
            <Calendar
              // Kalender dibuat ulang tiap dibuka supaya fokusnya mulai dari malam yang dipilih.
              key={String(open)}
              month={month}
              onMonthChange={setMonth}
              selected={selected}
              today={today}
              max={today}
              marks={marks}
              markLabels={query.data && !query.isPlaceholderData ? MARK_LABELS : undefined}
              onSelect={pick}
            />
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2.5">
              <div className={cx("flex items-center gap-3 text-[11px] text-muted", query.isFetching && "opacity-60")}>
                <span className="flex items-center gap-1">
                  <span aria-hidden className="size-1.5 rounded-full bg-filled" /> Lengkap
                </span>
                <span className="flex items-center gap-1">
                  <span aria-hidden className="size-1.5 rounded-full bg-warn" /> Sebagian
                </span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" onClick={() => pick(today)}>
                Malam ini
              </Button>
            </div>
            {hint && <p className="mt-1.5 max-w-[17.5rem] text-[11px] leading-snug text-muted">{hint}</p>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
