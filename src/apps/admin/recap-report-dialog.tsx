import { Download, FileText, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { api, ApiError, call } from "@/client/api";
import { createReportStamp, loadReportLogo, readReportImage } from "@/client/report-image";
import { Dialog } from "@/components/dialog";
import { SegmentedControl } from "@/components/toggle-group";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { formatMonth } from "@/lib/dates";
import { buildRecapPeriodReport, DEFAULT_REPORT_DETAILS, type ReportImage } from "@/lib/recap-report";
import { MAX_REPORT_MONTHS, reportMonths, reportPeriodLabel } from "@/lib/recap-report-period";
import type { MonthRecap } from "@/lib/types";

type ReportFormat = "pdf" | "docx";

export function RecapReportDialog({ open, onClose, month, data, saveFile }: {
  open: boolean;
  onClose: () => void;
  month: string;
  data?: MonthRecap & { communityName: string; logoUrl?: string | null };
  saveFile: (blob: Blob, filename: string) => void;
}) {
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [fromMonth, setFromMonth] = useState(month);
  const [toMonth, setToMonth] = useState(month);
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState(DEFAULT_REPORT_DETAILS.address);
  const [place, setPlace] = useState(DEFAULT_REPORT_DETAILS.place);
  const [chairName, setChairName] = useState(DEFAULT_REPORT_DETAILS.chairName);
  const [stamp, setStamp] = useState<ReportImage | null>(null);
  const [stampPending, setStampPending] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);
  const ready = data?.month === month;
  let periodError: string | null = null, months: string[] = [];
  try { months = reportMonths(fromMonth, toMonth); }
  catch (cause) { periodError = cause instanceof Error ? cause.message : "Pilih periode laporan."; }
  const close = () => { controllerRef.current?.abort(); onClose(); };

  async function download() {
    if (!data || !ready || pending || stampPending || periodError) return;
    const controller = new AbortController(); controllerRef.current = controller;
    setPending(true); setError(null);
    try {
      const recaps: MonthRecap[] = [];
      for (const selectedMonth of months) {
        if (controller.signal.aborted) return;
        setLoadingMonth(selectedMonth);
        // Rentang memakai data baru setiap bulan; satu bulan yang sedang terbuka sudah lengkap di halaman.
        recaps.push(months.length === 1 && selectedMonth === month ? data : await call(api.rekap.$get({ query: { bulan: selectedMonth } }, { init: { signal: controller.signal } })));
      }
      setLoadingMonth(null);
      const logo = await loadReportLogo(data.logoUrl);
      const reportStamp = stamp ?? await createReportStamp(logo, data.communityName);
      const report = buildRecapPeriodReport(recaps, data.communityName, fromMonth, toMonth, new Date(), { address, place, chairName, logo, stamp: reportStamp });
      // Generator hanya dimuat saat dibutuhkan, bukan bersama halaman Rekap.
      const blob = format === "pdf"
        ? (await import("@/lib/recap-report-pdf")).buildRecapPdf(report)
        : await (await import("@/lib/recap-report-docx")).buildRecapDocx(report);
      if (controller.signal.aborted) return;
      saveFile(blob, `laporan-jimpitan-${fromMonth}${fromMonth === toMonth ? "" : `-sampai-${toMonth}`}.${format}`);
      onClose();
    } catch (cause) {
      if (!controller.signal.aborted) setError(`Laporan belum berhasil dibuat. ${cause instanceof ApiError ? cause.message : "Periksa koneksi, lalu coba unduh lagi."}`);
    } finally { controllerRef.current = null; setLoadingMonth(null); setPending(false); }
  }

  async function selectStamp(file: File) {
    setStampPending(true); setStampError(null); setStamp(null);
    try { setStamp(await readReportImage(file)); }
    catch (cause) { setStampError(cause instanceof Error ? cause.message : "Stempel belum bisa dibaca. Pilih gambar lain."); }
    finally { setStampPending(false); }
  }

  return (
    <Dialog open={open} onClose={close} title="Buat laporan" description={periodError ? "Pilih periode rekap jimpitan" : `Rekap jimpitan ${reportPeriodLabel(fromMonth, toMonth)}`} footer={
      <>
        <Button variant="secondary" onClick={close}>Batal</Button>
        <Button onClick={() => void download()} disabled={!ready || pending || stampPending || Boolean(periodError)} aria-busy={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          {pending ? "Menyiapkan laporan…" : `Unduh ${format === "pdf" ? "PDF" : "Word"}`}
        </Button>
      </>
    }>
      <div className="space-y-5">
        <fieldset className="min-w-0 space-y-3" disabled={pending || stampPending}>
          <legend className="text-sm font-semibold">Periode laporan</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bulan awal"><Input type="month" value={fromMonth} onValueChange={setFromMonth} required /></Field>
            <Field label="Bulan akhir"><Input type="month" value={toMonth} onValueChange={setToMonth} min={fromMonth || undefined} required /></Field>
          </div>
          <p className="text-xs text-muted">Seluruh bulan awal sampai bulan akhir disertakan. Maksimal {MAX_REPORT_MONTHS} bulan dalam satu laporan.</p>
          {periodError && <Alert>{periodError}</Alert>}
        </fieldset>
        <div>
          <p className="mb-2 text-sm font-medium">Format laporan</p>
          <SegmentedControl aria-label="Format laporan" fill value={format} onValueChange={setFormat} options={[
            { value: "pdf", label: "PDF", icon: FileText, disabled: pending },
            { value: "docx", label: "Word (.docx)", icon: FileText, disabled: pending },
          ]} />
          <p className="mt-2 text-xs text-muted">{format === "pdf" ? "Siap dibagikan dan dicetak di kertas A4." : "Teks dan tabel dapat diedit di Microsoft Word."}</p>
        </div>
        <fieldset className="min-w-0 space-y-3" disabled={pending || stampPending}>
          <legend className="mb-2 text-sm font-semibold">Kop dan pengesahan</legend>
          <Field label="Alamat pada kop (opsional)">
            <Textarea rows={2} maxLength={240} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Alamat paguyuban" />
          </Field>
          <Field label="Nama Ketua Paguyuban (opsional)" hint="Dicetak di bawah ruang tanda tangan. Jika kosong, tersedia garis untuk menulis nama.">
            <Input maxLength={100} value={chairName} onValueChange={setChairName} placeholder="Nama lengkap ketua" />
          </Field>
          <Field label="Tempat penerbitan (opsional)">
            <Input maxLength={80} value={place} onValueChange={setPlace} placeholder="Nama kota atau kabupaten" />
          </Field>
          <p className="text-xs text-muted">Stempel paguyuban dari gambar jadwal ronda otomatis digunakan pada laporan.</p>
          <Field label="Ganti gambar stempel (opsional)" hint="PNG, JPG, atau WebP, maksimal 5 MB. Gambar pengganti hanya dipakai dalam laporan ini.">
            <Input type="file" accept="image/png,image/jpeg,image/webp" className="py-2 text-sm" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void selectStamp(file);
            }} />
          </Field>
          {stamp && <div className="flex items-center gap-3">
            <img src={stamp.dataUrl} alt="Pratinjau stempel" className="h-20 w-28 rounded-lg border border-line bg-white object-contain p-2" />
            <Button variant="ghost" size="sm" onClick={() => setStamp(null)}>Gunakan stempel jadwal</Button>
          </div>}
          {stampPending && <p role="status" className="text-xs text-muted">Menyiapkan gambar stempel…</p>}
          {stampError && <Alert>{stampError}</Alert>}
        </fieldset>
        <div className="rounded-xl border border-line bg-bg/50 p-4 text-sm">
          <p className="font-semibold">Isi laporan</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
            <li>Kop paguyuban, stempel, dan ruang tanda tangan ketua</li>
            <li>{months.length > 1 ? "Ringkasan periode, rincian per bulan, dan sumber jimpitan" : "Ringkasan bulan dan sumber jimpitan"}</li>
            <li>Total per blok dan hasil ronda per malam</li>
            <li>Rekap per rumah dan status pembayaran periode</li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">Mencakup semua rumah, tanpa mengikuti filter tabel. Total mengikuti periode yang dibayar, seperti pada rekap bulanan.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        {pending && <p role="status" className="text-sm text-muted">{loadingMonth ? `Memuat rekap ${formatMonth(loadingMonth)}…` : `Menyiapkan laporan ${format === "pdf" ? "PDF" : "Word"}…`}</p>}
      </div>
    </Dialog>
  );
}
