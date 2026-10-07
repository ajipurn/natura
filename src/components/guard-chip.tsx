import { Star } from "lucide-react";
import { GUARD_COLOR_MEANING, type GuardColor } from "@/lib/guard-color";
import { guardColorClass } from "./guard-color-class";
import { cx } from "./ui";

/**
 * Satu petugas jaga: nama + rumah, berwarna seperti di tabel jadwal (`color` null = netral).
 * `me` = petugas yang sedang masuk; `mine` = rumah yang dipilih warga sebagai rumahnya.
 */
export function GuardChip({
  name,
  house,
  color,
  me = false,
  mine = false,
}: {
  name: string | null;
  house: string;
  color: GuardColor | null;
  me?: boolean;
  mine?: boolean;
}) {
  return (
    <li
      title={GUARD_COLOR_MEANING[color ?? "white"]}
      className={cx(
        "inline-flex items-baseline gap-1 rounded-full px-2.5 py-1 text-sm leading-tight",
        guardColorClass(color),
        (me || mine) && "ring-2 ring-primary ring-offset-2 ring-offset-card",
      )}
    >
      {mine && <Star className="size-3.5 shrink-0 self-center fill-current text-primary" role="img" aria-label="Rumah saya" />}
      {name && <span className="font-semibold">{me ? "Kamu" : name}</span>}
      {/* Spasi supaya pembaca layar membaca "Nino AB-3", bukan "NinoAB-3". */}
      {name && house && " "}
      {house && <span className={cx(name ? "opacity-85" : "font-semibold")}>{house}</span>}
      <span className="sr-only">, {GUARD_COLOR_MEANING[color ?? "white"]}</span>
    </li>
  );
}
