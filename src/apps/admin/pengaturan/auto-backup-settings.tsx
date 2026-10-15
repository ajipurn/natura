import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Send } from "lucide-react";
import { api, call, errorMessage } from "@/client/api";
import { SwitchField } from "@/components/choice";
import { Select } from "@/components/select";
import { Alert, Button } from "@/components/ui";

const queryKey = ["admin", "backup-settings"];
const hours = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, "0")}.00` }));

export function AutoBackupSettings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey, queryFn: () => call(api.admin.backup.settings.$get()), refetchInterval: 30_000 });
  const update = useMutation({
    mutationFn: (changes: { enabled?: boolean; hour?: number }) => call(api.admin.backup.settings.$put({ json: changes })),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  const send = useMutation({
    mutationFn: () => call(api.admin.backup.telegram.$post()),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  const status = query.data;
  const selectedHour = String(status?.hour ?? 2).padStart(2, "0");
  const busy = update.isPending || send.isPending || status?.inProgress;
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-primary" aria-hidden />Backup otomatis ke Telegram</h3>
        <p className="mt-1 text-pretty text-xs leading-relaxed text-muted">File SQL dikirim ke chat Telegram yang sudah terhubung. Pastikan hanya admin yang bisa mengakses chat tersebut.</p>
      </div>
      {query.isPending && <p role="status" className="text-sm text-muted">Memeriksa jadwal backup…</p>}
      {query.isError && <Alert>{errorMessage(query.error)}</Alert>}
      {status && <>
        <SwitchField
          label="Autobackup harian"
          description="Kirim file SQL setiap hari sesuai jam pilihan."
          checked={status.enabled}
          disabled={update.isPending || (!status.enabled && (!status.telegramConfigured || (!status.local && !status.cronConfigured)))}
          onCheckedChange={(enabled) => { if (!send.isPending) send.reset(); update.mutate({ enabled }); }}
          className="px-3 py-2"
        />
        <div>
          <Select label="Jam backup (WIB)" value={String(status.hour)} options={hours} searchPlaceholder="Cari jam…" disabled={update.isPending}
            onValueChange={(hour) => { if (!send.isPending) send.reset(); update.mutate({ hour: Number(hour) }); }} />
          <p className="mt-1.5 text-xs leading-relaxed text-muted">Dijadwalkan sekitar {selectedHour}.00–{selectedHour}.59 WIB. Langsung tersimpan.</p>
        </div>
        {status.disabled ? <p className="text-xs leading-relaxed text-muted">Pengiriman Telegram dinonaktifkan untuk lingkungan ini.</p>
          : !status.telegramConfigured ? <p className="text-xs leading-relaxed text-muted">Hubungkan bot di bagian Notifikasi Telegram terlebih dahulu.</p>
            : status.local ? <p className="text-xs leading-relaxed text-muted">Jadwal otomatis berjalan setelah deploy ke production. Di lokal, gunakan Kirim SQL sekarang.</p>
              : !status.cronConfigured && <Alert>Isi CRON_SECRET di Vercel, lalu deploy ulang agar autobackup berjalan.</Alert>}
        {status.lastSentAt ? <div className="rounded-xl bg-bg/60 p-3 text-xs leading-relaxed text-muted">
          <p>Terakhir terkirim {new Date(status.lastSentAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>
          {status.lastFileName && <p className="mt-1 break-all">{status.lastFileName}</p>}
        </div> : <p className="text-xs text-muted">Belum ada backup yang dikirim ke Telegram.</p>}
        {status.lastError && !send.isError && <Alert>{status.lastError}</Alert>}
        <Button variant="secondary" size="sm" className="w-full" disabled={!status.telegramConfigured || busy} onClick={() => { update.reset(); send.mutate(); }}>
          <Send className="size-4" aria-hidden />{send.isPending || status.inProgress ? "Mengirim SQL…" : "Kirim SQL sekarang"}
        </Button>
      </>}
      {(send.isPending || update.isPending) && <p role="status" className="text-xs text-muted">{send.isPending ? "Menyiapkan dan mengirim file SQL…" : "Menyimpan jadwal backup…"}</p>}
      {update.isError && <Alert>{errorMessage(update.error)}</Alert>}
      {send.isError && <Alert>{errorMessage(send.error)}</Alert>}
      {update.isSuccess && <Alert tone="success">{update.data.success}</Alert>}
      {send.isSuccess && <Alert tone="success">{send.data.success}</Alert>}
    </div>
  );
}
