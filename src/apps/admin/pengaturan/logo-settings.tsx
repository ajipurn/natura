import { useMutation } from "@tanstack/react-query";
import { RotateCcw, Upload } from "lucide-react";
import { useRef } from "react";
import { api, call, errorMessage } from "@/client/api";
import { refreshFavicon } from "@/client/favicon";
import { resizeLogo } from "@/client/logo-image";
import { invalidate } from "@/client/query";
import { Alert, Button } from "@/components/ui";
import { DEFAULT_LOGO_URL } from "@/lib/branding";

/** Logo lingkungan: langsung tersimpan begitu dipilih (diperkecil dulu di browser) atau dihapus. */
export function LogoSettings({ logoUrl }: { logoUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: async (file: File | null) =>
      call(api.admin.pengaturan.logo.$put({ json: { logo: file ? await resizeLogo(file) : null } })),
    // Logo tampil di dashboard, stiker QR, Beranda app, halaman rumah, dan sebagai favicon.
    onSuccess: () => {
      refreshFavicon();
      return invalidate(["admin"], ["warga"], ["rumah"]);
    },
  });

  return (
    <div className="flex items-start gap-4">
      {/* Latar putih (juga di mode gelap): sama seperti di stiker, logo transparan tetap terlihat. */}
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white">
        <img src={logoUrl ?? DEFAULT_LOGO_URL} alt={logoUrl ? "Logo saat ini" : "Logo bawaan Cluster Natura"} className="size-full object-contain p-1.5" />
      </div>
      <div className="min-w-0 space-y-2">
        <div>
          <p className="text-sm font-medium">Logo</p>
          <p className="text-xs text-muted">
            Tampil di stiker QR, Beranda app, dashboard, dan ikon tab. PNG, JPG, WebP, atau SVG;
            diperkecil otomatis dan langsung tersimpan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={save.isPending} onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> {save.isPending ? "Menyimpan…" : "Ganti logo"}
          </Button>
          {logoUrl && (
            <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => save.mutate(null)}>
              <RotateCcw className="size-4" /> Gunakan logo bawaan
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Dikosongkan supaya file yang sama bisa dipilih lagi.
            e.target.value = "";
            if (file) save.mutate(file);
          }}
        />
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      </div>
    </div>
  );
}
