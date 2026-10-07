import { formatDateShort } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { BILLING_LABEL, CADENCE_LABEL, type BillingPeriod, type PaymentCell } from "@/lib/payments";
import { cx } from "./ui";

export function PaymentNotice({ period, cell }: { period?: BillingPeriod; cell?: PaymentCell | null }) {
  if (!period && !cell) return null;
  const paid = period ? period.status === "paid" : cell?.paid;
  return (
    <div role="note" className={cx("rounded-xl px-3 py-2.5 text-sm", paid ? "bg-primary/10 text-primary" : period?.status === "overdue" ? "bg-warn-soft text-warn" : "bg-idle-soft text-fg")}>
      <p className="font-semibold">{period ? CADENCE_LABEL[period.cadence] + " · " + BILLING_LABEL[period.status] : paid ? "Jimpitan malam ini sudah dibayar" : "Pembayaran malam ini tercatat sebagian"}</p>
      {period ? <p className="mt-0.5">Periode {formatDateShort(period.start)} – {formatDateShort(period.end)} {period.end.slice(0, 4)}. {paid ? "Sudah tercatat " + formatRupiah(period.paid) + "." : "Sisa " + formatRupiah(period.remaining) + ", jatuh tempo " + formatDateShort(period.dueDate) + "."}</p> : <p className="mt-0.5">Alokasi untuk malam ini: {formatRupiah(cell?.amount ?? 0)}.</p>}
    </div>
  );
}
