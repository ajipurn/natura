import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { QrScanner } from "@/components/qr-scanner";
import { houseLabel } from "@/lib/houses";
import { formatRupiah } from "@/lib/format";
import { wargaPath } from "@/lib/app-paths";
import { parseQrToken } from "@/lib/qr";
import { recordingHoursLabel } from "@/lib/recording-window";
import type { ScanFeedback } from "@/lib/scan-feedback";
import { rondaPaymentPeriods } from "@/lib/payments";
import type { CollectionMethod, HouseDTO } from "@/lib/types";
import { HouseSheet } from "./ronda/house-sheet";
import { HouseSearch } from "./ronda/house-search";
import { useOptionalRondaStore } from "./ronda/ronda-store";

/** Scanner tersedia bagi semua akun; hanya petugas yang jaga dalam jam pencatatan mendapat form. */
export function ScanQr({ onClose, triggerRef, feedback }: { onClose: () => void; triggerRef: RefObject<HTMLButtonElement | null>; feedback?: ScanFeedback }) {
  const store = useOptionalRondaStore();
  const [active, setActive] = useState<{ house: HouseDTO; method: CollectionMethod } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const snapshot = store?.snapshot;
  const periods = snapshot && store ? rondaPaymentPeriods(snapshot, store.date) : [];
  const canRecord = Boolean(store?.canRecord);
  const loading = Boolean(store && (!store.loaded || (!snapshot && store.status === "syncing")));
  useEffect(() => {
    if (canRecord) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tutup form saat jadwal/jam pencatatan berakhir
    setActive(null);
    setSearchOpen(false);
  }, [canRecord]);
  const rejections = store?.rejections.map((r) => `${r.label}: ${r.error}`).join(" ");

  const hint = loading ? "Memuat jadwal…" : canRecord
    ? `Pencatatan jimpitan aktif · ${recordingHoursLabel(snapshot?.settings)}`
    : store?.onDuty
      ? `Di luar jam pencatatan (${recordingHoursLabel(snapshot?.settings)}). Scan membuka informasi rumah.`
      : "Scan membuka informasi dan riwayat jimpitan rumah.";

  function detect(text: string) {
    const token = parseQrToken(text);
    if (!token) {
      setMessage("Ini bukan QR rumah. Arahkan kamera ke stiker QR jimpitan.");
      return;
    }
    if (!canRecord) {
      window.location.assign(wargaPath(`/r/${token}`));
      return;
    }
    const house = snapshot?.houses.find((h) => h.token === token);
    if (!house) {
      setMessage("QR rumah tidak dikenal. Coba lagi atau cari rumah secara manual.");
      void store?.sync();
      return;
    }
    setMessage("");
    setActive({ house, method: "scan" });
  }

  return (
    <>
      <QrScanner
        paused={loading || active !== null || searchOpen}
        onDetect={detect}
        onClose={onClose}
        onManual={canRecord ? () => setSearchOpen(true) : undefined}
        description={rejections ? <span className="flex flex-wrap items-center gap-2">{rejections}<button type="button" className="min-h-11 rounded-xl bg-white/15 px-4 font-semibold" onClick={() => store?.dismissRejections()}>Oke</button></span> : message || hint}
        finalFocus={triggerRef}
        feedback={feedback}
        retryKey={retryKey}
      />
      {searchOpen && canRecord && snapshot && store && <HouseSearch
        houses={snapshot.houses}
        collections={store.collections}
        onPick={(house) => { setSearchOpen(false); setActive({ house, method: "manual" }); }}
        onClose={() => setSearchOpen(false)}
      />}
      {active && canRecord && snapshot && store && <HouseSheet
        key={`${active.house.id}-${active.method}`}
        house={active.house}
        existing={store.collections.get(active.house.id)}
        defaultAmount={snapshot.settings.defaultAmount}
        method={active.method}
        paymentPeriod={periods.find((p) => p.houseId === active.house.id)}
        paymentCell={snapshot.paymentCells?.[`${active.house.id}:${store.date}`]}
        onClose={() => {
          if (active.method === "scan") setRetryKey((key) => key + 1);
          setActive(null);
        }}
        onRecord={(status, amount) => {
          const saved = store.record(active.house, status, amount, active.method);
          setMessage(saved
            ? `${houseLabel(active.house)} · ${status === "filled" ? `Ada ${formatRupiah(amount)}` : status === "empty" ? "Dicatat kosong" : "Catatan dihapus"}`
            : "Pencatatan tidak tersedia. Periksa jadwal dan jam pencatatan.");
          setActive(null);
        }}
      />}
    </>
  );
}
