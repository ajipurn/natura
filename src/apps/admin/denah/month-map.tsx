import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Legend, LegendItem } from "@/components/map-legend";
import { QueryState } from "@/components/query-state";
import { SitePlanMap, type LotPaint } from "@/components/site-plan-map";
import { Card, cx } from "@/components/ui";
import { formatMonth, isMonth, rondaDate, shiftMonth } from "@/lib/dates";
import type { MarkerState } from "@/lib/house-state";
import { houseLabel } from "@/lib/houses";
import { monthStats, type HouseMonthStats } from "@/lib/month-stats";
import { SITE_PLAN } from "@/site-plan";
import { recapQuery } from "../queries";
import { HouseChips, HousePanel, MapWithPanel } from "./house-panel";
import { adminPath } from "@/lib/app-paths";

/**
 * Seberapa sering status kosong, dari malam yang tercatat. Satu warna (merah "kosong"), makin pekat
 * makin sering; rumah yang tidak pernah kosong dibiarkan polos.
 */
const HEAT_STEPS: (LotPaint & { upTo: number; label: string; swatch: string })[] = [
  { upTo: 0, label: "0%", shape: "fill-card stroke-fg/40", text: "fill-fg", swatch: "border-fg/40 bg-card" },
  { upTo: 0.1, label: "≤10%", shape: "fill-empty/15 stroke-empty/50", text: "fill-fg", swatch: "border-empty/50 bg-empty/15" },
  { upTo: 0.25, label: "≤25%", shape: "fill-empty/35 stroke-empty/70", text: "fill-fg", swatch: "border-empty/70 bg-empty/35" },
  { upTo: 0.5, label: "≤50%", shape: "fill-empty/60 stroke-empty", text: "fill-fg", swatch: "border-empty bg-empty/60" },
  { upTo: 1, label: ">50%", shape: "fill-empty/90 stroke-empty", text: "fill-card", swatch: "border-empty bg-empty/90" },
];
const NO_DATA: LotPaint = { shape: "fill-idle-soft stroke-fg/25", text: "fill-muted", note: "belum ada status" };
/** Batas "sering kosong" untuk ringkasan di atas denah. */
const OFTEN = 0.25;

/** Bagian malam berstatus kosong; null kalau belum ada status. */
function emptyRate(h: HouseMonthStats): number | null {
  const checked = h.filled + h.empty;
  return checked ? h.empty / checked : null;
}

function heatPaint(h: HouseMonthStats): LotPaint {
  const rate = emptyRate(h);
  if (rate === null) return NO_DATA;
  const step = HEAT_STEPS.find((s) => rate <= s.upTo) ?? HEAT_STEPS[HEAT_STEPS.length - 1];
  return { ...step, note: `kosong ${h.empty} dari ${h.filled + h.empty} malam (${Math.round(rate * 100)}%)` };
}

/** Peta bulanan: heatmap seberapa sering wadah tiap rumah kosong. */
export function MonthMap() {
  const [params] = useSearchParams();
  const bulan = params.get("bulan") ?? "";
  const current = rondaDate(new Date()).slice(0, 7);
  const month = isMonth(bulan) ? bulan : current;
  const query = useQuery({ ...recapQuery(month), placeholderData: (previous) => previous });
  const [selected, setSelected] = useState<number | null>(null);
  const link = (m: string) => adminPath(`/denah?mode=bulan&bulan=${m}`);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <Link to={link(shiftMonth(month, -1))} className="flex items-center gap-1 text-muted hover:text-fg">
          <ChevronLeft className="size-4" /> {formatMonth(shiftMonth(month, -1))}
        </Link>
        <p className="font-semibold">{formatMonth(month)}</p>
        {month < current ? (
          <Link to={link(shiftMonth(month, 1))} className="flex items-center gap-1 text-muted hover:text-fg">
            {formatMonth(shiftMonth(month, 1))} <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="w-24" />
        )}
      </div>

      <QueryState query={query}>
        {(data) => {
          const stats = monthStats(data);
          const active = stats.perHouse.filter((h) => h.status === "active");
          const filled = active.reduce((sum, h) => sum + h.filled, 0);
          const checked = active.reduce((sum, h) => sum + h.filled + h.empty, 0);
          // Rumah mudik tetap bergaris putus-putus; rumah aktif diwarnai heatmap.
          const markers: Record<number, MarkerState> = Object.fromEntries(
            data.houses.filter((h) => h.status === "vacant").map((h) => [h.id, "vacant"]),
          );
          const paint = Object.fromEntries(active.map((h) => [h.id, heatPaint(h)]));
          const often = active
            .filter((h) => (emptyRate(h) ?? 0) > 0)
            .sort((a, b) => (emptyRate(b) ?? 0) - (emptyRate(a) ?? 0) || b.empty - a.empty);
          const byId = new Map(data.houses.map((h) => [h.id, h]));
          const house = selected === null ? undefined : byId.get(selected);

          return (
            <div className={cx(query.isPlaceholderData && "opacity-60")}>
              <div className="mb-4 grid grid-cols-3 gap-2">
                <Card className="p-3 text-center">
                  <p className="text-xl font-bold">{stats.nights}</p>
                  <p className="text-xs text-muted">Malam ronda</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-xl font-bold">{checked ? `${Math.round((filled / checked) * 100)}%` : "–"}</p>
                  <p className="text-xs text-muted">Status terisi</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className={cx("text-xl font-bold", often.some((h) => (emptyRate(h) ?? 0) > OFTEN) && "text-empty")}>
                    {often.filter((h) => (emptyRate(h) ?? 0) > OFTEN).length}
                  </p>
                  <p className="text-xs text-muted">Sering kosong (&gt;25%)</p>
                </Card>
              </div>

              {stats.nights === 0 && <Card className="mb-4 text-center text-muted">Belum ada catatan di bulan ini.</Card>}

              <MapWithPanel
                selectedId={selected}
                map={
                  <>
                    <SitePlanMap
                      plan={SITE_PLAN}
                      houses={data.houses}
                      markers={markers}
                      paint={paint}
                      selectedId={selected}
                      onHouseClick={(h) => setSelected(h.id)}
                    />
                    <Legend>
                      <span className="font-medium text-fg">Status kosong</span>
                      {HEAT_STEPS.map((s) => (
                        <LegendItem key={s.label} swatch={s.swatch}>
                          {s.label}
                        </LegendItem>
                      ))}
                      <LegendItem swatch="border-fg/25 bg-idle-soft">Belum dicek</LegendItem>
                      <LegendItem swatch="border-dashed border-muted bg-card">Mudik</LegendItem>
                    </Legend>
                    <p className="text-xs text-muted">Harian mengikuti catatan ronda. Status periode otomatis dari pembayaran.</p>
                  </>
                }
                panel={
                  house ? (
                    <HousePanel key={house.id} house={house} month={month} onClose={() => setSelected(null)} />
                  ) : (
                    <Card>
                      <HouseChips
                        title="Paling sering kosong"
                        houses={often.slice(0, 12).flatMap((h) => byId.get(h.id) ?? [])}
                        empty={stats.nights ? "Tidak ada status kosong bulan ini." : "Belum ada catatan."}
                        onSelect={setSelected}
                        render={(h) => {
                          const s = stats.perHouse.find((p) => p.id === h.id)!;
                          return (
                            <>
                              {houseLabel(h)} <span className="font-normal text-muted">{Math.round((emptyRate(s) ?? 0) * 100)}%</span>
                            </>
                          );
                        }}
                      />
                    </Card>
                  )
                }
              />
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
