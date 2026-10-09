import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Legend, LegendItem } from "@/components/map-legend";
import { QueryState } from "@/components/query-state";
import { SitePlanMap } from "@/components/site-plan-map";
import { Card, cx } from "@/components/ui";
import { patrolQuery } from "@/features/riwayat/queries";
import { formatDateLong, formatTime, rondaDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { rondaHouseState, type MarkerState } from "@/lib/house-state";
import { summarize } from "@/lib/recap";
import { SITE_PLAN } from "@/site-plan";
import { HouseChips, HousePanel, MapWithPanel } from "./house-panel";
import { adminPath } from "@/lib/app-paths";

/** Peta ronda malam ini: catatan harian dan status otomatis pembayaran periode. */
export function TonightMap() {
  const date = rondaDate(new Date());
  const query = useQuery({ ...patrolQuery(date), refetchInterval: 30_000 });
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <QueryState query={query}>
      {({ houses, collections, settings, paymentPeriods }) => {
        const summary = summarize(houses, collections, paymentPeriods);
        const byHouse = new Map(collections.map((c) => [c.houseId, c]));
        const markers: Record<number, MarkerState> = Object.fromEntries(
          houses.map((h) => {
            const period = paymentPeriods?.find((p) => p.houseId === h.id);
            return [h.id, rondaHouseState(h, byHouse.get(h.id), period)];
          }),
        );
        const emptyCount = summary.empty.length;
        // Rumah aktif yang ada isinya (rumah mudik yang kebetulan diisi tidak ikut dihitung di bilah).
        const filledCount = summary.checked - emptyCount;
        const house = houses.find((h) => h.id === selected);

        return (
          <>
            <Card className="mb-4 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-semibold">{formatDateLong(date)}</p>
                <p className="flex items-center gap-3 text-xs text-muted">
                  <span>Diperbarui {formatTime(new Date(query.dataUpdatedAt))}</span>
                  <Link to={adminPath(`/riwayat/${date}`)} className="flex items-center font-semibold text-primary">
                    Detail & koreksi <ChevronRight className="size-4" />
                  </Link>
                </p>
              </div>

              <div>
                <div
                  className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-idle-soft"
                  role="img"
                  aria-label={`${summary.checked} dari ${summary.expected} rumah selesai`}
                >
                  {filledCount > 0 && <span className="bg-filled" style={{ width: `${(filledCount / summary.expected) * 100}%` }} />}
                  {emptyCount > 0 && <span className="bg-empty" style={{ width: `${(emptyCount / summary.expected) * 100}%` }} />}
                </div>
                <p className="mt-1.5 text-sm text-muted">
                  <strong className="text-fg">{summary.checked}</strong> dari {summary.expected} rumah selesai
                  {summary.expected > 0 && ` (${Math.round((summary.checked / summary.expected) * 100)}%)`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat value={summary.filled.length} label="Ada" className="text-filled" />
                <Stat value={emptyCount} label="Kosong" className="text-empty" />
                <Stat value={summary.unchecked.length} label="Belum dicek" />
                <Stat value={formatRupiah(summary.total)} label="Terkumpul" />
              </div>
              {summary.collectors.length > 0 && <p className="text-sm text-muted">Petugas: {summary.collectors.join(", ")}</p>}
              {!!paymentPeriods?.length && <p className="text-xs text-muted">Mingguan/bulanan otomatis; tidak perlu discan.</p>}
            </Card>

            <MapWithPanel
              selectedId={selected}
              map={
                <>
                  <SitePlanMap
                    plan={SITE_PLAN}
                    houses={houses}
                    markers={markers}
                    selectedId={selected}
                    onHouseClick={(h) => setSelected(h.id)}
                  />
                  <Legend>
                    <LegendItem swatch="border-filled bg-filled-soft">Ada</LegendItem>
                    <LegendItem swatch="border-empty bg-empty-soft">Kosong</LegendItem>
                    <LegendItem swatch="border-fg/50 bg-card">Belum dicek</LegendItem>
                    <LegendItem swatch="border-dashed border-muted bg-card">Mudik</LegendItem>
                    <span className="sm:ml-auto">Ketuk rumah untuk melihat catatannya.</span>
                  </Legend>
                </>
              }
              panel={
                house ? (
                  <HousePanel
                    key={house.id}
                    house={house}
                    month={date.slice(0, 7)}
                    tonight={{ date, collection: byHouse.get(house.id) ?? null, defaultAmount: settings.defaultAmount, period: paymentPeriods?.find((p) => p.houseId === house.id) }}
                    onClose={() => setSelected(null)}
                  />
                ) : (
                  <Card className="space-y-4">
                    <HouseChips title="Kosong" houses={summary.empty} empty="Belum ada wadah kosong." onSelect={setSelected} />
                    <HouseChips
                      title="Belum dicek"
                      houses={summary.unchecked}
                      empty={summary.expected ? "Semua rumah selesai." : "Belum ada rumah."}
                      onSelect={setSelected}
                    />
                  </Card>
                )
              }
            />
          </>
        );
      }}
    </QueryState>
  );
}

function Stat({ value, label, className }: { value: number | string; label: string; className?: string }) {
  return (
    <div className="rounded-xl bg-idle-soft/50 px-3 py-2">
      <p className={cx("whitespace-nowrap text-xl font-bold", className)}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
