import { Pie, PieChart, Tooltip } from "recharts";
import { formatRupiah } from "@/lib/format";
import type { CashMonth } from "@/server/kas";

type Segment = { name: string; value: number; fill: string };

/** Komposisi uang masuk; pengeluaran dan saldo ditampilkan terpisah di overview. */
export function CashIncomeChart({ data }: { data: CashMonth }) {
  const segments: Segment[] = [
    { name: "Jimpitan", value: data.deposits + data.directPayments, fill: "var(--primary)" },
    { name: "Iuran", value: data.duesIncome, fill: "var(--muted)" },
    { name: "Pemasukan lain", value: data.income, fill: "var(--warn)" },
  ];
  const total = segments.reduce((sum, part) => sum + part.value, 0);
  const chartData = total > 0 ? segments.filter((part) => part.value > 0) : [{ name: "Belum ada pemasukan", value: 1, fill: "var(--line)" }];

  return (
    <figure aria-label="Komposisi pemasukan" className="flex items-center justify-center px-3 py-2">
      <div className="relative size-52 shrink-0">
        <PieChart responsive width="100%" height={208} accessibilityLayer className="[&_.recharts-surface:focus-visible]:rounded-lg [&_.recharts-surface:focus-visible]:outline-primary">
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={66} outerRadius={88} paddingAngle={total > 0 && chartData.length > 1 ? 3 : 0}
            stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false} />
          {total > 0 && <Tooltip isAnimationActive={false} wrapperStyle={{ zIndex: 60 }} content={({ active, payload }) => {
            const part = payload?.[0]?.payload as Segment | undefined;
            return active && part ? <div role="tooltip" className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg shadow-lg">
              <p className="text-muted">{part.name}</p><p className="mt-1 font-semibold tabular-nums">{formatRupiah(part.value)} · {Math.round(part.value / total * 100)}%</p>
            </div> : null;
          }} />}
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <span className="text-xs text-muted">Total pemasukan</span>
          <strong className="max-w-32 break-words text-sm font-semibold tabular-nums">{formatRupiah(total)}</strong>
        </div>
      </div>
      <figcaption className="sr-only">Komposisi pemasukan bulan terpilih: {segments.map((part) => `${part.name} ${formatRupiah(part.value)}`).join(", ")}. {total === 0 && "Belum ada pemasukan bulan ini."}</figcaption>
    </figure>
  );
}
