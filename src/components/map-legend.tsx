import type { ReactNode } from "react";
import { cx } from "./ui";

/** Satu keterangan warna di bawah denah. `swatch` = kelas border + latar kotak contohnya. */
export function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("size-3.5 shrink-0 rounded-[3px] border-2", swatch)} />
      {children}
    </span>
  );
}

/** Baris keterangan warna denah. */
export function Legend({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted", className)}>{children}</div>;
}
