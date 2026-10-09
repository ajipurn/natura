import { useMutation } from "@tanstack/react-query";
import { MapPinPlus } from "lucide-react";
import { api, call } from "@/client/api";
import { usePermission } from "@/client/permissions";
import { invalidate } from "@/client/query";
import { Alert, Button } from "@/components/ui";
import { HOUSE_REFRESH } from "../queries";

/**
 * Daftarkan sekaligus semua kavling berpenghuni di denah yang belum punya data rumah.
 * `banner` = tampil sebagai pemberitahuan di atas denah (tetap terpasang supaya pesan hasilnya terlihat).
 */
export function RegisterPlanHouses({ count, banner = false }: { count: number; banner?: boolean }) {
  const canEdit = usePermission("houses", true);
  const register = useMutation({
    mutationFn: () => call(api.admin.rumah["dari-denah"].$post()),
    onSuccess: () => invalidate(...HOUSE_REFRESH),
  });
  if (!canEdit) return null;
  const button = count > 0 && (
    <Button
      disabled={register.isPending}
      onClick={() => window.confirm(`Daftarkan ${count} rumah dari denah? Nama KK bisa diisi nanti.`) && register.mutate()}
      variant="secondary" size="sm" className="shrink-0"
    >
      <MapPinPlus className="size-4" /> {register.isPending ? "Mendaftarkan…" : `Daftarkan ${count} rumah dari denah`}
    </Button>
  );
  const messages = (
    <>
      {register.isError && <Alert>{register.error.message}</Alert>}
      {register.isSuccess && <Alert tone="success">{register.data.success}</Alert>}
    </>
  );

  if (!banner) {
    return (
      <div className="flex flex-col items-center gap-2">
        {button}
        {messages}
      </div>
    );
  }
  return (
    <>
      {count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <p>
            <strong>{count} kavling</strong> berpenghuni di denah belum terdaftar. Ketuk kavling oranye untuk menambah satu per
            satu, atau daftarkan semuanya sekaligus.
          </p>
          {button}
        </div>
      )}
      {messages}
    </>
  );
}
