import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { api, call, errorMessage } from "@/client/api";
import { usePermission } from "@/client/permissions";
import { Alert, Button, Card } from "@/components/ui";

export function TelegramSettings() {
  const client = useQueryClient(), canEdit = usePermission("settings", true);
  const query = useQuery({ queryKey: ["admin", "telegram"], queryFn: () => call(api.admin.pengaturan.telegram.$get()), refetchInterval: 30_000 });
  const test = useMutation({ mutationFn: () => call(api.admin.pengaturan.telegram.test.$post()), onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "telegram"] }) });
  const status = query.data;
  return <Card className="mt-4 max-w-xl space-y-3">
    <div className="flex items-start gap-3">
      <Send className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <h2 className="font-semibold">Notifikasi Telegram</h2>
        <p className="mt-1 text-sm text-muted">Permintaan dan hal yang perlu perhatian dikirim ke chat Telegram tujuan, beserta tautan ke dashboard.</p>
      </div>
    </div>
    {query.isPending && <p className="text-sm text-muted">Memeriksa pengaturan Telegram…</p>}
    {query.isError && <Alert>{errorMessage(query.error)}</Alert>}
    {status && <>
      <p className="text-sm"><span className={status.enabled ? "font-semibold text-primary" : "font-semibold"}>{status.enabled ? status.local ? "Aktif di lokal" : "Aktif" : status.disabled ? "Pengiriman dinonaktifkan" : "Belum terhubung"}</span>{status.enabled && status.pending > 0 && <span className="text-muted"> · {status.pending} pengingat menunggu dikirim</span>}</p>
      {status.disabled ? <p className="text-sm text-muted">Pengiriman dinonaktifkan melalui <code>TELEGRAM_DISABLED</code>. Deployment preview tidak mengirim notifikasi.</p> : !status.enabled ? <p className="text-sm text-muted">Isi <code>TELEGRAM_BOT_TOKEN</code> dan <code>TELEGRAM_CHAT_ID</code> {status.local ? "di .env.local, lalu mulai ulang bun run dev." : "di Environment Variables Vercel, lalu deploy ulang."} Token disimpan di server.</p> : status.local && <p className="text-sm text-muted">Notifikasi dikirim dari server lokal saat data berubah atau Ringkasan dibuka.</p>}
      {status.enabled && !status.local && !status.cronConfigured && <Alert>Isi CRON_SECRET di Vercel agar pengingat harian dan percobaan ulang terjadwal bisa berjalan.</Alert>}
      {status.lastSentAt && <p className="text-xs text-muted">Terakhir terkirim {new Date(status.lastSentAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>}
      {status.error && <Alert>{status.error}</Alert>}
    </>}
    {test.isError && <Alert>{errorMessage(test.error)}</Alert>}
    {test.isSuccess && <Alert tone="success">{test.data.success}</Alert>}
    {canEdit && <Button variant="secondary" size="sm" disabled={!status?.enabled || test.isPending} onClick={() => test.mutate()}><Send className="size-4" aria-hidden />{test.isPending ? "Mengirim…" : "Kirim pesan uji"}</Button>}
  </Card>;
}
