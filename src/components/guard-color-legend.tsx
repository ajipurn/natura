import { GUARD_COLOR_LABEL, GUARD_COLOR_MEANING, type GuardColor } from "@/lib/guard-color";
import { guardColorClass } from "./guard-color-class";
import { cx } from "./ui";

const COLORS: (GuardColor | null)[] = ["green", "orange", "blue", null];

export function GuardColorLegend() {
  return (
    <ul aria-label="Arti warna jadwal" className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
      {COLORS.map((color) => (
        <li key={color ?? "white"} className="flex items-center gap-1.5">
          <span aria-hidden className={cx("size-3 shrink-0 rounded-sm", guardColorClass(color))} />
          <span>
            {color === "orange" ? "Kuning/oranye" : color ? GUARD_COLOR_LABEL[color] : "Putih"}: {GUARD_COLOR_MEANING[color ?? "white"]}
          </span>
        </li>
      ))}
    </ul>
  );
}
