import { Popover } from "@base-ui/react/popover";
import { CalendarDays } from "lucide-react";
import { useId, useRef, useState } from "react";
import { formatDateLong, formatDateShort } from "@/lib/dates";
import { Calendar } from "./calendar";
import { Button } from "./ui";

/** Isian tanggal menggunakan kalender yang sama dengan Riwayat ronda. */
export function DatePicker({
  label,
  value,
  onValueChange,
  today,
}: {
  label: string;
  value: string;
  onValueChange: (date: string) => void;
  today: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const popupRef = useRef<HTMLDivElement>(null);

  function pick(date: string) {
    onValueChange(date);
    setOpen(false);
  }

  return (
    <div>
      <label id={`${id}-label`} htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (next) setMonth(value.slice(0, 7));
          setOpen(next);
        }}
      >
        <Popover.Trigger
          id={id}
          aria-labelledby={`${id}-label ${id}-value`}
          aria-describedby={`${id}-hint`}
          render={<Button variant="secondary" className="w-full justify-between font-normal" />}
        >
          <span id={`${id}-value`}>{formatDateShort(value).split(", ")[1]} {value.slice(0, 4)}</span>
          <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="z-60 outline-none" sideOffset={6} align="end" collisionPadding={12}>
            <Popover.Popup
              ref={popupRef}
              initialFocus={() => popupRef.current?.querySelector<HTMLElement>('[role="grid"] button[tabindex="0"]') ?? true}
              className="max-w-[calc(100vw-1.5rem)] origin-[var(--transform-origin)] rounded-2xl border border-line bg-card p-3 text-fg shadow-xl outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
            >
              <Popover.Title className="sr-only">Pilih {label.toLocaleLowerCase("id-ID")}</Popover.Title>
              <Calendar
                key={String(open)}
                month={month}
                onMonthChange={setMonth}
                selected={value}
                today={today}
                todayLabel="hari ini"
                max={today}
                onSelect={pick}
              />
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2.5">
                <Popover.Close render={<Button variant="ghost" size="sm" />}>Tutup</Popover.Close>
                <Button variant="ghost" size="sm" className="text-primary" onClick={() => pick(today)}>Hari ini</Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{formatDateLong(value)}</p>
    </div>
  );
}
