import { ChevronLeft, ChevronRight, Hand, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareRecap } from "@/components/share-recap";
import { SiteMap, type MarkerState } from "@/components/site-map";
import { SitePlanMap } from "@/components/site-plan-map";
import { Card, PageHeader, cx } from "@/components/ui";
import { addDays, formatDateLong, formatTime, isIsoDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { groupByBlock, houseLabel } from "@/lib/houses";
import { buildRecapText, summarize } from "@/lib/recap";
import { requireUser } from "@/server/auth";
import { getCollectionsForDate, getSettings, getSiteMapInfo, listHouses } from "@/server/queries";
import { SITE_PLAN } from "@/site-plan";
import { CorrectionForm } from "./correction-form";

export async function generateMetadata({ params }: PageProps<"/riwayat/[tanggal]">): Promise<Metadata> {
  const { tanggal } = await params;
  return { title: isIsoDate(tanggal) ? formatDateLong(tanggal) : "Riwayat" };
}

export default async function RiwayatDetailPage({ params }: PageProps<"/riwayat/[tanggal]">) {
  const user = await requireUser();
  const { tanggal: date } = await params;
  if (!isIsoDate(date)) notFound();

  const [houses, collections, settings, siteMap] = await Promise.all([
    listHouses(),
    getCollectionsForDate(date),
    getSettings(),
    getSiteMapInfo(),
  ]);
  const summary = summarize(houses, collections);
  const byHouse = new Map(collections.map((c) => [c.houseId, c]));
  const hasMap = SITE_PLAN !== null || houses.some((h) => h.mapX != null && h.mapY != null);
  const markers: Record<number, MarkerState> = Object.fromEntries(
    houses.map((h) => [h.id, byHouse.get(h.id)?.status ?? (h.status === "vacant" ? "vacant" : "unchecked")]),
  );
  const isAdmin = user.role === "admin";

  return (
    <>
      <div className="mb-2 flex items-center justify-between text-sm">
        <Link href={`/riwayat/${addDays(date, -1)}`} className="flex items-center gap-1 text-muted">
          <ChevronLeft className="size-4" /> Sebelumnya
        </Link>
        <Link href="/riwayat" className="text-muted">
          Semua
        </Link>
        <Link href={`/riwayat/${addDays(date, 1)}`} className="flex items-center gap-1 text-muted">
          Berikutnya <ChevronRight className="size-4" />
        </Link>
      </div>
      <PageHeader title={formatDateLong(date)} subtitle={`Jimpitan ${settings.communityName}`} />

      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Ada" value={summary.filled.length} className="text-filled" />
          <Stat label="Kosong" value={summary.empty.length} className="text-empty" />
          <Stat label="Belum dicek" value={summary.unchecked.length} />
        </div>
        <p className="mt-3 text-center text-2xl font-bold">{formatRupiah(summary.total)}</p>
        {summary.collectors.length > 0 && (
          <p className="text-center text-sm text-muted">Petugas: {summary.collectors.join(", ")}</p>
        )}
        <ShareRecap
          className="mt-4"
          text={buildRecapText({ communityName: settings.communityName, date, houses, collections })}
        />
      </Card>

      {hasMap && (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-primary">
            <span className="group-open:hidden">Lihat di denah</span>
            <span className="hidden group-open:inline">Sembunyikan denah</span>
          </summary>
          {SITE_PLAN ? (
            <SitePlanMap className="mt-2" plan={SITE_PLAN} houses={houses} markers={markers} />
          ) : (
            <SiteMap className="mt-2" houses={houses} size={siteMap} imageUrl={siteMap.imageUrl} markers={markers} />
          )}
        </details>
      )}

      {houses.length === 0 && <p className="mt-6 text-center text-muted">Belum ada data rumah.</p>}

      {groupByBlock(houses).map(([block, list]) => (
        <section key={block} className="mt-6">
          <h2 className="mb-2 font-semibold">Blok {block}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {list.map((h) => {
              const c = byHouse.get(h.id);
              return (
                <li key={h.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-14 shrink-0 font-bold">{houseLabel(h)}</span>
                    <div className="min-w-0 flex-1">
                      {h.ownerName && <p className="truncate text-sm">{h.ownerName}</p>}
                      {c && (
                        <p className="flex items-center gap-1 text-xs text-muted">
                          {c.method === "scan" ? (
                            <ScanLine className="size-3.5" role="img" aria-label="scan QR" />
                          ) : (
                            <Hand className="size-3.5" role="img" aria-label="manual" />
                          )}
                          {formatTime(c.recordedAt)}
                          {c.collectorName && ` · ${c.collectorName}`}
                        </p>
                      )}
                    </div>
                    <StatusBadge
                      status={c?.status ?? (h.status === "vacant" ? "vacant" : "none")}
                      amount={c?.amount ?? 0}
                    />
                  </div>
                  {isAdmin && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted">Koreksi</summary>
                      <CorrectionForm
                        date={date}
                        houseId={h.id}
                        status={c?.status ?? "none"}
                        amount={c?.amount ?? 0}
                        defaultAmount={settings.defaultAmount}
                      />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <p className={cx("text-2xl font-bold", className)}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function StatusBadge({ status, amount }: { status: "filled" | "empty" | "vacant" | "none"; amount: number }) {
  const styles = {
    filled: "bg-filled-soft text-filled",
    empty: "bg-empty-soft text-empty",
    vacant: "border border-dashed border-line text-muted",
    none: "bg-idle-soft text-muted",
  }[status];
  const label = {
    filled: formatRupiah(amount),
    empty: "Kosong",
    vacant: "Mudik",
    none: "Belum",
  }[status];
  return <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", styles)}>{label}</span>;
}
