import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, ReceiptText } from "lucide-react";
import { useState } from "react";
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
  const byId = new Map((houses.data?.houses ?? []).map((h) => [h.id, h]));
  const label = (id: number) => { const house = byId.get(id); return house ? houseLabel(house) : "Rumah #" + id; };
  const cancel = useMutation({
    mutationFn: (id: number) => call(api.admin.pembayaran[":id"].$delete({ param: { id: String(id) } })),
    onSuccess: () => invalidate(...PAYMENT_REFRESH),
  });
  function record(payment?: AdminPayment) { setEditing(payment); setOpened(true); }
  return (
    <Card className="mb-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-semibold"><ReceiptText className="size-4 text-primary" /> Pembayaran mingguan & bulanan</h2><p className="mt-1 text-xs text-muted">Pembayaran sesuai periode. Kolom Bulanan di rekap terpisah dari uang hasil ronda.</p></div>
        <Button size="sm" onClick={() => record()}><Plus className="size-4" /> Catat pembayaran</Button>
      </div>
      <QueryState query={query}>
        {(data) => {
          const previousOverdue = data.overdueBills ?? [];
          const bills = [...previousOverdue, ...data.bills].filter((b) => b.cadence !== "daily" && byId.get(b.houseId)?.status === "active");
          const overdue = bills.filter((b) => b.status === "overdue");
          const paid = bills.filter((b) => b.status === "paid");
          return (
            <>
              <p className="text-sm text-muted">{bills.length} periode · {paid.length} sudah dibayar{overdue.length > 0 && <span className="text-warn"> · {overdue.length} terlambat</span>} · {data.payments.length} pembayaran tercatat</p>
              <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Tutup rincian pembayaran" : "Lihat status & riwayat pembayaran"}</Button>
              {expanded && (
                <div className="space-y-4">
                  {previousOverdue.length > 0 && <p className="text-xs text-warn">Daftar ini juga menampilkan tunggakan sebelum bulan yang dipilih.</p>}
                  {bills.length === 0 ? <p className="text-sm text-muted">Atur kesepakatan mingguan/bulanan di <Link to="/admin/rumah" className="font-semibold text-primary underline">Rumah & QR</Link> untuk menampilkan nominal dan jatuh tempo.</p> : (
                    <ul className="divide-y divide-line">
                      {bills.map((b) => <li key={b.planId + ":" + b.start} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0"><p className="font-semibold">{label(b.houseId)} <span className="text-xs font-normal text-muted">{CADENCE_LABEL[b.cadence]}</span></p><p className="text-xs text-muted">{formatDateShort(b.start)} – {formatDateShort(b.end)} · jatuh tempo {formatDateShort(b.dueDate)}</p></div>
                        <div className="text-right"><p className={cx("text-xs font-semibold", b.status === "overdue" ? "text-warn" : b.status === "paid" ? "text-primary" : "text-muted")}>{BILLING_LABEL[b.status]}</p><p className="text-sm tabular-nums">{formatRupiah(b.paid)} / {formatRupiah(b.expected)}</p></div>
                      </li>)}
                    </ul>
                  )}
                  <div><h3 className="text-sm font-semibold">Riwayat pembayaran</h3><p className="text-xs text-muted">Menampilkan uang diterima bulan ini atau pembayaran yang mencakup periode bulan ini.</p></div>
                  {data.history.length === 0 ? <p className="text-sm text-muted">Belum ada pembayaran periode. Pilih Catat pembayaran saat menerima uang dari warga.</p> : <ul className="divide-y divide-line">{data.history.map((p) => <li key={p.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{label(p.houseId)} <span className="text-xs font-normal text-muted">{CADENCE_LABEL[p.cadence]}{p.cancelledAt && " · Dibatalkan"}</span></p><p className={cx("font-semibold tabular-nums", !!p.cancelledAt && "text-muted line-through")}>{formatRupiah(p.amount)}</p></div>
                    <p className="text-xs text-muted">Periode {formatDateShort(p.periodStart)} – {formatDateShort(p.periodEnd)} {p.periodEnd.slice(0, 4)} · diterima {formatDateShort(p.receivedDate)} oleh {p.receivedBy === "treasurer" ? "bendahara" : p.collectorName ?? "petugas"}.</p>
                    {p.note && <p className="break-words text-xs text-muted">{p.note}</p>}
                    <div className="flex flex-wrap gap-2">{!p.cancelledAt && <Button variant="secondary" size="sm" onClick={() => record(p)}><Pencil className="size-3.5" /> Ubah</Button>}<Button variant="ghost" size="sm" onClick={() => setLogId(p.id)}>Log perubahan</Button>{!p.cancelledAt && <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => window.confirm("Batalkan pembayaran " + label(p.houseId) + " sebesar " + formatRupiah(p.amount) + "? Kas dan rekap akan diperbarui.") && cancel.mutate(p.id)}>Batalkan pembayaran</Button>}</div>
                  </li>)}</ul>}
                </div>
              )}
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
