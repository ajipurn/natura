import { Tooltip } from "@base-ui/react/tooltip";
import { cx } from "./ui";

export type Bar = {
  key: string;
  label: string;
  value: number;
  title: string;
  highlight?: boolean;
  /** Batang pucat (mis. malam yang baru sebagian dicek). */
  faint?: boolean;
  /** Tempatnya saja, tanpa batang (mis. malam yang belum tiba). */
  blank?: boolean;
};

/**
 * Grafik batang sederhana. Informasi tiap batang tampil saat hover atau fokus keyboard,
 * dengan tabel tersembunyi untuk pembaca layar.
 */
export function BarChart({
  bars,
  caption,
  className,
  size = "md",
  labelEvery = Math.ceil(bars.length / 10),
}: {
  bars: Bar[];
  caption: string;
  className?: string;
  size?: "md" | "sm";
  /** Label ditulis tiap sekian batang supaya tidak berdempet. */
  labelEvery?: number;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <figure className={className}>
      <Tooltip.Provider delay={0}>
        <div
          className="mx-auto flex gap-[3px] px-5 sm:gap-1.5"
          style={{ maxWidth: `${bars.length * 64 + 40}px` }}
        >
          {bars.map((b, i) => (
            <Tooltip.Root key={b.key}>
              <Tooltip.Trigger
                aria-label={b.title}
                closeOnClick={false}
                className="group min-w-0 flex-1 text-center outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                <span className={cx("flex items-end", size === "sm" ? "h-20" : "h-32")}>
                  {!b.blank && (
                    <span
                      className={cx(
                        "w-full rounded-t",
                        b.highlight
                          ? "bg-primary"
                          : b.value === 0
                            ? "bg-line"
                            : b.faint
                              ? "bg-primary/20 group-hover:bg-primary/35"
                              : "bg-primary/45 group-hover:bg-primary/70",
                      )}
                      style={{ height: `${Math.max(2, (b.value / max) * 100)}%` }}
                    />
                  )}
                </span>
                <span className="relative mt-1.5 block h-3.5 text-[10px] leading-3.5 tabular-nums text-muted">
                  {/* Label tetap di tengah batang; boleh melebar tanpa mengubah lebar kolom. */}
                  {i % labelEvery === 0 && (
                    <span
                      className={cx(
                        "absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap",
                        bars.length > 10 && labelEvery < 5 && (i / labelEvery) % 2 === 1 && "max-sm:hidden",
                      )}
                    >
                      {b.label}
                    </span>
                  )}
                </span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner sideOffset={8} collisionPadding={16} className="z-60">
                  <Tooltip.Popup role="tooltip" className="max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-line bg-card px-3 py-2 text-xs leading-relaxed text-fg shadow-lg">
                    {b.title}
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          ))}
        </div>
      </Tooltip.Provider>
      <figcaption className="sr-only">{caption}</figcaption>
      {/* `sr-only` di pembungkus: tabel tidak bisa lebih sempit dari isinya, jadi bisa melebarkan halaman. */}
      <div className="sr-only">
        <table>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key}>
                <td>{b.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
