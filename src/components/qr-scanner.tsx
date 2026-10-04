"use client";

import jsQR from "jsqr";
import { Flashlight, FlashlightOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

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
/**
 * QR yang sama diabaikan selama masih terlihat kamera (dan sampai 2,5 detik setelahnya),
 * supaya rumah yang baru dicatat tidak langsung terbuka lagi.
 */
const SAME_CODE_COOLDOWN_MS = 2500;

export function QrScanner({
  paused,
  onDetect,
  onClose,
}: {
  /** Tidak memicu onDetect (mis. saat lembar rumah sedang terbuka), kamera tetap menyala. */
  paused: boolean;
  onDetect: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pausedRef = useRef(paused);
  const onDetectRef = useRef(onDetect);
  const lastRef = useRef<{ text: string; seenAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

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
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchSupported(Boolean(caps?.torch));
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
              } else if (!pausedRef.current) {
                lastRef.current = { text, seenAt: now };
                navigator.vibrate?.(60);
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
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, []);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <p className="font-semibold">Scan QR rumah</p>
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full bg-white/15"
          aria-label="Tutup scanner"
        >
          <X className="size-6" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cx(
                "aspect-square w-[70%] max-w-80 rounded-3xl border-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-colors",
                paused ? "border-white/30" : "border-white/90",
              )}
            />
          </div>
        )}
        {starting && !error && (
          <p className="absolute inset-x-0 top-1/2 text-center text-white/80">Membuka kamera…</p>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="rounded-2xl bg-white/10 p-4 text-center">{error}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
        <p className="text-sm text-white/80">Arahkan kamera ke stiker QR di wadah jimpitan.</p>
        {torchSupported && (
          <button
            type="button"
            onClick={toggleTorch}
            className={cx(
              "flex size-12 shrink-0 items-center justify-center rounded-full",
              torchOn ? "bg-yellow-300 text-black" : "bg-white/15",
            )}
            aria-label={torchOn ? "Matikan senter" : "Nyalakan senter"}
            aria-pressed={torchOn}
          >
            {torchOn ? <Flashlight className="size-6" /> : <FlashlightOff className="size-6" />}
          </button>
        )}
      </div>
    </div>
  );
}
