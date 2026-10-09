import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Circle, History, Pencil, Plus, ReceiptText } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { PaymentCadenceBadge } from "@/components/payment-cadence-badge";
import { QueryState } from "@/components/query-state";
import { Alert, Button, Card, cx } from "@/components/ui";
import { formatDateShort, formatTime, localDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { houseLabel } from "@/lib/houses";
import { BILLING_LABEL, CADENCE_LABEL } from "@/lib/payments";
import { housesQuery, paymentsQuery, PAYMENT_REFRESH } from "../queries";
import { PaymentDialog, type AdminPayment } from "./payment-dialog";
import { adminPath } from "@/lib/app-paths";

const billColumns = "@2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_8rem]";

export function PaymentPanel({ month }: { month: string }) {
  const query = useQuery(paymentsQuery(month));
  const houses = useQuery(housesQuery);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<AdminPayment>();
  const [logId, setLogId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const historyId = useId();
  const byId = new Map((houses.data?.houses ?? []).map((h) => [h.id, h]));
  const label = (id: number) => { const house = byId.get(id); return house ? houseLabel(house) : "Rumah #" + id; };
  const cancel = useMutation({
    mutationFn: (id: number) => call(api.admin.pembayaran[":id"].$delete({ param: { id: String(id) } })),
    onSuccess: () => invalidate(...PAYMENT_REFRESH),
  });
  function record(payment?: AdminPayment) { setEditing(payment); setOpened(true); }
  return (
    <Card className="@container space-y-6 sm:p-5">
      <div className="flex flex-col gap-4 @xl:flex-row @xl:items-center @xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ReceiptText className="size-5" aria-hidden /></div>
          <div className="min-w-0"><h2 className="font-semibold">Pembayaran periode</h2><p className="mt-0.5 text-pretty text-sm text-muted">Kelola pembayaran mingguan dan bulanan warga.</p></div>
        </div>
        <Button size="sm" className="h-11 w-full shrink-0 transition-[background-color,color,box-shadow,scale] active:scale-[0.96] motion-reduce:active:scale-100 @xl:h-9 @xl:w-auto" onClick={() => record()}><Plus className="size-4" aria-hidden /> Catat pembayaran</Button>
      </div>
      <QueryState query={query}>
        {(data) => {
          const previousUnpaid = data.previousUnpaidBills ?? [];
          const bills = [...previousUnpaid, ...data.bills].filter((b) => b.cadence !== "daily" && byId.get(b.houseId)?.status === "active");
          const unpaid = bills.filter((b) => b.status === "unpaid");
          const paid = bills.filter((b) => b.status === "paid");
          return (
            <>
              <dl className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
                <div className="rounded-xl bg-idle-soft/40 px-4 py-3.5"><dt className="text-xs text-muted">Belum lunas</dt><dd className="mt-1.5 text-2xl font-semibold tabular-nums">{unpaid.length} <span className="text-sm font-normal text-muted">periode</span></dd></div>
                <div className="rounded-xl bg-idle-soft/40 px-4 py-3.5"><dt className="text-xs text-muted">Sudah lunas</dt><dd className="mt-1.5 text-2xl font-semibold tabular-nums">{paid.length} <span className="text-sm font-normal text-muted">periode</span></dd></div>
                <div className="col-span-2 rounded-xl bg-primary/5 px-4 py-3.5 @xl:col-span-1"><dt className="text-xs text-muted">Sisa pembayaran</dt><dd className="mt-1.5 break-words text-2xl font-semibold tracking-tight tabular-nums text-primary">{formatRupiah(unpaid.reduce((sum, b) => sum + b.remaining, 0))}</dd></div>
              </dl>
              <div>
                <h3 className="text-sm font-semibold">Status per rumah</h3>
                {bills.some((b) => b.end < month + "-01") && <p className="mt-1 text-xs text-muted">Termasuk periode sebelumnya yang belum lunas.</p>}
                {bills.length === 0 ? <p className="mt-3 rounded-xl bg-idle-soft/30 px-4 py-5 text-pretty text-sm text-muted">Belum ada kesepakatan mingguan atau bulanan. Atur cara bayar di <Link to={adminPath("/rumah")} className="font-semibold text-primary underline underline-offset-2">Rumah & QR</Link>.</p> : (
                  <div className="mt-3">
                    <div aria-hidden className={cx("hidden items-center gap-4 rounded-lg bg-idle-soft/40 px-3 py-2 text-xs font-medium text-muted @2xl:grid", billColumns)}>
                      <span>Rumah</span><span>Periode</span><span className="text-right">Terbayar / Total</span><span className="text-right">Status</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {bills.map((b) => <li key={b.planId + ":" + b.start} className={cx("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-4 @2xl:gap-x-4", billColumns)}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="min-w-0 max-w-full break-words text-sm font-semibold">{label(b.houseId)}</p><PaymentCadenceBadge cadence={b.cadence} className="shrink-0 whitespace-nowrap text-xs" /></div>
                          <p className="mt-1 break-words text-xs text-muted">{byId.get(b.houseId)?.ownerName || "Belum ada nama"}</p>
                        </div>
                        <p className="col-span-2 col-start-1 row-start-2 text-xs text-muted @2xl:col-span-1 @2xl:col-start-auto @2xl:row-start-auto @2xl:text-sm">{formatDateShort(b.start)} – {formatDateShort(b.end)}</p>
                        <p className="col-span-2 row-start-3 flex flex-wrap items-baseline gap-x-1 text-sm tabular-nums @2xl:col-span-1 @2xl:row-start-auto @2xl:justify-end">
                          <span className="me-1 text-xs text-muted @2xl:sr-only">Terbayar</span><span className="font-semibold">{formatRupiah(b.paid)}</span><span className="text-muted">/ {formatRupiah(b.expected)}</span>
                        </p>
                        <span className={cx("col-start-2 row-start-1 inline-flex items-center gap-1.5 self-start justify-self-end whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium @2xl:col-start-auto @2xl:row-start-auto @2xl:self-center", b.status === "paid" ? "bg-filled-soft text-filled" : "bg-empty-soft text-empty")}>
                          {b.status === "paid" ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-1.5 fill-current" aria-hidden />}{BILLING_LABEL[b.status]}
                        </span>
                      </li>)}
                    </ul>
                  </div>
                )}
              </div>
              <div className="border-t border-line pt-4">
                <Button variant="ghost" size="sm" className="h-auto min-h-11 w-full justify-start bg-idle-soft/30 px-3 py-2.5 text-fg transition-[background-color,color,box-shadow,scale] hover:bg-idle-soft/60 active:scale-[0.96] motion-reduce:active:scale-100" aria-expanded={expanded} aria-controls={expanded ? historyId : undefined} onClick={() => setExpanded(!expanded)}>
                  <History className="size-4 shrink-0 text-muted" aria-hidden /> Riwayat pembayaran <span className="rounded-md bg-card px-1.5 py-0.5 text-xs tabular-nums text-muted">{data.history.length}</span> <ChevronDown className={cx("ms-auto size-4 shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden />
                </Button>
                {expanded && <div id={historyId} className="mt-3 space-y-3">
                  <p className="text-xs text-muted">Uang diterima atau pembayaran yang mencakup bulan ini.</p>
                  {data.history.length === 0 ? <p className="text-sm text-muted">Belum ada pembayaran tercatat. Gunakan Catat pembayaran saat menerima uang dari warga.</p> : <ul className="divide-y divide-line">{data.history.map((p) => <li key={p.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{label(p.houseId)} <span className="text-xs font-normal text-muted">{CADENCE_LABEL[p.cadence]}{p.cancelledAt && " · Dibatalkan"}</span></p><p className={cx("font-semibold tabular-nums", !!p.cancelledAt && "text-muted line-through")}>{formatRupiah(p.amount)}</p></div>
                    <p className="break-words text-xs text-muted">{byId.get(p.houseId)?.ownerName || "Belum ada nama"}</p>
                    <p className="text-xs text-muted">Periode {formatDateShort(p.periodStart)} – {formatDateShort(p.periodEnd)} {p.periodEnd.slice(0, 4)} · diterima {formatDateShort(p.receivedDate)} oleh {p.receivedBy === "treasurer" ? "bendahara" : p.collectorName ?? "petugas"}.</p>
                    {p.note && <p className="break-words text-xs text-muted">{p.note}</p>}
                    <div className="flex flex-wrap gap-2">{!p.cancelledAt && <Button variant="secondary" size="sm" onClick={() => record(p)}><Pencil className="size-3.5" /> Ubah</Button>}<Button variant="ghost" size="sm" onClick={() => setLogId(p.id)}>Log perubahan</Button>{!p.cancelledAt && <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => window.confirm("Batalkan pembayaran " + label(p.houseId) + " sebesar " + formatRupiah(p.amount) + "? Kas dan rekap akan diperbarui.") && cancel.mutate(p.id)}>Batalkan pembayaran</Button>}</div>
                  </li>)}</ul>}
                </div>}
              </div>
            </>
          );
        }}
      </QueryState>
      {cancel.isError && <Alert>{cancel.error.message}</Alert>}
      {cancel.isSuccess && <Alert tone="success">{cancel.data.success}</Alert>}
      <PaymentDialog open={opened} onClose={() => setOpened(false)} month={month} payment={editing} />
      <PaymentLogDialog id={logId} onClose={() => setLogId(null)} />
    </Card>
  );
}

function PaymentLogDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const query = useQuery({ queryKey: ["admin", "payment-log", id], queryFn: () => call(api.admin.pembayaran[":id"].log.$get({ param: { id: String(id) } })), enabled: id !== null });
  return <Dialog open={id !== null} onClose={onClose} title="Log perubahan pembayaran" description="Catatan sebelum dan sesudah koreksi tetap disimpan."><QueryState query={query}>{(data) => <ul className="space-y-3">{data.logs.map((log) => {
    const payload = log.payload as { before?: AdminPayment; after?: AdminPayment };
    const action = { create: "Dicatat", update: "Diubah", cancel: "Dibatalkan" }[log.action];
    return <li key={log.id} className="rounded-xl bg-idle-soft p-3 text-sm"><p className="font-semibold">{action} oleh {log.name ?? "akun yang dihapus"}</p><p className="text-xs text-muted">{formatDateShort(localDate(new Date(log.createdAt)))} · {formatTime(log.createdAt)}</p>{payload.before && <p className="mt-2">Sebelumnya: {formatRupiah(payload.before.amount)}, {payload.before.periodStart} – {payload.before.periodEnd}, diterima {payload.before.receivedDate}.</p>}{payload.after && <p className="mt-1">{log.action === "create" ? "Pembayaran" : "Sesudahnya"}: {formatRupiah(payload.after.amount)}, {payload.after.periodStart} – {payload.after.periodEnd}, diterima {payload.after.receivedDate}.</p>}</li>;
  })}</ul>}</QueryState></Dialog>;
}
