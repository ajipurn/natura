import { Box, ChevronRight, Grid2X2, Home, Map, Search, Star } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Legend, LegendItem } from "@/components/map-legend";
import { SitePlanMap, type LotPaint } from "@/components/site-plan-map";
import { SegmentedControl } from "@/components/toggle-group";
import { Button, Card, Input, SectionTitle, cx } from "@/components/ui";
import { formatDateShort, formatMonth } from "@/lib/dates";
import { groupByBlock, houseLabel, searchHouses } from "@/lib/houses";
import type { MarkerState } from "@/lib/house-state";
import { BILLING_LABEL, CADENCE_LABEL, type BillingPeriod } from "@/lib/payments";
import { matchPlan } from "@/lib/site-plan";
import type { HouseMonthStats } from "@/lib/month-stats";
import { SITE_PLAN } from "@/site-plan";
import { HouseHistoryDialog } from "./house-history";
import { useMyHouse } from "./my-house";

const SiteMap3D = lazy(() => import("@/components/site-map-3d"));
type View = "list" | "map" | "3d";
export type HouseRow = HouseMonthStats & { paymentPeriod?: BillingPeriod };
type Tone = "filled" | "partial" | "empty" | "unchecked" | "vacant";
const STYLES: Record<Tone, { card: string; paint: LotPaint; marker: MarkerState; roof: string }> = {
  filled: { card: "border-filled/40 bg-filled-soft text-filled", paint: { shape: "fill-filled-soft stroke-filled", text: "fill-filled" }, marker: "filled", roof: "#22c55e" },
  partial: { card: "border-warn/40 bg-warn-soft text-warn", paint: { shape: "fill-warn-soft stroke-warn", text: "fill-warn" }, marker: "unchecked", roof: "#fbbf24" },
  empty: { card: "border-empty/40 bg-empty-soft text-empty", paint: { shape: "fill-empty-soft stroke-empty", text: "fill-empty" }, marker: "empty", roof: "#f43f5e" },
  unchecked: { card: "border-dashed border-line text-muted", paint: { shape: "fill-card stroke-muted [stroke-dasharray:5_4]", text: "fill-muted" }, marker: "unchecked", roof: "#cbd5e1" },
  vacant: { card: "border-dashed border-line bg-idle-soft text-muted", paint: { shape: "fill-idle-soft stroke-muted [stroke-dasharray:5_4]", text: "fill-muted" }, marker: "vacant", roof: "#e2e8f0" },
};

/** Malam tanpa catatan tetap dibedakan dari wadah yang kosong. */
function summary(h: HouseRow) {
  const nights = h.filled + h.empty + h.unchecked;
  let tone: Tone;
  let label: string;
  let detail: string;
  if (h.status === "vacant") {
    tone = "vacant";
    label = "mudik";
    detail = "Tidak ikut pemeriksaan harian";
  } else if (h.paymentPeriod) {
    tone = h.paymentPeriod.status === "paid" ? "filled" : "empty";
    label = BILLING_LABEL[h.paymentPeriod.status];
    detail = `${CADENCE_LABEL[h.paymentPeriod.cadence]} · ${formatDateShort(h.paymentPeriod.start)} – ${formatDateShort(h.paymentPeriod.end)}`;
  } else {
    tone = !h.filled && !h.empty ? "unchecked" : h.filled === nights ? "filled" : !h.filled && h.empty ? "empty" : "partial";
    label = nights ? `${h.filled}/${nights} terisi` : "Belum berjalan";
    detail = !nights ? "Belum ada malam berjalan" : h.unchecked ? `${h.unchecked} belum dicatat` : h.empty ? `${h.empty} malam kosong` : "Semua malam terisi";
  }
  return { ...STYLES[tone], label, detail, description: `${label}. ${detail}` };
}

/** Ringkasan bulan yang sama di daftar, denah, dan maket, tanpa data identitas warga. */
export function HouseStatus({ perHouse, month, nights, through }: {
  perHouse: HouseRow[];
  month: string;
  nights: number;
  through: string;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("list");
  const [open, setOpen] = useState<HouseRow | null>(null);
  const [myHouse, setMyHouse] = useMyHouse();
  const mine = perHouse.find((h) => h.id === myHouse);
  const shown = query.trim() ? searchHouses(perHouse, query, perHouse.length) : perHouse;
  // Komponen denah memakai DTO rumah; nama dan token tidak dibutuhkan halaman warga.
  const mapHouses = shown.map((h) => ({ ...h, ownerName: null, token: "" }));
  const markers = Object.fromEntries(shown.map((h) => [h.id, summary(h).marker]));
  const paint = Object.fromEntries(shown.map((h) => [h.id, { ...summary(h).paint, note: summary(h).description }]));
  const roofColors = Object.fromEntries(shown.map((h) => [h.id, summary(h).roof]));
  const { notOnPlan } = matchPlan(SITE_PLAN, shown);
  const chooseHouse = (house: { id: number }) => setOpen(perHouse.find((h) => h.id === house.id) ?? null);

  return <>
    <SectionTitle>
      <span className="inline-flex items-center gap-1.5"><Home className="size-4" /> Status per rumah</span>
    </SectionTitle>
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{formatMonth(month)}</h2>
          <p className="mt-0.5 text-xs text-muted">{nights ? `${nights} malam berjalan · tanggal 1–${Number(through.slice(8))}` : "Belum ada malam berjalan"}</p>
        </div>
        <SegmentedControl
          aria-label="Tampilan status rumah"
          value={view}
          onValueChange={setView}
          size="sm"
          className="max-sm:w-full"
          fill
          options={[
            { value: "list", label: "Daftar", icon: Grid2X2 },
            { value: "map", label: "Denah", icon: Map },
            { value: "3d", label: "3D", icon: Box },
          ]}
        />
      </div>
      <p className="text-sm text-muted">Harian dihitung sejak tanggal 1, dengan waktu malam pukul 20.00–00.00 WIB. Malam hari ini masuk hitungan mulai pukul 20.00. Mingguan/bulanan mengikuti pembayaran periode. Ketuk rumah untuk melihat kalender.</p>
      {mine && (
        <Button variant="plain" onClick={() => setOpen(mine)} className="flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-left">
          <Star className="size-5 shrink-0 fill-current text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Rumah saya · {houseLabel(mine)}</span>
            <span className="block text-xs text-muted">{summary(mine).description}</span>
          </span>
          <ChevronRight className="size-4 text-primary" aria-hidden />
        </Button>
      )}
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari rumah, mis. AD3" aria-label="Cari rumah" className="pl-10" />
      </label>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Tidak ada rumah yang cocok.</p>
      ) : view === "list" ? (
        <HouseGrid houses={shown} myHouse={myHouse} onSelect={setOpen} />
      ) : (
        <>
          {view === "map" ? (
            <SitePlanMap plan={SITE_PLAN} houses={mapHouses} paint={paint} selectedId={myHouse} onHouseClick={chooseHouse} fitToView />
          ) : (
            <Suspense fallback={<p className="py-16 text-center text-sm text-muted">Memuat denah 3D…</p>}>
              <SiteMap3D plan={SITE_PLAN} houses={mapHouses} markers={markers} roofColors={roofColors} houseActionLabel="Ketuk rumah untuk melihat riwayat." onHouseClick={chooseHouse} />
            </Suspense>
          )}
          {notOnPlan.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted">Rumah di luar denah</p>
              <HouseGrid houses={notOnPlan} myHouse={myHouse} onSelect={setOpen} />
            </div>
          )}
        </>
      )}
      <Legend className="border-t border-line pt-3">
        <LegendItem swatch="bg-filled-soft border-filled/40">Semua terisi / lunas</LegendItem>
        <LegendItem swatch="bg-warn-soft border-warn/40">Sebagian terisi</LegendItem>
        <LegendItem swatch="bg-empty-soft border-empty/40">Kosong / belum bayar</LegendItem>
        <LegendItem swatch="border-dashed border-muted/60">Belum dicatat</LegendItem>
        <LegendItem swatch="bg-idle-soft border-dashed border-muted/60">Mudik</LegendItem>
      </Legend>
    </Card>
    <HouseHistoryDialog
      houseId={open?.id ?? null}
      label={open ? houseLabel(open) : ""}
      month={month}
      onClose={() => setOpen(null)}
      myHouse={myHouse}
      onMyHouse={setMyHouse}
    />
  </>;
}

function HouseGrid({ houses, myHouse, onSelect }: { houses: HouseRow[]; myHouse: number | null; onSelect: (h: HouseRow) => void }) {
  return <div className="space-y-4">
    {groupByBlock(houses).map(([block, list]) => (
      <section key={block} aria-label={`Blok ${block}`}>
        <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
          Blok {block}<span className="text-xs font-normal text-muted">{list.length} rumah</span>
        </h3>
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {list.map((h) => {
            const state = summary(h);
            return <li key={h.id}>
              <Button
                variant="plain"
                onClick={() => onSelect(h)}
                aria-label={`${houseLabel(h)}: ${state.description}. Lihat riwayat`}
                title={state.description}
                className={cx("relative min-h-16 w-full rounded-lg border px-1 py-2 text-center transition hover:brightness-95", state.card, h.id === myHouse && "ring-2 ring-primary ring-offset-1 ring-offset-card")}
              >
                <span className="block text-sm font-bold">{h.number}</span>
                <span className="mt-0.5 block text-[10px] leading-tight">{state.label}</span>
              </Button>
            </li>;
          })}
        </ul>
      </section>
    ))}
  </div>;
}
