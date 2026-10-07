import { useQuery } from "@tanstack/react-query";
import { Check, Star } from "lucide-react";
import { api, call } from "@/client/api";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { Button, cx } from "@/components/ui";
import { PaymentNotice } from "@/components/payment-notice";
import { BILLING_LABEL, CADENCE_LABEL, type BillingPeriod } from "@/lib/payments";
import { monthHouseNights } from "@/lib/month-summary";
import type { HouseStatus, MonthCell } from "@/lib/types";
import { daysInMonth, formatDateShort, formatMonth } from "@/lib/dates";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { scheduleDay } from "@/lib/schedule";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

type Night = { date: string; status: "filled" | "empty" | null; amount: number | null };

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
        const byDate = new Map((history as Night[]).map((n) => [n.date, n]));
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
            {months.map((month) => <MonthCalendar key={month} month={month} byDate={byDate} today={today} house={house} periods={paymentInfo.periods} />)}
            <Legend />
          </div>
        );
      }}
    </QueryState>
  );
}

function MonthCalendar({ month, byDate, today, house, periods }: {
  month: string;
  byDate: Map<string, Night>;
  today: string;
  house: { id: number; status: HouseStatus };
  periods: BillingPeriod[];
}) {
  const days = daysInMonth(month);
  const dates = days.filter((date) => date <= today);
  const cells: Record<string, MonthCell> = {};
  for (const date of dates) {
    const night = byDate.get(date);
    if (night?.status) cells[`${house.id}:${date}`] = { status: night.status, amount: night.amount ?? 0 };
  }
  const nights = monthHouseNights({ dates, cells, paymentPeriods: periods }, house);
  const states = new Map(nights.map((n) => [n.date, n]));
  const filled = nights.filter((n) => n.status === "filled").length;
  const empty = nights.filter((n) => n.status === "empty").length;
  const unchecked = nights.length - filled - empty;
  const total = nights.reduce((sum, n) => sum + (n.cell?.status === "filled" ? n.cell.amount : 0), 0);
  // Kalender mulai Senin.
  const lead = (scheduleDay(days[0]) + 6) % 7;

  return (
    <section aria-label={formatMonth(month)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-semibold">{formatMonth(month)}</h3>
        <p className="text-xs text-muted">Dari ronda <span className="ml-1 text-sm font-semibold text-fg">{formatRupiah(total)}</span></p>
      </div>
      <p className="text-sm text-muted">
        {nights.length} malam berjalan · sejak tanggal 1
      </p>
      {house.status === "active" && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          {[
            { count: filled, label: "Terisi", color: "text-filled" },
            { count: empty, label: "Kosong", color: "text-empty" },
            { count: unchecked, label: "Belum dicatat", color: "text-muted" },
          ].map(({ count, label, color }) => (
            <div key={label} className="rounded-lg bg-idle-soft py-2">
              <p className={cx("text-lg font-bold tabular-nums", color)}>{count}</p>
              <p className="text-muted">{label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 grid grid-cols-7 gap-1 text-center" role="list">
        {WEEKDAYS.map((d) => (
          <span key={d} aria-hidden className="text-[11px] font-medium text-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {days.map((date) => {
          const night = states.get(date);
          const state = date > today ? "future" : house.status === "vacant" && !night?.cell ? "vacant" : night?.status ?? "unchecked";
          const automatic = night?.period && !(night.cell?.status === "filled" && night.period.status === "unpaid") ? night.period : undefined;
          const text = automatic
            ? `${CADENCE_LABEL[automatic.cadence]} · ${BILLING_LABEL[automatic.status]}`
            :
            state === "filled"
              ? `ada ${formatRupiah(night?.cell?.amount ?? 0)}`
              : state === "empty"
                ? "kosong"
                : state === "unchecked"
                  ? "belum dicatat"
                  : state === "vacant" ? "mudik" : "belum tiba";
          return (
            <span
              key={date}
              role="listitem"
              aria-label={`${formatDateShort(date)}: ${text}`}
              title={`${formatDateShort(date)}: ${text}`}
              className={cx(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-sm leading-none tabular-nums",
                state === "filled" && "border-filled/40 bg-filled-soft font-semibold text-filled",
                state === "empty" && "border-empty/40 bg-empty-soft font-semibold text-empty",
                state === "unchecked" && "border-dashed border-muted/60 text-muted",
                state === "vacant" && "border-dashed border-line bg-idle-soft text-muted",
                state === "future" && "border-transparent text-muted/50",
                date === today && "ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
            >
              {Number(date.slice(8))}
              {automatic && state === "filled" ? <Check className="size-3" aria-hidden /> : state === "filled" && <span className="text-[10px] font-medium">{formatAmountShort(night?.cell?.amount ?? 0)}</span>}
              {state === "empty" && <span className="text-[10px] font-medium">{automatic ? "belum" : "kosong"}</span>}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["border-filled/40 bg-filled-soft", "terisi / sudah bayar"],
    ["border-empty/40 bg-empty-soft", "kosong / belum bayar"],
    ["border-dashed border-muted/60", "belum dicatat"],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([cls, text]) => (
        <span key={text} className="flex items-center gap-1.5">
          <span className={cx("inline-block size-3 rounded border", cls)} />
          {text}
        </span>
      ))}
      <p className="w-full pt-1">Tanggal redup belum tiba. Tanda ✓ mengikuti pembayaran mingguan/bulanan.</p>
    </div>
  );
}
