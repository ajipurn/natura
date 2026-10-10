import { ChevronRight, House, ScanLine } from "lucide-react";
import { Link } from "react-router";
import { Card, cx } from "@/components/ui";
import type { Dashboard } from "@/server/dashboard";
import { adminPath } from "@/lib/app-paths";

/** Status rumah mencakup pembayaran otomatis; progres pemeriksaan hanya untuk rumah harian. */
export function TonightCard({ tonight: t, date }: { tonight: Dashboard["tonight"]; date: string }) {
  const percent = (count: number) => t.expected ? count / t.expected * 100 : 0;
  return (
    <section aria-label="Ronda malam ini">
      <Card className="h-full">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Ronda malam ini</h2>
          <Link to={adminPath(`/riwayat/${date}`)} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Detail <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>

        {t.expected > 0 ? (
          <>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted">
              <span>Status jimpitan · {t.expected} rumah aktif</span>
              <span className="tabular-nums">{t.checked}/{t.expected} berstatus</span>
            </div>
            <div
              className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-idle-soft"
              role="progressbar"
              aria-label="Status jimpitan malam ini"
              aria-valuemin={0}
              aria-valuemax={t.expected}
              aria-valuenow={t.checked}
              aria-valuetext={`${t.filled} ada, ${t.empty} kosong, ${t.unchecked} belum dicek. ${t.automatic} status otomatis.`}
            >
              {t.filled > 0 && <div className="h-full bg-filled" style={{ width: `${percent(t.filled)}%` }} />}
              {t.empty > 0 && <div className="h-full bg-empty" style={{ width: `${percent(t.empty)}%` }} />}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <StatusCount label="Ada" count={t.filled} dot="bg-filled" color="text-filled" />
              <StatusCount label="Kosong" count={t.empty} dot="bg-empty" color="text-empty" />
              <StatusCount label="Belum dicek" count={t.unchecked} dot="bg-idle-soft border border-muted/40" color="text-fg" />
            </dl>
          </>
        ) : <p className="mt-3 rounded-xl bg-idle-soft px-3 py-4 text-sm text-muted">Belum ada rumah aktif.</p>}

        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex items-start gap-2.5">
            <ScanLine className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-medium">Pemeriksaan harian</h3>
                {t.daily.expected > 0 && <span className="text-sm font-semibold tabular-nums">{t.daily.checked}/{t.daily.expected} dicek</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted">{!t.daily.expected ? "Tidak ada rumah harian; tidak perlu scan." : t.daily.unchecked ? `${t.daily.unchecked} rumah harian belum dicek.` : "Semua rumah harian sudah dicek."}</p>
            </div>
          </div>
          {t.automatic > 0 && (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted">
              <span className="font-medium text-fg">{t.automatic} rumah dengan pembayaran periode otomatis.</span> Hijau jika sudah bayar, merah jika belum; tidak wajib discan.
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-xs text-muted">
            <p>{t.collectors.length ? `Dicatat oleh ${t.collectors.join(", ")}` : "Belum ada catatan petugas malam ini."}</p>
            {t.vacant > 0 && <span className="inline-flex items-center gap-1.5"><House className="size-3.5" aria-hidden />{t.vacant} mudik</span>}
          </div>
        </div>
      </Card>
    </section>
  );
}

function StatusCount({ label, count, dot, color }: { label: string; count: number; dot: string; color: string }) {
  return (
    <div className="rounded-xl bg-idle-soft/50 px-3 py-2.5">
      <dt className="flex min-h-8 items-start gap-1.5 text-xs text-muted sm:min-h-0 sm:items-center"><span className={cx("mt-1 size-2 shrink-0 rounded-full sm:mt-0", dot)} aria-hidden />{label}</dt>
      <dd className={cx("mt-1 text-2xl font-bold tabular-nums", count ? color : "text-muted")}>{count}</dd>
    </div>
  );
}
