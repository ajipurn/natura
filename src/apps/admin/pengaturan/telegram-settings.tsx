import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { api, call, errorMessage } from "@/client/api";
import { usePermission } from "@/client/permissions";
import { Alert, Button, Card, cx } from "@/components/ui";

export function TelegramSettings() {
  const client = useQueryClient(), canEdit = usePermission("settings", true);
  const query = useQuery({ queryKey: ["admin", "telegram"], queryFn: () => call(api.admin.pengaturan.telegram.$get()), refetchInterval: 30_000 });
  const test = useMutation({ mutationFn: () => call(api.admin.pengaturan.telegram.test.$post()), onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "telegram"] }) });
  const status = query.data;
  return (
    <Card className="min-w-0 space-y-4 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Send className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight">Notifikasi Telegram</h2>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted">Permintaan dan pengingat penting dikirim ke chat Telegram, beserta tautan ke dashboard.</p>
        </div>
      </div>
      {query.isPending && <p role="status" className="text-sm text-muted">Memeriksa pengaturan Telegram…</p>}
      {query.isError && <Alert>{errorMessage(query.error)}</Alert>}
      {status && <>
        <div className="space-y-1.5 rounded-xl bg-bg/60 p-4">
          <p className={cx("flex items-center gap-2 text-sm font-semibold", status.enabled ? "text-primary" : "text-muted")}>
            <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", status.enabled ? "bg-primary" : "bg-muted")} />
            {status.enabled ? status.local ? "Aktif di lokal" : "Aktif" : status.disabled ? "Pengiriman dinonaktifkan" : "Belum terhubung"}
          </p>
          {status.enabled && status.pending > 0 && <p className="text-sm text-muted">{status.pending} pengingat menunggu dikirim</p>}
          {status.lastSentAt && <p className="text-xs leading-relaxed text-muted">Terakhir terkirim {new Date(status.lastSentAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>}
        </div>
        {status.disabled ? <p className="text-pretty text-sm leading-relaxed text-muted">Pengiriman dinonaktifkan melalui <code className="break-all text-xs">TELEGRAM_DISABLED</code>. Deployment preview tidak mengirim notifikasi.</p> : !status.enabled ? <p className="text-pretty text-sm leading-relaxed text-muted">Isi <code className="break-all text-xs">TELEGRAM_BOT_TOKEN</code> dan <code className="break-all text-xs">TELEGRAM_CHAT_ID</code> {status.local ? "di .env.local, lalu mulai ulang bun run dev." : "di Environment Variables Vercel, lalu deploy ulang."} Token disimpan di server.</p> : status.local && <p className="text-pretty text-sm leading-relaxed text-muted">Notifikasi dikirim dari server lokal saat data berubah atau Ringkasan dibuka.</p>}
        {status.enabled && !status.local && !status.cronConfigured && <Alert>Isi CRON_SECRET di Vercel agar pengingat harian dan percobaan ulang terjadwal bisa berjalan.</Alert>}
        {status.error && <Alert>{status.error}</Alert>}
      </>}
      {test.isError && <Alert>{errorMessage(test.error)}</Alert>}
      {test.isSuccess && <Alert tone="success">{test.data.success}</Alert>}
      {canEdit && <div className="border-t border-line pt-4">
        <Button variant="secondary" size="sm" className="w-full" disabled={!status?.enabled || test.isPending} onClick={() => test.mutate()}>
          <Send className="size-4" aria-hidden />{test.isPending ? "Mengirim…" : "Kirim pesan uji"}
        </Button>
      </div>}
    </Card>
  );
}
