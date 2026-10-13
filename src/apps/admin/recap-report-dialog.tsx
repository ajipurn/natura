import { Download, FileText, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { SegmentedControl } from "@/components/toggle-group";
import { Alert, Button } from "@/components/ui";
import { formatMonth } from "@/lib/dates";
import { buildRecapReport } from "@/lib/recap-report";
import type { MonthRecap } from "@/lib/types";

type ReportFormat = "pdf" | "docx";

export function RecapReportDialog({ open, onClose, month, data, saveFile }: {
  open: boolean;
  onClose: () => void;
  month: string;
  data?: MonthRecap & { communityName: string };
  saveFile: (blob: Blob, filename: string) => void;
}) {
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = data?.month === month;

  async function download() {
    if (!data || !ready || pending) return;
    setPending(true); setError(null);
    try {
      const report = buildRecapReport(data, data.communityName, month);
      // Generator hanya dimuat saat dibutuhkan, bukan bersama halaman Rekap.
      const blob = format === "pdf"
        ? (await import("@/lib/recap-report-pdf")).buildRecapPdf(report)
        : await (await import("@/lib/recap-report-docx")).buildRecapDocx(report);
      saveFile(blob, `laporan-jimpitan-${month}.${format}`);
      onClose();
    } catch {
      setError("Laporan belum berhasil dibuat. Periksa koneksi, lalu coba unduh lagi.");
    } finally { setPending(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Buat laporan" description={`Rekap jimpitan ${formatMonth(month)}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button onClick={() => void download()} disabled={!ready || pending} aria-busy={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          {pending ? "Menyiapkan laporan…" : `Unduh ${format === "pdf" ? "PDF" : "Word"}`}
        </Button>
      </>
    }>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">Format laporan</p>
          <SegmentedControl aria-label="Format laporan" fill value={format} onValueChange={setFormat} options={[
            { value: "pdf", label: "PDF", icon: FileText, disabled: pending },
            { value: "docx", label: "Word (.docx)", icon: FileText, disabled: pending },
          ]} />
          <p className="mt-2 text-xs text-muted">{format === "pdf" ? "Siap dibagikan dan dicetak di kertas A4." : "Teks dan tabel dapat diedit di Microsoft Word."}</p>
        </div>
        <div className="rounded-xl border border-line bg-bg/50 p-4 text-sm">
          <p className="font-semibold">Isi laporan</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
            <li>Ringkasan bulan dan sumber jimpitan</li>
            <li>Total per blok dan hasil ronda per malam</li>
            <li>Rekap per rumah dan status pembayaran periode</li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">Mencakup semua rumah, tanpa mengikuti filter tabel. Total mengikuti periode yang dibayar, seperti pada rekap bulanan.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        {pending && <p role="status" className="sr-only">Menyiapkan laporan {format === "pdf" ? "PDF" : "Word"}.</p>}
      </div>
    </Dialog>
  );
}
