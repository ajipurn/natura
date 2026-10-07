import {
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Rectangle,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";

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

/** Grafik jimpitan bersama: Recharts menangani ukuran, sumbu, tooltip, dan navigasi keyboard. */
export function BarChart({
  bars,
  caption,
  className,
  size = "md",
  labelEvery = Math.ceil(bars.length / 10),
  formatValue,
}: {
  bars: Bar[];
  caption: string;
  className?: string;
  size?: "md" | "sm" | "lg";
  /** Kandidat label ditulis tiap sekian batang; Recharts menyembunyikan yang bertabrakan. */
  labelEvery?: number;
  /** Tampilkan skala nominal dan garis bantu, dengan grafik selebar card. */
  formatValue?: (value: number) => string;
}) {
  const height = size === "sm" ? 108 : size === "lg" ? 208 : 156;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ticks = bars.filter((_, i) => i % Math.max(1, labelEvery) === 0 || i === bars.length - 1).map((b) => b.key);

  return (
    <figure className={className}>
      <div className="mx-auto min-w-0" style={formatValue ? undefined : { maxWidth: `${bars.length * 64 + 40}px` }}>
        <RechartsBarChart
          responsive
          width="100%"
          height={height}
          data={bars}
          title={caption}
          accessibilityLayer
          margin={{ top: 8, right: 20, bottom: 0, left: formatValue ? 0 : 20 }}
          barCategoryGap="24%"
          className="[&_.recharts-surface]:outline-none [&_.recharts-surface:focus-visible]:rounded-lg [&_.recharts-surface:focus-visible]:ring-2 [&_.recharts-surface:focus-visible]:ring-primary/50"
        >
          {formatValue && <CartesianGrid vertical={false} stroke="var(--line)" strokeOpacity={0.7} />}
          <XAxis
            dataKey="key"
            ticks={ticks}
            tickFormatter={(key) => bars.find((b) => b.key === key)?.label ?? key}
            interval="preserveStartEnd"
            minTickGap={12}
            tick={{ fill: "var(--muted)" }}
            fontSize={10}
            tickMargin={8}
            height={24}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            hide={!formatValue}
            width={formatValue ? "auto" : 0}
            domain={[0, formatValue ? "auto" : max]}
            tickFormatter={formatValue}
            tick={{ fill: "var(--muted)" }}
            fontSize={10}
            tickCount={3}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }}
            wrapperStyle={{ zIndex: 60 }}
            content={({ active, label }) => {
              const bar = bars.find((b) => b.key === label);
              return active && bar ? (
                <div role="tooltip" className="max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-line bg-card px-3 py-2 text-xs leading-relaxed text-fg shadow-lg">
                  {bar.title}
                </div>
              ) : null;
            }}
          />
          <RechartsBar
            dataKey="value"
            maxBarSize={40}
            minPointSize={2}
            isAnimationActive={false}
            shape={ChartBar}
            activeBar={ChartBar}
          />
        </RechartsBarChart>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      {/* Pembungkus menjaga tabel pembaca layar agar tidak melebarkan halaman. */}
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

function ChartBar(props: BarShapeProps) {
  const bar = props.payload as Bar;
  if (bar.blank) return null;
  return (
    <Rectangle
      {...props}
      radius={[3, 3, 0, 0]}
      fill={bar.value === 0 && !bar.highlight ? "var(--line)" : "var(--primary)"}
      fillOpacity={bar.highlight || bar.value === 0 ? 1 : props.isActive ? 0.7 : bar.faint ? 0.2 : 0.45}
    />
  );
}
