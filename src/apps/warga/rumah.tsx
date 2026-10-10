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
import { PaymentNotice } from "@/components/payment-notice";
import { PAYMENT_LABEL } from "@/lib/payments";
import { petugasPath, wargaPath } from "@/lib/app-paths";
import { DEFAULT_LOGO_URL } from "@/lib/branding";
import { canRonda } from "@/lib/permissions";

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
        {({ communityName, logoUrl, defaultAmount, tonight, canRecord, house, history, user, paymentInfo }) => {
          const month = tonight.slice(0, 7);
          const thisMonth = history.filter((h) => h.date.startsWith(month));
          const monthFilled = thisMonth.filter((h) => h.status === "filled");
          const monthTotal = monthFilled.reduce((sum, h) => sum + (h.amount ?? 0), 0);
          const tonightRow = history.find((h) => h.date === tonight);
          const current = tonightRow?.status ? { status: tonightRow.status, amount: tonightRow.amount ?? 0 } : null;
          return (
            <>
              <PageTitle title={houseLabelLong(house)} />
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <img src={logoUrl ?? DEFAULT_LOGO_URL} alt="" className="size-8 shrink-0 rounded-md object-contain" />
                Jimpitan {communityName}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">{houseLabelLong(house)}</h1>
              {house.ownerName && <p className="text-muted">{house.ownerName}</p>}
              {house.status === "active" && <div className="mt-4"><PaymentNotice period={paymentInfo.periods.find((p) => p.start <= tonight && p.end >= tonight)} cell={paymentInfo.tonight} /></div>}
              {house.status === "vacant" && (
                <p className="mt-2 inline-block rounded-full bg-warn-soft px-3 py-1 text-sm text-warn">
                  Ditandai rumah kosong/mudik
                </p>
              )}

              {user && canRonda(user.role) && (
                <Card className="mt-5">
                  <p className="flex items-center gap-2 font-semibold">
                    <ScanLine className="size-5 text-primary" /> Catat malam ini
                  </p>
                  {canRecord ? (
                    <><p className="mt-2 text-xs text-muted">Catat uang yang benar-benar diambil malam ini. Pembayaran periode sudah tercatat terpisah.</p><QuickRecord token={house.token} defaultAmount={defaultAmount} current={current} /></>
                  ) : (
                    <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                      Bukan jadwal jagamu malam ini ({dayLabel(scheduleDay(tonight))}). Catatan hanya bisa diisi petugas
                      yang jaga.{" "}
                      <a href={petugasPath("/jadwal")} className="font-semibold underline">
                        Lihat jadwal
                      </a>
                    </p>
                  )}
                </Card>
              )}

              <Card className="mt-5">
                <p className="text-sm text-muted">{formatMonth(month)}</p>
                <p className="text-xs text-muted">Dari ronda</p>
                <div className="mt-1 flex items-baseline justify-between">
                  <p>
                    <strong className="text-2xl">{monthFilled.length}</strong>
                    <span className="text-muted"> / {thisMonth.length} malam ada isinya</span>
                  </p>
                  <p className="text-xl font-bold">{formatRupiah(monthTotal)}</p>
                </div>
              </Card>

              {paymentInfo.receipts.length > 0 && <Card className="mt-5"><h2 className="font-semibold">Pembayaran jimpitan</h2><ul className="mt-3 space-y-3">{paymentInfo.receipts.map((p, i) => <li key={i} className="text-sm"><p className="flex flex-wrap justify-between gap-2"><span>{PAYMENT_LABEL[p.cadence]}</span><strong>{formatRupiah(p.amount)}</strong></p><p className="text-xs text-muted">Untuk {p.allocations ? p.allocations.map(([date]) => `${formatDateShort(date)} ${date.slice(0, 4)}`).join(", ") : `${formatDateShort(p.periodStart)} – ${formatDateShort(p.periodEnd)} ${p.periodEnd.slice(0, 4)}`} · diterima {formatDateShort(p.receivedDate)}.</p></li>)}</ul></Card>}

              <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">30 malam terakhir</h2>
              {history.length === 0 ? (
                <Card className="text-center text-muted">Belum ada catatan ronda.</Card>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {history.map((h) => {
                    const payment = paymentInfo.cells?.[h.date];
                    const rapel = (payment?.rapelAmount ?? 0) > 0 && payment?.paid;
                    return (
                    <li key={h.date} className="flex items-center justify-between px-4 py-2.5">
                      <span>{formatDateShort(h.date)}</span>
                      <span
                        title={rapel ? "Dibayar rapel; catatan ronda asli tetap " + (h.status === "filled" ? "terisi" : "kosong") + "." : undefined}
                        className={cx(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          (h.status === "filled" || rapel) && "bg-filled-soft text-filled",
                          h.status === "empty" && !rapel && "bg-empty-soft text-empty",
                          !h.status && !rapel && "bg-idle-soft text-muted",
                        )}
                      >
                        {rapel ? `Rapel · ${formatRupiah(payment?.rapelAmount ?? 0)}` : h.status === "filled" ? formatRupiah(h.amount ?? 0) : h.status === "empty" ? "Kosong" : "Tidak dicek"}
                      </span>
                    </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-8 flex flex-col items-center gap-2 text-center">
                {user && canRonda(user.role) ? (
                  <a href={petugasPath("/ronda")} className={buttonClass("secondary")}>
                    Buka Ronda
                  </a>
                ) : !user && (
                  <a href={petugasPath(`/masuk?next=${encodeURIComponent(`/r/${house.token}`)}`)} className={cx(buttonClass("ghost", "sm"))}>
                    <LogIn className="size-4" /> Petugas ronda? Masuk
                  </a>
                )}
                <a href={wargaPath()} className="text-sm font-semibold text-primary">
                  Beranda app
                </a>
              </div>
            </>
          );
        }}
      </QueryState>
    </main>
  );
}
