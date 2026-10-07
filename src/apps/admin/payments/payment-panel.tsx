import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Pencil, Plus, ReceiptText } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { Alert, Button, Card, cx } from "@/components/ui";
import { formatDateShort, formatTime, localDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { houseLabel } from "@/lib/houses";
import { BILLING_LABEL, CADENCE_LABEL } from "@/lib/payments";
import { housesQuery, paymentsQuery, PAYMENT_REFRESH } from "../queries";
import { PaymentDialog, type AdminPayment } from "./payment-dialog";

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
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-semibold"><ReceiptText className="size-4 text-primary" /> Pembayaran periode</h2><p className="mt-1 text-sm text-muted">Kelola pembayaran mingguan dan bulanan warga.</p></div>
        <Button size="sm" onClick={() => record()}><Plus className="size-4" /> Catat pembayaran</Button>
      </div>
      <QueryState query={query}>
        {(data) => {
          const previousUnpaid = data.previousUnpaidBills ?? [];
          const bills = [...previousUnpaid, ...data.bills].filter((b) => b.cadence !== "daily" && byId.get(b.houseId)?.status === "active");
          const unpaid = bills.filter((b) => b.status === "unpaid");
          const paid = bills.filter((b) => b.status === "paid");
          return (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <div><dt className="text-xs text-muted">Belum lunas</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{unpaid.length} <span className="text-sm font-normal text-muted">periode</span></dd></div>
                <div><dt className="text-xs text-muted">Sudah lunas</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{paid.length} <span className="text-sm font-normal text-muted">periode</span></dd></div>
                <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-muted">Sisa pembayaran</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatRupiah(unpaid.reduce((sum, b) => sum + b.remaining, 0))}</dd></div>
              </dl>
              <div>
                <h3 className="text-sm font-semibold">Status per rumah</h3>
                {bills.some((b) => b.end < month + "-01") && <p className="mt-1 text-xs text-muted">Termasuk periode sebelumnya yang belum lunas.</p>}
                {bills.length === 0 ? <p className="mt-3 text-sm text-muted">Belum ada kesepakatan mingguan atau bulanan. Atur cara bayar di <Link to="/admin/rumah" className="font-semibold text-primary underline">Rumah & QR</Link>.</p> : (
                  <ul className="mt-2 divide-y divide-line">
                    {bills.map((b) => <li key={b.planId + ":" + b.start} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0"><p className="font-semibold">{label(b.houseId)} <span className="text-xs font-normal text-muted">{CADENCE_LABEL[b.cadence]}</span></p><p className="mt-0.5 text-xs text-muted">{formatDateShort(b.start)} – {formatDateShort(b.end)}</p></div>
                      <div className="shrink-0 text-right"><p className={cx("text-xs font-semibold", b.status === "paid" ? "text-filled" : "text-empty")}>{BILLING_LABEL[b.status]}</p><p className="mt-0.5 text-sm tabular-nums">{formatRupiah(b.paid)} <span className="text-muted">/ {formatRupiah(b.expected)}</span></p></div>
                    </li>)}
                  </ul>
                )}
              </div>
              <div className="border-t border-line pt-3">
                <Button variant="ghost" size="sm" className="-ml-3" aria-expanded={expanded} aria-controls={expanded ? historyId : undefined} onClick={() => setExpanded(!expanded)}>
                  Riwayat pembayaran <span className="text-muted">{data.history.length}</span> <ChevronDown className={cx("size-4", expanded && "rotate-180")} />
                </Button>
                {expanded && <div id={historyId} className="mt-3 space-y-3">
                  <p className="text-xs text-muted">Uang diterima atau pembayaran yang mencakup bulan ini.</p>
                  {data.history.length === 0 ? <p className="text-sm text-muted">Belum ada pembayaran tercatat. Gunakan Catat pembayaran saat menerima uang dari warga.</p> : <ul className="divide-y divide-line">{data.history.map((p) => <li key={p.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{label(p.houseId)} <span className="text-xs font-normal text-muted">{CADENCE_LABEL[p.cadence]}{p.cancelledAt && " · Dibatalkan"}</span></p><p className={cx("font-semibold tabular-nums", !!p.cancelledAt && "text-muted line-through")}>{formatRupiah(p.amount)}</p></div>
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
