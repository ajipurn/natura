import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api, ApiError, call, errorMessage } from "@/client/api";
import { usePermission } from "@/client/permissions";
import { Alert, Button, Card } from "@/components/ui";

export function BackupSettings() {
  const allowed = usePermission("backup");
  const backup = useMutation({
    mutationFn: async () => {
      const response = await api.admin.backup.$get().catch(() => {
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
    <Card className="mt-4 max-w-xl space-y-3">
      <h2 className="font-semibold">Backup database</h2>
      <p className="text-sm text-muted">Unduh seluruh data aplikasi dalam file JSON, termasuk data warga, akun, keuangan, dan riwayat pencatatan.</p>
      <p className="text-sm text-muted">Hanya admin yang dapat mengunduh backup. Simpan file di tempat aman karena berisi data pribadi dan akun.</p>
      <Button variant="secondary" disabled={backup.isPending} onClick={() => backup.mutate()}>
        <Download className="size-4" aria-hidden />
        Unduh backup
      </Button>
      <p role="status" className="text-sm text-muted">{backup.isPending ? "Menyiapkan backup…" : backup.isSuccess ? "File backup sudah disiapkan untuk diunduh." : ""}</p>
      {backup.isError && <Alert>{errorMessage(backup.error)}</Alert>}
    </Card>
  );
}
