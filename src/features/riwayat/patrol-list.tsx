import { useQuery } from "@tanstack/react-query";
import { ChevronRight, History, Users } from "lucide-react";
import { Link } from "react-router";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader } from "@/components/ui";
import { formatDateLong, formatMonth } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { patrolsQuery } from "./queries";

const percent = (part: number, whole: number) => (whole ? Math.min(100, (part / whole) * 100) : 0);

/** Daftar malam ronda per bulan. `basePath` = alamat halaman ini di app (mis. /petugas/riwayat). */
export function PatrolList({ basePath }: { basePath: string }) {
  const query = useQuery(patrolsQuery);
  // Rekap bulanan hanya ada di dashboard admin.
  const rekapPath = basePath.startsWith("/admin") ? "/admin/rekap" : null;

  return (
    <>
      <PageHeader title="Riwayat ronda" subtitle="Malam-malam ronda yang tercatat (90 terakhir)" />
      <QueryState query={query}>
        {({ patrols, activeHouses, today }) => {
          if (patrols.length === 0) {
            return (
              <Card className="py-10 text-center">
                <History className="mx-auto size-10 text-muted" />
                <p className="mt-2 font-semibold">Belum ada catatan ronda</p>
                <p className="mt-1 text-sm text-muted">Malam ronda muncul di sini setelah petugas mencatat rumah pertama.</p>
              </Card>
            );
          }
          const months = [...new Set(patrols.map((p) => p.date.slice(0, 7)))];
          return (
            <div className="space-y-6">
              {months.map((month) => {
                const nights = patrols.filter((p) => p.date.startsWith(month));
                const total = nights.reduce((sum, p) => sum + p.total, 0);
                return (
                  <section key={month} aria-label={formatMonth(month)}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                      <h2 className="font-semibold">{formatMonth(month)}</h2>
                      <p className="text-sm text-muted">
                        {nights.length} malam · <span className="font-semibold text-fg">{formatRupiah(total)}</span>
                        {rekapPath && (
                          <>
                            {" · "}
                            <Link to={`${rekapPath}?bulan=${month}`} className="font-semibold text-primary">
                              Rekap
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                      {nights.map((p) => {
                        const unchecked = Math.max(0, activeHouses - p.filled - p.empty);
                        return (
                          <li key={p.date}>
                            <Link to={`${basePath}/${p.date}`} className="flex items-center gap-3 px-4 py-3 hover:bg-idle-soft/60 active:bg-idle-soft">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="font-semibold">
                                    {formatDateLong(p.date)}
                                    {p.date === today && (
                                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                        Malam ini
                                      </span>
                                    )}
                                  </span>
                                  <span className="shrink-0 font-bold tabular-nums">{formatRupiah(p.total)}</span>
                                </div>
                                <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-idle-soft" aria-hidden>
                                  <div className="h-full bg-filled" style={{ width: `${percent(p.filled, activeHouses)}%` }} />
                                  <div className="h-full bg-empty" style={{ width: `${percent(p.empty, activeHouses)}%` }} />
                                </div>
                                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                                  <span className="text-filled">{p.filled} ada</span>
                                  <span>·</span>
                                  <span className="text-empty">{p.empty} kosong</span>
                                  {unchecked > 0 && (
                                    <>
                                      <span>·</span>
                                      <span>{unchecked} belum dicek</span>
                                    </>
                                  )}
                                </p>
                                {p.collectors && (
                                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                                    <Users className="size-3.5 shrink-0" aria-hidden /> {p.collectors}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="size-5 shrink-0 text-muted" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
