import type { GuardColor } from "@/lib/guard-color";
import { guardColorClass } from "./guard-color-class";
import { cx } from "./ui";

/** Satu petugas jaga: nama + rumah, berwarna seperti di tabel jadwal. `me` = petugas yang sedang masuk. */
export function GuardChip({
  name,
  house,
  color,
  me = false,
}: {
  name: string | null;
  house: string;
  color: GuardColor | null;
  me?: boolean;
}) {
  return (
    <li
      className={cx(
        "inline-flex items-baseline gap-1 rounded-full px-2.5 py-1 text-sm leading-tight",
        guardColorClass(color),
        me && "ring-2 ring-primary ring-offset-2 ring-offset-card",
      )}
    >
      {name && <span className="font-semibold">{me ? "Kamu" : name}</span>}
      {house && <span className={cx(name ? "opacity-85" : "font-semibold")}>{house}</span>}
    </li>
  );
}
