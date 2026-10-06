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
 * Grafik batang sederhana (tanpa pustaka). Tiap batang punya `title` untuk keterangan,
 * dan tabel tersembunyi untuk pembaca layar.
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
      <div aria-hidden className={cx("flex items-end gap-[3px]", size === "sm" ? "h-20" : "h-32")}>
        {bars.map((b) => (
          <div key={b.key} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={b.title}>
            {!b.blank && (
              <div
                className={cx(
                  "mx-auto w-full max-w-8 rounded-t",
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
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex h-3.5 gap-[3px] text-[10px] leading-3.5 text-muted">
        {bars.map((b, i) => (
          // Label melayang (`absolute`) supaya boleh lebih lebar dari batangnya tanpa melebarkan grafik;
          // label di ujung dirapatkan ke tepi supaya tidak keluar dari grafik. Di layar sempit label
          // yang rapat hanya ditulis selang-seling supaya tidak bertumpuk.
          <span key={b.key} className="relative min-w-0 flex-1">
            {i % labelEvery === 0 && (
              <span
                className={cx(
                  "absolute top-0 whitespace-nowrap",
                  labelEvery < 5 && (i / labelEvery) % 2 === 1 && "max-sm:hidden",
                  i === 0 ? "left-0" : i > bars.length - 1 - labelEvery ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                {b.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <td>{b.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
