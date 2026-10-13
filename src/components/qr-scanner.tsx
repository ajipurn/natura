import jsQR from "jsqr";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Flashlight, FlashlightOff, Keyboard, X } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createScanFeedback, type ScanFeedback } from "@/lib/scan-feedback";
import { Button, cx } from "./ui";

type Detect = (video: HTMLVideoElement) => Promise<string | null>;

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

/** Pakai BarcodeDetector bawaan (Chrome Android, cepat); kalau tidak ada, pakai jsQR (iPhone dll). */
async function createDetector(): Promise<Detect> {
  const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // jatuh ke jsQR
    }
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const { videoWidth: w, videoHeight: h } = video;
    if (!ctx || !w || !h) return null;
    const scale = Math.min(1, 720 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

function cameraErrorMessage(err: unknown): string {
  if (!window.isSecureContext) return "Kamera hanya bisa dipakai lewat HTTPS.";
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") {
    return "Izin kamera ditolak. Izinkan akses kamera untuk situs ini di pengaturan browser, lalu coba lagi.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Kamera tidak ditemukan di perangkat ini.";
  if (name === "NotReadableError") return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.";
  return "Kamera tidak bisa dibuka.";
}

const SCAN_INTERVAL_MS = 120;
const TORCH_CHECK_INTERVAL_MS = 250;
const TORCH_CHECK_ATTEMPTS = 20;
/**
 * QR yang sama diabaikan selama masih terlihat kamera (dan sampai 2,5 detik setelahnya),
 * supaya rumah yang baru dicatat tidak langsung terbuka lagi.
 */
const SAME_CODE_COOLDOWN_MS = 2500;
const FEEDBACK_MS = 650;
const RETRY_DELAY_MS = 600;

export function QrScanner({
  paused,
  onDetect,
  onClose,
  onManual,
  description,
  finalFocus,
  feedback,
  retryKey = 0,
}: {
  /** Tidak memicu onDetect (mis. saat lembar rumah sedang terbuka), kamera tetap menyala. */
  paused: boolean;
  onDetect: (text: string) => void;
  onClose: () => void;
  /** Cadangan kalau QR tidak terbaca: cari rumah dengan mengetik. */
  onManual?: () => void;
  description?: ReactNode;
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
  /** Disiapkan lewat klik pembuka scanner; pemanggil menutup resource ini setelah scanner selesai. */
  feedback?: ScanFeedback;
  /** Ubah saat form hasil scan dibatalkan; QR yang sama boleh dibaca lagi tanpa membuka ulang kamera. */
  retryKey?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pausedRef = useRef(paused);
  const onDetectRef = useRef(onDetect);
  const lastRef = useRef<{ text: string; seenAt: number } | null>(null);
  const retryKeyRef = useRef(retryKey);
  const retryAtRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchPending, setTorchPending] = useState(false);
  const [torchError, setTorchError] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
    onDetectRef.current = onDetect;
    if (retryKeyRef.current !== retryKey) {
      retryKeyRef.current = retryKey;
      lastRef.current = null;
      // Beri waktu form menutup sebelum QR di belakangnya membuka hasil scan lagi.
      retryAtRef.current = Date.now() + RETRY_DELAY_MS;
    }
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let torchTimer: ReturnType<typeof setTimeout> | undefined;
    let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
    const scanFeedback = feedback ?? createScanFeedback();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(cameraErrorMessage(null));
        setStarting(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        if (!stopped) {
          setError(cameraErrorMessage(err));
          setStarting(false);
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (stopped) return;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      function checkTorchSupport(attemptsLeft: number) {
        if (stopped || !track.getCapabilities) return;
        try {
          const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean | boolean[] };
          const supported = Array.isArray(caps.torch) ? caps.torch.includes(true) : caps.torch === true;
          if (supported) {
            setTorchSupported(true);
            return;
          }
        } catch {
          // Kemampuan kamera bisa belum siap walaupun video sudah mulai diputar.
        }
        // Chrome dapat melaporkan torch setelah kamera benar-benar mengirim gambar.
        if (attemptsLeft > 1) {
          torchTimer = setTimeout(() => checkTorchSupport(attemptsLeft - 1), TORCH_CHECK_INTERVAL_MS);
        }
      }
      checkTorchSupport(TORCH_CHECK_ATTEMPTS);
      setStarting(false);

      const detect = await createDetector();
      const tick = async () => {
        if (stopped) return;
        // Tetap membaca saat dijeda supaya QR yang masih terlihat tidak dianggap baru.
        if (video.readyState >= 2) {
          try {
            const text = await detect(video);
            const now = Date.now();
            const last = lastRef.current;
            if (text && !stopped) {
              if (last && last.text === text && now - last.seenAt < SAME_CODE_COOLDOWN_MS) {
                last.seenAt = now;
              } else if (!pausedRef.current && now >= retryAtRef.current) {
                lastRef.current = { text, seenAt: now };
                setDetected(true);
                clearTimeout(feedbackTimer);
                feedbackTimer = setTimeout(() => setDetected(false), FEEDBACK_MS);
                scanFeedback.play();
                onDetectRef.current(text);
              }
            }
          } catch {
            // frame gagal dibaca; coba frame berikutnya
          }
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(torchTimer);
      clearTimeout(feedbackTimer);
      if (!feedback) scanFeedback.dispose();
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, [feedback]);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track || torchPending) return;
    const next = !torchOn;
    setTorchPending(true);
    setTorchError(null);
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      if (trackRef.current === track) setTorchOn(next);
    } catch {
      if (trackRef.current === track) {
        setTorchError(next ? "Senter belum bisa dinyalakan. Coba lagi." : "Senter belum bisa dimatikan. Coba lagi.");
      }
    } finally {
      if (trackRef.current === track) setTorchPending(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
    <Dialog.Popup initialFocus={true} finalFocus={finalFocus} className="fixed inset-0 z-40 flex flex-col bg-black text-white outline-none">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <Dialog.Title className="font-semibold">Scan QR rumah</Dialog.Title>
        <Button
          variant="plain"
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full bg-white/15"
          aria-label="Tutup scanner"
        >
          <X className="size-6" />
        </Button>
      </div>

      <p role="status" className="px-4 pt-3 text-sm text-white/90">{description}</p>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cx(
                "relative flex aspect-square w-[70%] max-w-80 items-center justify-center rounded-3xl border-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-colors motion-reduce:transition-none",
                detected ? "border-emerald-400" : paused ? "border-white/30" : "border-white/90",
              )}
            >
              {detected && (
                <p role="status" className="flex items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-sm font-semibold text-white">
                  <Check className="size-5 text-emerald-400" aria-hidden /> QR terbaca
                </p>
              )}
            </div>
          </div>
        )}
        {starting && !error && (
          <p className="absolute inset-x-0 top-1/2 text-center text-white/80">Membuka kamera…</p>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
            <p className="rounded-2xl bg-white/10 p-4 text-center">{error}</p>
            {onManual && (
              <Button
                variant="plain"
                onClick={onManual}
                className="flex h-11 items-center gap-2 rounded-full bg-white px-6 font-semibold text-black"
              >
                <Keyboard className="size-5" /> Catat manual
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Saat kamera error, tombol manual sudah ada di tengah layar. */}
      <div
        className={cx(
          "flex items-center justify-between gap-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3",
          error && "invisible",
        )}
      >
        <p role="status" className="text-sm text-white/80">{torchError ?? "Arahkan kamera ke stiker QR di wadah jimpitan."}</p>
        {onManual && (
          <Button
            variant="plain"
            onClick={onManual}
            className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold"
          >
            <Keyboard className="size-5" /> Ketik manual
          </Button>
        )}
        {torchSupported && (
          <Button
            variant="plain"
            onClick={toggleTorch}
            disabled={torchPending}
            className={cx(
              "flex size-12 shrink-0 items-center justify-center rounded-full",
              torchOn ? "bg-yellow-300 text-black" : "bg-white/15",
            )}
            aria-label={torchOn ? "Matikan senter" : "Nyalakan senter"}
            aria-pressed={torchOn}
          >
            {torchOn ? <Flashlight className="size-6" /> : <FlashlightOff className="size-6" />}
          </Button>
        )}
      </div>
    </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
