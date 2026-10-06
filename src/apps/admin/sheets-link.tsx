import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2Off, RefreshCw, Sheet, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { ChipGroup } from "@/components/toggle-group";
import { Alert, Button } from "@/components/ui";
import { formatMonth } from "@/lib/dates";
import { settingsQuery } from "./queries";

/**
 * Link CSV rekap untuk Google Sheets: admin membuat link rahasia, lalu menempel `=IMPORTDATA(link)` di
 * Sheet. Isinya blok, nomor, dan nominal tiap malam, tanpa nama warga. `month` = bulan yang sedang
 * dibuka di Rekap; kalau sudah lewat, admin bisa memilih rumus untuk bulan itu saja.
 */
export function SheetsLinkDialog({
  open,
  onClose,
  month,
  thisMonth,
}: {
  open: boolean;
  onClose: () => void;
  month: string;
  thisMonth: string;
}) {
  const query = useQuery({ ...settingsQuery, enabled: open });
  const [confirming, setConfirming] = useState<"baru" | "matikan" | null>(null);
  const [fixedMonth, setFixedMonth] = useState(false);
  const [copied, setCopied] = useState(false);
  const change = useMutation({
    mutationFn: (enabled: boolean) => call(api.admin.pengaturan["link-ekspor"].$post({ json: { enabled } })),
    onSuccess: async () => {
      await invalidate(["admin", "pengaturan"]);
      setConfirming(null);
    },
  });
  const token = query.data?.exportToken;
  const pastMonth = month !== thisMonth;

  function close() {
    setConfirming(null);
    setFixedMonth(false);
    change.reset();
    onClose();
  }

  let footer: ReactNode = null;
  if (query.data && !token) {
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          Batal
        </Button>
        <Button disabled={change.isPending} onClick={() => change.mutate(true)} data-autofocus>
          {change.isPending ? "Membuat…" : "Buat link"}
        </Button>
      </>
    );
  } else if (token && confirming) {
    footer = (
      <>
        <Button variant="ghost" onClick={() => setConfirming(null)}>
          Batal
        </Button>
        <Button
          variant={confirming === "matikan" ? "danger" : "primary"}
          disabled={change.isPending}
          onClick={() => change.mutate(confirming === "baru")}
          data-autofocus
        >
          {change.isPending ? "Memproses…" : confirming === "baru" ? "Buat link baru" : "Matikan link"}
        </Button>
      </>
    );
  } else if (token) {
    footer = (
      <>
        <Button variant="ghost" size="sm" className="text-empty hover:text-empty" onClick={() => setConfirming("matikan")}>
          <Link2Off className="size-4" /> Matikan link
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirming("baru")}>
          <RefreshCw className="size-4" /> Link baru
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Rekap di Google Sheets"
      description="Spreadsheet yang terisi sendiri dari rekap jimpitan."
      footer={footer}
    >
      <QueryState query={query}>
        {({ origin, fromEnv }) => {
          if (!token) {
            return (
              <div className="space-y-3 text-sm">
                <p>
                  Buat link khusus untuk Google Sheets, lalu tempel rumusnya di spreadsheet. Isinya blok, nomor rumah, dan nominal
                  tiap malam (tanpa nama warga), dan diperbarui sendiri oleh Google Sheets.
                </p>
                {change.isError && <Alert>{change.error.message}</Alert>}
              </div>
            );
          }

          if (confirming) {
            return (
              <div className="space-y-3 text-sm">
                <p className="font-semibold">{confirming === "baru" ? "Buat link baru?" : "Matikan link?"}</p>
                <p>
                  {confirming === "baru"
                    ? "Rumus yang sudah ditempel di Google Sheets berhenti terisi. Setelah ini, ganti rumus di spreadsheet dengan rumus yang baru."
                    : "Google Sheets tidak bisa mengambil rekap lagi sampai kamu membuat link baru."}
                </p>
                {change.isError && <Alert>{change.error.message}</Alert>}
              </div>
            );
          }

          const fixed = pastMonth && fixedMonth;
          const link = `${origin}/api/ekspor/${token}/rekap.csv${fixed ? `?bulan=${month}` : ""}`;
          const formula = `=IMPORTDATA("${link}")`;
          // Google Sheets mengambil link dari servernya sendiri, jadi alamat lokal tidak bisa dipakai.
          const isLocal = /\/\/(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(origin);

          return (
            <div className="space-y-4 text-sm">
              {pastMonth && (
                <ChipGroup
                  aria-label="Bulan rekap"
                  value={fixed ? "bulan" : "berjalan"}
                  onValueChange={(v) => setFixedMonth(v === "bulan")}
                  options={[
                    { value: "berjalan", label: "Selalu bulan berjalan" },
                    { value: "bulan", label: `Hanya ${formatMonth(month)}` },
                  ]}
                  className="flex-wrap"
                />
              )}
              <ol className="space-y-3">
                <Step n={1}>
                  Buka Google Sheets dan buat spreadsheet baru.{" "}
                  <a href="https://sheets.new" target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary">
                    Buat spreadsheet <ExternalLink className="size-3.5" />
                  </a>
                </Step>
                <Step n={2}>
                  Klik sel A1, lalu tempel rumus ini:
                  <div className="mt-2 flex items-start gap-1 rounded-xl border border-line bg-idle-soft/50 py-1 pl-3 pr-1">
                    <code className="min-w-0 flex-1 break-all py-1.5 font-mono text-xs">{formula}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(formula);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {
                          window.prompt("Salin rumus:", formula);
                        }
                      }}
                    >
                      <Copy className="size-4" /> {copied ? "Tersalin" : "Salin"}
                    </Button>
                  </div>
                </Step>
                <Step n={3}>
                  Tabel rekap muncul. Google Sheets mengambil datanya lagi kira-kira tiap jam.{" "}
                  {fixed
                    ? `Isinya tetap rekap ${formatMonth(month)}.`
                    : "Isinya selalu bulan berjalan dan pindah sendiri tiap awal bulan. Untuk menyimpan bulan yang sudah lewat, buka bulan itu di Rekap lalu tempel rumusnya di tab lain."}
                </Step>
              </ol>
              {(isLocal || !fromEnv) && (
                <p className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-warn">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {isLocal
                      ? "Ini alamat lokal: Google Sheets tidak bisa membukanya. Buka halaman ini dari alamat aplikasi yang sudah online, atau isi APP_URL."
                      : "Link memakai alamat yang sedang kamu buka. Isi APP_URL supaya link selalu memakai alamat tetap aplikasi."}
                  </span>
                </p>
              )}
              <p className="flex gap-2 text-muted">
                <Sheet className="mt-0.5 size-4 shrink-0" />
                <span>
                  Siapa pun yang memegang link ini bisa melihat rekapnya (tanpa nama warga). Kalau link tersebar, buat link baru.
                </span>
              </p>
            </div>
          );
        }}
      </QueryState>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </li>
  );
}
