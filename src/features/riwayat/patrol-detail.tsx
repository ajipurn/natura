import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Hand, ScanLine } from "lucide-react";
import { Link, useParams } from "react-router";
import { ErrorCard, QueryState } from "@/components/query-state";
import { ShareRecap } from "@/components/share-recap";
import { SitePlanMap } from "@/components/site-plan-map";
import { Card, PageHeader, cx } from "@/components/ui";
import { addDays, formatDateLong, formatTime, isIsoDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { MarkerState } from "@/lib/house-state";
import { groupByBlock, houseLabel } from "@/lib/houses";
import { buildRecapText, summarize } from "@/lib/recap";
import { SITE_PLAN } from "@/site-plan";
import { CorrectionForm } from "./correction-form";
import { patrolQuery } from "./queries";

/** Detail satu malam ronda (alamat `${basePath}/:tanggal`). Admin bisa mengoreksi catatan. */
export function PatrolDetail({ basePath, canCorrect }: { basePath: string; canCorrect: boolean }) {
  const date = useParams().tanggal ?? "";
  const valid = isIsoDate(date);
  const query = useQuery({ ...patrolQuery(date), enabled: valid });

  return (
    <>
      <div className="mb-2 flex items-center justify-between text-sm">
        <Link to={`${basePath}/${addDays(valid ? date : "2000-01-01", -1)}`} className="flex items-center gap-1 text-muted">
          <ChevronLeft className="size-4" /> Sebelumnya
        </Link>
        <Link to={basePath} className="text-muted">
          Semua
        </Link>
        <Link to={`${basePath}/${addDays(valid ? date : "2000-01-01", 1)}`} className="flex items-center gap-1 text-muted">
          Berikutnya <ChevronRight className="size-4" />
        </Link>
      </div>
      {!valid ? (
        <ErrorCard message="Tanggal tidak valid." />
      ) : (
        <QueryState query={query}>
          {({ houses, collections, settings }) => {
            const summary = summarize(houses, collections);
            const byHouse = new Map(collections.map((c) => [c.houseId, c]));
            const markers: Record<number, MarkerState> = Object.fromEntries(
              houses.map((h) => [h.id, byHouse.get(h.id)?.status ?? (h.status === "vacant" ? "vacant" : "unchecked")]),
            );
            return (
              <>
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

                {houses.length > 0 && (
                  <details className="group mt-4">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-primary">
                      <span className="group-open:hidden">Lihat di denah</span>
                      <span className="hidden group-open:inline">Sembunyikan denah</span>
                    </summary>
                    <SitePlanMap className="mt-2" plan={SITE_PLAN} houses={houses} markers={markers} />
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
                            {canCorrect && (
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
          }}
        </QueryState>
      )}
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
