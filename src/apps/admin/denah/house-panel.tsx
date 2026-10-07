import { useQuery } from "@tanstack/react-query";
import { Hand, PenLine, Pencil, ScanLine, Table2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { PaymentNotice } from "@/components/payment-notice";
import { ScrollArea } from "@/components/scroll-area";
import { Button, Card, buttonClass, cx } from "@/components/ui";
import { CorrectionDialog } from "@/features/riwayat/correction-form";
import { formatDateShort, formatMonth, formatTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { houseLabel, type HouseRef } from "@/lib/houses";
import { CADENCE_LABEL, type BillingPeriod } from "@/lib/payments";
import { monthHouseNights } from "@/lib/month-summary";
import { monthStats } from "@/lib/month-stats";
import type { CollectionDTO, HouseDTO } from "@/lib/types";
import { recapQuery } from "../queries";

/**
 * Denah + panel samping. Di layar lebar panel menempel di kanan; di layar sempit panel ada di
 * bawah denah dan digulir ke layar saat rumah dipilih.
 */
export function MapWithPanel({
  map,
  panel,
  selectedId,
}: {
  map: ReactNode;
  panel: ReactNode;
  selectedId: number | null;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedId === null || window.matchMedia("(min-width: 80rem)").matches)
      return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    panelRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "nearest",
    });
  }, [selectedId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
      <div className="min-w-0 space-y-3">{map}</div>
      <aside ref={panelRef} className="scroll-mt-20 xl:sticky xl:top-6">
        <ScrollArea className="xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
          {panel}
        </ScrollArea>
      </aside>
    </div>
  );
}

/** Daftar rumah yang bisa diketuk untuk dipilih di denah (mis. "Belum dicek", "Paling sering kosong"). */
export function HouseChips<H extends HouseRef & { id: number }>({
  title,
  houses,
  empty,
  onSelect,
  render,
}: {
  title: string;
  houses: H[];
  empty: string;
  onSelect: (id: number) => void;
  render?: (house: H) => ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title} <span className="font-normal">· {houses.length}</span>
      </h3>
      {houses.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {houses.map((h) => (
            <Button
              key={h.id}
              variant="plain"
              onClick={() => onSelect(h.id)}
              className="rounded-full border border-line px-2.5 py-0.5 text-sm font-semibold tabular-nums hover:border-primary/50"
            >
              {render ? render(h) : houseLabel(h)}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Ringkasan satu rumah: catatan malam ini (kalau `tonight` diisi) dan semua malam di `month`.
 * Tiap kotak malam membuka detail malam itu di Riwayat.
 */
export function HousePanel({
  house,
  month,
  tonight,
  onClose,
}: {
  house: HouseDTO;
  month: string;
  /** Mode malam ini: catatan rumah ini malam ini, bisa diisi/diubah admin. */
  tonight?: {
    date: string;
    collection: CollectionDTO | null;
    defaultAmount: number;
    period?: BillingPeriod;
  };
  onClose: () => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  // Mode malam ini: ikut diperbarui seperti denahnya, supaya kotak malam ini tidak tertinggal.
  const recap = useQuery({
    ...recapQuery(month),
    refetchInterval: tonight ? 30_000 : false,
  });
  const nights = recap.data ? monthHouseNights(recap.data, house) : null;
  const stats = recap.data ? monthStats(recap.data).perHouse.find((h) => h.id === house.id) : undefined;
  const { filled = 0, empty = 0, unchecked = 0, total = 0 } = stats ?? {};
  const automatic = nights?.some((n) => n.period) ?? false;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="text-xl font-bold tabular-nums">
              {houseLabel(house)}
            </span>
            {house.status === "vacant" && (
              <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
                mudik
              </span>
            )}
          </p>
          <p
            className={cx(
              "truncate text-sm",
              house.ownerName ? "text-fg/80" : "italic text-muted",
            )}
          >
            {house.ownerName ?? "Belum ada nama"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Tutup"
          className="-mr-2 -mt-1"
        >
          <X className="size-5" />
        </Button>
      </div>

      {tonight && (
        <section>
          <PanelHeading>Malam ini</PanelHeading>
          {tonight.period ? (
            <>
              <PaymentNotice period={tonight.period} />
              <p className="mt-2 text-sm text-muted">Status otomatis dari pembayaran periode; tidak perlu dicatat saat ronda.</p>
              <Link to="/admin/rekap" className={cx(buttonClass("secondary", "sm"), "mt-2.5")}>Lihat pembayaran</Link>
            </>
          ) : (
            <>
              <TonightStatus house={house} collection={tonight.collection} />
              <Button
                variant="secondary"
                size="sm"
                className="mt-2.5"
                onClick={() => setCorrecting(true)}
              >
                <PenLine className="size-4" />
                {tonight.collection ? "Ubah catatan" : "Isi catatan"}
              </Button>
            </>
          )}
          <CorrectionDialog
            target={{
              house,
              date: tonight.date,
              current: tonight.collection ?? undefined,
            }}
            open={correcting}
            onClose={() => setCorrecting(false)}
            defaultAmount={tonight.defaultAmount}
          />
        </section>
      )}

      <section>
        <PanelHeading>{formatMonth(month)}</PanelHeading>
        {!nights ? (
          <p className="text-sm text-muted">
            {recap.isError ? "Rekap tidak bisa dimuat." : "Memuat…"}
          </p>
        ) : nights.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada malam ronda di bulan ini.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat value={filled} label="Ada" className="text-filled" />
              <MiniStat value={empty} label="Kosong" className="text-empty" />
              <MiniStat value={unchecked} label="Tidak dicek" />
            </div>
            <ul
              className="mt-3 flex flex-wrap gap-1"
              aria-label="Catatan per malam"
            >
              {nights.map(({ date, cell, period, status }) => {
                const text = period?.status === "paid"
                  ? `${CADENCE_LABEL[period.cadence]} · Sudah bayar`
                  : cell?.status === "filled"
                    ? `ada ${formatRupiah(cell.amount)}${period ? ` · ${CADENCE_LABEL[period.cadence]} · Belum bayar penuh` : ""}`
                    : period
                      ? `${CADENCE_LABEL[period.cadence]} · Belum bayar`
                      : cell ? "kosong" : "tidak dicek";
                return (
                  <li key={date}>
                    <Link
                      to={`/admin/riwayat/${date}`}
                      title={`${formatDateShort(date)}: ${text}`}
                      aria-label={`${formatDateShort(date)}: ${text}`}
                      className={cx(
                        "block size-4 rounded-[3px] hover:ring-2 hover:ring-primary/50",
                        status === "filled" && "bg-filled",
                        status === "empty" && "bg-empty",
                        status === "unchecked" && "border border-line bg-idle-soft",
                      )}
                    />
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">
              {automatic
                ? `Status mingguan/bulanan otomatis dari pembayaran. Total jimpitan ${formatRupiah(total)}.`
                : filled + empty > 0
                ? `Kosong ${Math.round((empty / (filled + empty)) * 100)}% dari ${filled + empty} malam yang dicek · ${formatRupiah(total)}`
                : "Belum pernah dicek bulan ini."}
            </p>
          </>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Link
          to={`/admin/rumah?ubah=${house.id}`}
          className={buttonClass("secondary", "sm")}
        >
          <Pencil className="size-4" /> Ubah data rumah
        </Link>
        <Link
          to={`/admin/rekap?bulan=${month}`}
          className={buttonClass("ghost", "sm")}
        >
          <Table2 className="size-4" /> Rekap
        </Link>
      </div>
    </Card>
  );
}

function TonightStatus({
  house,
  collection,
}: {
  house: HouseDTO;
  collection: CollectionDTO | null;
}) {
  if (!collection) {
    return (
      <p className="text-sm text-muted">
        {house.status === "vacant"
          ? "Rumah kosong/mudik, tidak dihitung."
          : "Belum dicek petugas."}
      </p>
    );
  }
  const filled = collection.status === "filled";
  return (
    <div className="flex items-center gap-3">
      <span
        className={cx(
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
          filled ? "bg-filled-soft text-filled" : "bg-empty-soft text-empty",
        )}
      >
        {filled ? `Ada ${formatRupiah(collection.amount)}` : "Kosong"}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
        {collection.method === "scan" ? (
          <ScanLine
            className="size-3.5 shrink-0"
            role="img"
            aria-label="scan QR"
          />
        ) : (
          <Hand className="size-3.5 shrink-0" role="img" aria-label="manual" />
        )}
        <span className="truncate">
          {formatTime(collection.recordedAt)}
          {collection.collectorName && ` · ${collection.collectorName}`}
        </span>
      </span>
    </div>
  );
}

function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </h3>
  );
}

function MiniStat({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg bg-idle-soft/50 py-1.5">
      <p className={cx("text-lg font-bold leading-tight", className)}>
        {value}
      </p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
