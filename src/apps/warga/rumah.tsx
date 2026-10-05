import { useQuery } from "@tanstack/react-query";
import { LogIn, ScanLine } from "lucide-react";
import { useParams } from "react-router";
import { api, call } from "@/client/api";
import { QueryState } from "@/components/query-state";
import { Card, PageTitle, buttonClass, cx } from "@/components/ui";
import { formatDateShort, formatMonth } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { houseLabelLong } from "@/lib/houses";
import { dayLabel, scheduleDay } from "@/lib/schedule";
import { QuickRecord } from "./quick-record";

/** Halaman yang terbuka saat QR rumah di-scan pakai kamera HP biasa. */
export function HousePage() {
  const token = useParams().token ?? "";
  const query = useQuery({
    queryKey: ["rumah", token],
    queryFn: () => call(api.rumah[":token"].$get({ param: { token } })),
  });

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <QueryState query={query}>
        {({ communityName, defaultAmount, tonight, canRecord, house, history, user }) => {
          const month = tonight.slice(0, 7);
          const thisMonth = history.filter((h) => h.date.startsWith(month));
          const monthFilled = thisMonth.filter((h) => h.status === "filled");
          const monthTotal = monthFilled.reduce((sum, h) => sum + (h.amount ?? 0), 0);
          const tonightRow = history.find((h) => h.date === tonight);
          const current = tonightRow?.status ? { status: tonightRow.status, amount: tonightRow.amount ?? 0 } : null;
          return (
            <>
              <PageTitle title={houseLabelLong(house)} />
              <p className="text-sm font-medium text-primary">Jimpitan {communityName}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">{houseLabelLong(house)}</h1>
              {house.ownerName && <p className="text-muted">{house.ownerName}</p>}
              {house.status === "vacant" && (
                <p className="mt-2 inline-block rounded-full bg-warn-soft px-3 py-1 text-sm text-warn">
                  Ditandai rumah kosong/mudik
                </p>
              )}

              {user && (
                <Card className="mt-5">
                  <p className="flex items-center gap-2 font-semibold">
                    <ScanLine className="size-5 text-primary" /> Catat malam ini
                  </p>
                  {canRecord ? (
                    <QuickRecord token={house.token} defaultAmount={defaultAmount} current={current} />
                  ) : (
                    <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                      Bukan jadwal jagamu malam ini ({dayLabel(scheduleDay(tonight))}). Catatan hanya bisa diisi petugas
                      yang jaga.{" "}
                      <a href="/petugas/jadwal" className="font-semibold underline">
                        Lihat jadwal
                      </a>
                    </p>
                  )}
                </Card>
              )}

              <Card className="mt-5">
                <p className="text-sm text-muted">{formatMonth(month)}</p>
                <div className="mt-1 flex items-baseline justify-between">
                  <p>
                    <strong className="text-2xl">{monthFilled.length}</strong>
                    <span className="text-muted"> / {thisMonth.length} malam ada isinya</span>
                  </p>
                  <p className="text-xl font-bold">{formatRupiah(monthTotal)}</p>
                </div>
              </Card>

              <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">30 malam terakhir</h2>
              {history.length === 0 ? (
                <Card className="text-center text-muted">Belum ada catatan ronda.</Card>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {history.map((h) => (
                    <li key={h.date} className="flex items-center justify-between px-4 py-2.5">
                      <span>{formatDateShort(h.date)}</span>
                      <span
                        className={cx(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          h.status === "filled" && "bg-filled-soft text-filled",
                          h.status === "empty" && "bg-empty-soft text-empty",
                          !h.status && "bg-idle-soft text-muted",
                        )}
                      >
                        {h.status === "filled" ? formatRupiah(h.amount ?? 0) : h.status === "empty" ? "Kosong" : "Tidak dicek"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-8 flex flex-col items-center gap-2 text-center">
                {user ? (
                  <a href="/petugas/" className={buttonClass("secondary")}>
                    Ke app petugas
                  </a>
                ) : (
                  <a href={`/petugas/masuk?next=${encodeURIComponent(`/r/${house.token}`)}`} className={cx(buttonClass("ghost", "sm"))}>
                    <LogIn className="size-4" /> Petugas ronda? Masuk
                  </a>
                )}
                <a href="/" className="text-sm font-semibold text-primary">
                  Info warga
                </a>
              </div>
            </>
          );
        }}
      </QueryState>
    </main>
  );
}
