import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { api, call } from "@/client/api";
import { Dialog } from "@/components/dialog";
import { HouseMonthCalendar, HouseCalendarLegend, type HouseCalendarNight } from "@/components/house-month-calendar";
import { QueryState } from "@/components/query-state";
import { Button, cx } from "@/components/ui";
import { PaymentNotice } from "@/components/payment-notice";
import { CADENCE_LABEL } from "@/lib/payments";
import { daysInMonth, formatDateShort } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

/** Riwayat jimpitan satu rumah (± 3 bulan), sebagai kalender per bulan. Tanpa nama warga. */
export function HouseHistoryDialog({
  houseId,
  label,
  onClose,
  myHouse,
  onMyHouse,
  month,
}: {
  houseId: number | null;
  label: string;
  onClose: () => void;
  myHouse: number | null;
  onMyHouse: (id: number | null) => void;
  month?: string;
}) {
  const isMine = houseId !== null && houseId === myHouse;
  return (
    <Dialog
      open={houseId !== null}
      onClose={onClose}
      title={`Rumah ${label}`}
      description="Riwayat jimpitan ± 3 bulan terakhir"
      footer={
        houseId !== null && (
          <Button
            variant={isMine ? "primary" : "secondary"}
            size="sm"
            onClick={() => onMyHouse(isMine ? null : houseId)}
            aria-pressed={isMine}
          >
            <Star className={cx("size-4", isMine && "fill-current")} /> {isMine ? "Rumah saya" : "Tandai sebagai rumah saya"}
          </Button>
        )
      }
    >
      {houseId !== null && <HistoryBody houseId={houseId} selectedMonth={month} />}
    </Dialog>
  );
}

function HistoryBody({ houseId, selectedMonth }: { houseId: number; selectedMonth?: string }) {
  const query = useQuery({
    queryKey: selectedMonth ? ["warga", "rumah", houseId, selectedMonth] : ["warga", "rumah", houseId],
    queryFn: () => call(api.warga.rumah[":id"].$get({ param: { id: String(houseId) }, query: { bulan: selectedMonth } })),
  });
  return (
    <QueryState query={query} loading={<p className="py-10 text-center text-muted">Memuat riwayat…</p>}>
      {({ house, history, today, paymentInfo }) => {
        const byDate = new Map((history as HouseCalendarNight[]).map((n) => [n.date, n]));
        // Bulan yang dipilih tetap tampil walau belum punya satu pun catatan ronda.
        const firstMonth = selectedMonth ?? today.slice(0, 7);
        const through = firstMonth < today.slice(0, 7) ? daysInMonth(firstMonth).at(-1)! : today;
        const months = [firstMonth, ...[...new Set(history.map((n) => n.date.slice(0, 7)))].filter((m) => m !== firstMonth).sort().reverse()].slice(0, 3);
        return (
          <div className="space-y-5">
            {house.status === "active" && <PaymentNotice period={paymentInfo.periods.find((b) => b.start <= through && b.end >= through)} cell={through === today ? paymentInfo.tonight : null} />}
            {paymentInfo.periods.some((p) => p.status === "unpaid" && p.end < today) && house.status === "active" && <p className="text-sm text-muted">Periode sebelumnya belum dibayar: {paymentInfo.periods.filter((p) => p.status === "unpaid" && p.end < today).map((p) => formatDateShort(p.start) + " – " + formatDateShort(p.end)).join("; ")}.</p>}
            {paymentInfo.receipts.length > 0 && <section><h3 className="font-semibold">Pembayaran periode</h3><ul className="mt-2 space-y-2">{paymentInfo.receipts.map((p, i) => <li key={i} className="rounded-xl bg-primary/5 px-3 py-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{CADENCE_LABEL[p.cadence]}</span><strong>{formatRupiah(p.amount)}</strong></div><p className="text-xs text-muted">Untuk {formatDateShort(p.periodStart)} – {formatDateShort(p.periodEnd)} {p.periodEnd.slice(0, 4)} · diterima {formatDateShort(p.receivedDate)}.</p></li>)}</ul><p className="mt-2 text-xs text-muted">Terpisah dari hasil pemeriksaan wadah di kalender ronda.</p></section>}
            {house.status === "vacant" && (
              <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
                Ditandai rumah kosong/mudik: tidak dihitung bolong walau wadahnya kosong.
              </p>
            )}
            {months.map((month) => <HouseMonthCalendar key={month} month={month} byDate={byDate} today={today} house={house} periods={paymentInfo.periods} />)}
            <HouseCalendarLegend />
          </div>
        );
      }}
    </QueryState>
  );
}
