import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, CloudOff, QrCode, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { guardColorClass } from "@/components/guard-color-class";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, cx } from "@/components/ui";
import { addDays, formatDateLong, formatTime, isIsoDate, rondaDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { auditQuery } from "./queries";

type Filter = "semua" | "scan" | "manual" | "koreksi" | "luar";

const METHOD_LABEL = { scan: "Scan QR", manual: "Manual", koreksi: "Koreksi admin" } as const;

/** Catatan yang baru sampai di server lebih dari 5 menit setelah dicatat (HP sempat offline). */
const LATE_SYNC_MS = 5 * 60 * 1000;

export function AuditPage() {
  const [params] = useSearchParams();
  const tonight = rondaDate(new Date());
  const tanggal = params.get("tanggal") ?? "";
  const date = isIsoDate(tanggal) && tanggal <= tonight ? tanggal : tonight;
  const query = useQuery({ ...auditQuery(date), placeholderData: (previous) => previous });
  const [filter, setFilter] = useState<Filter>("semua");

  return (
    <>
      <PageHeader title="Audit catatan" subtitle={`Malam ${formatDateLong(date)}`} />
      <div className="mb-4 flex items-center justify-between text-sm">
        <Link to={`/admin/audit?tanggal=${addDays(date, -1)}`} className="flex items-center gap-1 text-muted">
          <ChevronLeft className="size-4" /> Malam sebelumnya
        </Link>
        {date < tonight && (
          <Link to={`/admin/audit?tanggal=${addDays(date, 1)}`} className="flex items-center gap-1 text-muted">
            Malam berikutnya <ChevronRight className="size-4" />
          </Link>
        )}
      </div>

      <QueryState query={query}>
        {(data) => {
          const shown = data.logs.filter((l) =>
            filter === "semua" ? true : filter === "luar" ? l.onDuty === false : l.method === filter,
          );
          const filters: { value: Filter; label: string; count: number }[] = [
            { value: "semua", label: "Semua", count: data.logs.length },
            { value: "scan", label: "Scan QR", count: data.counts.scan },
            { value: "manual", label: "Manual", count: data.logs.filter((l) => l.method === "manual").length },
            { value: "koreksi", label: "Koreksi admin", count: data.logs.filter((l) => l.method === "koreksi").length },
            { value: "luar", label: "Di luar jadwal", count: data.counts.offDuty },
          ];
          return (
            <div className={cx("space-y-4", query.isPlaceholderData && "opacity-60")}>
              {data.offDuty.length > 0 && (
                <p className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Dicatat oleh petugas yang <strong>tidak dijadwalkan</strong> malam ini:{" "}
                    {data.offDuty.map((r) => `${r.name} (${r.count} catatan)`).join(", ")}.
                  </span>
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
                <Card>
                  <h2 className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="size-5 text-primary" /> Petugas jaga
                  </h2>
                  {data.guards.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">Tidak ada petugas berakun yang dijadwalkan.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-line">
                      {data.guards.map((g) => (
                        <li key={g.userId} className="flex items-center gap-2 py-2 text-sm">
                          <span aria-hidden className={cx("size-3 shrink-0 rounded-full", guardColorClass(g.color))} />
                          <span className="min-w-0 flex-1 truncate">
                            <strong>{g.name}</strong>
                            {g.house && <span className="text-muted"> · {g.house}</span>}
                          </span>
                          {g.count > 0 ? (
                            <span className="shrink-0 rounded-full bg-filled-soft px-2 py-0.5 text-xs font-semibold text-filled">
                              {g.count} catatan
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-idle-soft px-2 py-0.5 text-xs text-muted">belum mencatat</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted">Menurut jadwal sekarang. Tanda di tiap catatan memakai jadwal saat catatan diterima.</p>
                </Card>

                <div className="min-w-0">
                  <div role="tablist" aria-label="Saring catatan" className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
                    {filters.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        role="tab"
                        aria-selected={filter === f.value}
                        onClick={() => setFilter(f.value)}
                        className={cx(
                          "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                          filter === f.value ? "border-primary bg-primary text-primary-fg" : "border-line bg-card",
                          f.value === "luar" && f.count > 0 && filter !== f.value && "border-warn/50 text-warn",
                        )}
                      >
                        {f.label} {f.count}
                      </button>
                    ))}
                  </div>

                  {shown.length === 0 ? (
                    <Card className="text-center text-sm text-muted">
                      {data.logs.length === 0 ? "Belum ada catatan malam ini." : "Tidak ada catatan untuk saringan ini."}
                    </Card>
                  ) : (
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                      {shown.map((l) => {
                        const late = new Date(l.syncedAt).getTime() - new Date(l.recordedAt).getTime() > LATE_SYNC_MS;
                        return (
                          <li key={l.id} className="flex items-start gap-3 px-4 py-3">
                            <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums">{formatTime(l.recordedAt)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block">
                                <strong>
                                  {l.block}-{l.number}
                                </strong>
                                {l.ownerName && <span className="text-muted"> · {l.ownerName}</span>}
                                <span
                                  className={cx(
                                    "ml-2 text-sm font-semibold",
                                    l.status === "filled" ? "text-filled" : l.status === "empty" ? "text-empty" : "text-muted",
                                  )}
                                >
                                  {l.status === "filled" ? formatRupiah(l.amount) : l.status === "empty" ? "Kosong" : "Dihapus"}
                                </span>
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                                <span>oleh {l.userName ?? "—"}</span>
                                <span className="inline-flex items-center gap-1">
                                  {l.method === "scan" && <QrCode className="size-3.5" />}
                                  {METHOD_LABEL[l.method]}
                                </span>
                                {late && (
                                  <span className="inline-flex items-center gap-1" title="HP sempat offline; catatan terkirim belakangan">
                                    <CloudOff className="size-3.5" /> terkirim {formatTime(l.syncedAt)}
                                  </span>
                                )}
                              </span>
                            </span>
                            {l.onDuty === true && (
                              <span className="shrink-0 rounded-full bg-filled-soft px-2 py-0.5 text-xs font-semibold text-filled">Jaga</span>
                            )}
                            {l.onDuty === false && (
                              <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
                                Tidak dijadwalkan
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
