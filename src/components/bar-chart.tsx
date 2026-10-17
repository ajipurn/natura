import { Component, lazy, Suspense, type ReactNode } from "react";

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

export type BarChartProps = {
  bars: Bar[];
  caption: string;
  className?: string;
  size?: "md" | "sm" | "lg";
  /** Kandidat label ditulis tiap sekian batang; Recharts menyembunyikan yang bertabrakan. */
  labelEvery?: number;
  /** Tampilkan skala nominal dan garis bantu, dengan grafik selebar card. */
  formatValue?: (value: number) => string;
};

const Chart = lazy(() => import("./bar-chart-content").then((m) => ({ default: m.BarChartContent })));

/** Pustaka grafik dimuat saat data tampil; app dan pencatatan offline tetap bisa dibuka tanpanya. */
export function BarChart(props: BarChartProps) {
  const fallback = <ChartTable {...props} />;
  return <ChartBoundary fallback={fallback}><Suspense fallback={fallback}><Chart {...props} /></Suspense></ChartBoundary>;
}

/** Angka tetap terbaca saat pustaka belum tersimpan di HP atau jaringan terputus. */
function ChartTable({ bars, caption, className, size = "md" }: BarChartProps) {
  return (
    <figure className={className}>
      <div className="overflow-auto text-xs text-muted" style={{ height: size === "sm" ? 108 : size === "lg" ? 208 : 156 }}>
        <table className="w-full"><tbody>{bars.map((bar) => <tr key={bar.key}><td className="py-1">{bar.title}</td></tr>)}</tbody></table>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

class ChartBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
