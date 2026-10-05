import { Minus, Plus } from "lucide-react";
import { useOverlayScrollbars } from "overlayscrollbars-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, cx } from "./ui";

const ZOOM_LEVELS = [1, 1.5, 2, 3, 4];
/** Zoom minimum saat menuju sebuah titik (mis. lokasi petugas), supaya kavling di sekitarnya terbaca. */
const FOCUS_ZOOM_INDEX = 3;

/** Titik yang dituju, sebagai pecahan lebar/tinggi isi (0–1). Ganti `key` untuk menuju lagi. */
export type ZoomFocus = { fx: number; fy: number; key: number };

/**
 * Bingkai denah yang bisa di-zoom dan digeser. Tombol zoom ada di bawah, di luar denah,
 * supaya tidak menutupi rumah. Isi (`children`) selebar bingkai × zoom.
 */
export function ZoomPane({
  children,
  readableWidth,
  focus,
  className,
}: {
  children: ReactNode;
  focus?: ZoomFocus | null;
  /** Lebar minimum (px) agar isi terbaca; zoom awal dinaikkan di layar sempit lalu ditengahkan. */
  readableWidth?: number;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Scrollbar aplikasi; elemen scroll tetap `scrollRef` (dipakai untuk zoom dan menuju titik).
  const [initScrollbars] = useOverlayScrollbars({ defer: true });
  useEffect(() => {
    const host = hostRef.current;
    const viewport = scrollRef.current;
    if (host && viewport) initScrollbars({ target: host, elements: { viewport, content: viewport } });
  }, [initScrollbars]);
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_LEVELS[zoomIndex];
  const prevZoom = useRef(zoom);
  const centerNext = useRef(false);
  // Menuju titik tertentu (key baru): perbesar dulu kalau perlu; penggeserannya di efek di bawah.
  const [focusKey, setFocusKey] = useState<number | undefined>(undefined);
  if (focus && focus.key !== focusKey) {
    setFocusKey(focus.key);
    if (zoomIndex < FOCUS_ZOOM_INDEX) setZoomIndex(FOCUS_ZOOM_INDEX);
  }
  const handledFocus = useRef<number | undefined>(undefined);

  // Zoom berubah: pertahankan titik tengah tampilan (atau ke tengah untuk zoom awal).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || prevZoom.current === zoom) return;
    if (centerNext.current) {
      centerNext.current = false;
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    } else {
      const ratio = zoom / prevZoom.current;
      const centerX = el.scrollLeft + el.clientWidth / 2;
      const centerY = el.scrollTop + el.clientHeight / 2;
      el.scrollLeft = centerX * ratio - el.clientWidth / 2;
      el.scrollTop = centerY * ratio - el.clientHeight / 2;
    }
    prevZoom.current = zoom;
  }, [zoom]);

  // Dijalankan setelah efek zoom di atas, jadi titik tujuan yang menang. Hanya sekali per key,
  // bukan setiap posisi bergeser.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !focus || handledFocus.current === focus.key) return;
    handledFocus.current = focus.key;
    el.scrollLeft = focus.fx * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = focus.fy * el.scrollHeight - el.clientHeight / 2;
  }, [focus, zoom]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !readableWidth) return;
    const fit = ZOOM_LEVELS.findIndex((z) => el.clientWidth * z >= readableWidth);
    const initial = fit === -1 ? ZOOM_LEVELS.length - 1 : fit;
    if (initial > 0) {
      centerNext.current = true;
      setZoomIndex(initial);
    }
  }, [readableWidth]);

  return (
    <div className={cx("overflow-hidden rounded-2xl border border-line bg-card", className)}>
      <div ref={hostRef}>
        <div ref={scrollRef} className="max-h-[60vh] overflow-auto overscroll-contain">
          <div style={{ width: `${zoom * 100}%` }}>{children}</div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-line px-2 py-1.5">
        <span className="mr-auto pl-1 text-xs text-muted">Zoom {Math.round(zoom * 100)}%</span>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
          disabled={zoomIndex === 0}
          aria-label="Perkecil denah"
        >
          <Minus className="size-5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          aria-label="Perbesar denah"
        >
          <Plus className="size-5" />
        </Button>
      </div>
    </div>
  );
}
