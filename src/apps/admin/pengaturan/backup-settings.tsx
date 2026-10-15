import { useMutation } from "@tanstack/react-query";
import { Check, Database, Download, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { api, ApiError, call, errorMessage } from "@/client/api";
import { usePermission } from "@/client/permissions";
import { Alert, Button, Card } from "@/components/ui";
import { RadioCards } from "@/components/choice";
import { AutoBackupSettings } from "./auto-backup-settings";

export function BackupSettings() {
  const allowed = usePermission("backup");
  const [format, setFormat] = useState<"sql" | "json">("sql");
  const backup = useMutation({
    mutationFn: async (format: "sql" | "json") => {
      const response = await api.admin.backup.$get({ query: { format } }).catch(() => {
        throw new ApiError(0, "Tidak ada koneksi internet. Coba lagi.");
      });
      if (!response.ok) return call(Promise.resolve(response));
      const fileName = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
      if (!fileName) throw new Error("File backup belum dapat disiapkan. Coba lagi.");
      const blob = await response.blob().catch(() => {
        throw new ApiError(0, "Unduhan backup terputus. Periksa koneksi dan coba lagi.");
      });
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), {
        href: url,
        download: fileName,
      });
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
  });

  if (!allowed) return null;
  return (
    <Card className="min-w-0 space-y-4 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Database className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight">Backup database</h2>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted">Unduh salinan data warga, akun, keuangan, dan riwayat pencatatan.</p>
        </div>
      </div>
      <RadioCards
        legend="Format backup"
        value={format}
        onValueChange={(value) => { setFormat(value); backup.reset(); }}
        disabled={backup.isPending}
        options={[
          { value: "sql", label: <span className="flex items-center gap-2">SQL (.sql){format === "sql" && <Check className="size-3.5" aria-hidden />}</span>, hint: "Struktur dan data untuk pemulihan." },
          { value: "json", label: <span className="flex items-center gap-2">JSON (.json){format === "json" && <Check className="size-3.5" aria-hidden />}</span>, hint: "Data aplikasi untuk impor khusus." },
        ]}
      />
      <div className="flex items-start gap-2 rounded-xl bg-bg/60 p-3 text-xs leading-relaxed text-muted">
        <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>Khusus admin. Berisi data pribadi dan akun, jadi simpan file di tempat aman.</p>
      </div>
      <div className="border-t border-line pt-4">
        <Button variant="secondary" className="w-full" disabled={backup.isPending} onClick={() => backup.mutate(format)}>
          <Download className="size-4" aria-hidden />
          Unduh backup
        </Button>
        <p role="status" className="text-sm text-muted [&:not(:empty)]:mt-3">{backup.isPending ? "Menyiapkan backup…" : backup.isSuccess ? "File backup sudah disiapkan untuk diunduh." : ""}</p>
        {backup.isError && <div className="mt-3"><Alert>{errorMessage(backup.error)}</Alert></div>}
      </div>
      <AutoBackupSettings />
    </Card>
  );
}
