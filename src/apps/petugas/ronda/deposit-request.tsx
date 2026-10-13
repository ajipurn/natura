import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useRef } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Alert, Button, Card } from "@/components/ui";
import { formatRupiah } from "@/lib/format";
import type { DepositSubmission } from "@/lib/types";
import type { SyncStatus } from "./use-ronda-store";

export function DepositRequest({ date, total, submission, syncStatus, pendingCount, hasRejections, onRefresh }: {
  date: string; total: number; submission?: DepositSubmission; syncStatus: SyncStatus;
  pendingCount: number; hasRejections: boolean; onRefresh: () => Promise<void>;
}) {
  const send = useMutation({
    mutationFn: () => call(api.ronda.setoran.$post({ json: { date } })),
    onSuccess: async () => {
      await Promise.all([onRefresh(), invalidate(["admin", "kas"], ["admin", "ringkasan"])]);
    },
  });
  const current = submission?.requestedAt || submission?.receivedAmount != null ? submission : send.data?.depositSubmission ?? submission;
  const amount = total + (current?.periodAmount ?? 0);
  const received = current?.receivedAmount === amount;
  const difference = current?.receivedAmount != null && !received;
  const requested = Boolean(current?.requestedAt);
  const waiting = pendingCount > 0 || syncStatus === "syncing";
  const offline = syncStatus === "offline" || syncStatus === "auth";
  const ready = !received && !requested && !waiting && !offline && !hasRejections && Boolean(submission);
  const attempted = useRef(false);
  const { mutate, isPending } = send;
  useEffect(() => {
    if (!ready) { attempted.current = false; return; }
    if (attempted.current || isPending) return;
    attempted.current = true;
    // Melengkapi pengajuan untuk catatan yang sudah selesai sebelum fitur otomatis aktif.
    mutate();
  }, [ready, isPending, mutate]);
  return <Card className="space-y-3" aria-label="Pengajuan setoran jimpitan">
    <div className="flex items-start gap-3">
      {received || requested ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /> : isPending ? <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-primary" aria-hidden /> : <Wallet className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />}
      <div className="min-w-0">
        <h2 className="font-semibold">{received ? "Setoran sudah dicatat" : requested && difference ? "Setoran perlu dicocokkan" : requested ? "Pengajuan setoran terkirim" : isPending ? "Mengajukan setoran…" : send.error ? "Pengajuan setoran belum terkirim" : "Setoran diajukan otomatis"}</h2>
        <p className="mt-1 text-sm text-muted">{received ? `Admin atau bendahara sudah mencatat ${formatRupiah(amount)}.` : requested && difference ? `Setoran tercatat ${formatRupiah(current!.receivedAmount!)} dari ${formatRupiah(amount)}. Hubungi admin atau bendahara untuk mencocokkan selisihnya.` : requested ? "Serahkan uang kepada admin atau bendahara. Setoran akan dicatat setelah uang diterima." : `Total untuk disetor ${formatRupiah(amount)}. Pengajuan dikirim otomatis setelah semua catatan tersinkron.`}</p>
        {!received && (current?.periodAmount ?? 0) > 0 && <p className="mt-1 text-xs text-muted">Termasuk pembayaran bulanan atau rapel yang diterima petugas.</p>}
      </div>
    </div>
    {!received && !requested && <>
      {send.error && <Button variant="secondary" className="w-full sm:w-auto" onClick={() => mutate()} disabled={isPending || !ready}>
        <RefreshCw className="size-4" aria-hidden />Coba lagi
      </Button>}
      {(waiting || offline || hasRejections || !submission) && <p className="text-xs text-muted">{hasRejections ? "Periksa catatan yang ditolak dan sinkronkan ulang. Setoran akan diajukan otomatis setelah catatan siap." : offline ? "Setoran akan diajukan otomatis saat terhubung kembali dan catatan tersinkron." : "Menunggu semua catatan tersinkron sebelum pengajuan otomatis."}</p>}
    </>}
    {send.error && !received && !requested && <Alert>{send.error.message}</Alert>}
  </Card>;
}
