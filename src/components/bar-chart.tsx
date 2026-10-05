import { cx } from "./ui";

export type Bar = { key: string; label: string; value: number; title: string; highlight?: boolean };

/**
 * Grafik batang sederhana (tanpa pustaka). Tiap batang punya `title` untuk keterangan,
 * dan tabel tersembunyi untuk pembaca layar.
 */
export function BarChart({ bars, caption, className }: { bars: Bar[]; caption: string; className?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <figure className={className}>
      <div aria-hidden className="flex h-32 items-end gap-[3px]">
        {bars.map((b) => (
          <div key={b.key} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={b.title}>
            <div
              className={cx("w-full rounded-t", b.highlight ? "bg-primary" : "bg-primary/45 group-hover:bg-primary/70")}
              style={{ height: `${Math.max(2, (b.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-[3px] text-[10px] text-muted">
        {bars.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 overflow-hidden text-center">
            {/* Tampilkan sebagian label supaya tidak berdempet. */}
            {i % Math.ceil(bars.length / 10) === 0 ? b.label : ""}
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
