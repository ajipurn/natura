import { Maximize, Minus, Plus } from "lucide-react";
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
 * supaya tidak menutupi rumah. Zoom 100% memuat seluruh isi ke lebar dan tinggi bingkai.
 */
export function ZoomPane({
  children,
  aspectRatio,
  readableWidth,
  focus,
  className,
}: {
  children: ReactNode;
  /** Perbandingan lebar/tinggi denah, untuk menghitung skala yang muat ke bingkai. */
  aspectRatio: number;
  focus?: ZoomFocus | null;
  /** Lebar minimum (px) agar isi terbaca; zoom awal dinaikkan di layar sempit lalu ditengahkan. */
  readableWidth?: number;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Scrollbar aplikasi; elemen scroll tetap `scrollRef` (dipakai untuk zoom dan menuju titik).
  const [initScrollbars] = useOverlayScrollbars({ defer: true });
  useEffect(() => {
    const host = hostRef.current;
    const viewport = scrollRef.current;
    if (host && viewport) initScrollbars({ target: host, elements: { viewport, content: viewport } });
  }, [initScrollbars]);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [fittedWidth, setFittedWidth] = useState(0);
  const zoom = ZOOM_LEVELS[zoomIndex];
  const previousSize = useRef<{ width: number; viewportWidth: number; viewportHeight: number } | null>(null);
  const centerNext = useRef(false);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const resize = () => setFittedWidth(Math.floor(Math.min(el.clientWidth, el.clientHeight * aspectRatio)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspectRatio]);
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
    if (!el || !fittedWidth) return;
    const next = { width: fittedWidth * zoom, viewportWidth: el.clientWidth, viewportHeight: el.clientHeight };
    const previous = previousSize.current;
    if (previous?.width === next.width && previous.viewportWidth === next.viewportWidth && previous.viewportHeight === next.viewportHeight) return;
    if (!previous || centerNext.current) {
      centerNext.current = false;
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    } else {
      // Saat fit, denah lebih sempit dari bingkai: ruang kosong di samping tidak ikut di-zoom.
      const oldInset = Math.max(0, (previous.viewportWidth - previous.width) / 2);
      const newInset = Math.max(0, (next.viewportWidth - next.width) / 2);
      const ratio = next.width / previous.width;
      el.scrollLeft = (el.scrollLeft + previous.viewportWidth / 2 - oldInset) * ratio + newInset - next.viewportWidth / 2;
      el.scrollTop = (el.scrollTop + previous.viewportHeight / 2) * ratio - next.viewportHeight / 2;
    }
    previousSize.current = next;
  }, [zoom, fittedWidth]);

  // Dijalankan setelah efek zoom di atas, jadi titik tujuan yang menang. Hanya sekali per key,
  // bukan setiap posisi bergeser.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || !fittedWidth || !focus || handledFocus.current === focus.key) return;
    handledFocus.current = focus.key;
    const inset = Math.max(0, (el.clientWidth - content.clientWidth) / 2);
    el.scrollLeft = inset + focus.fx * content.clientWidth - el.clientWidth / 2;
    el.scrollTop = focus.fy * content.clientHeight - el.clientHeight / 2;
  }, [focus, zoom, fittedWidth]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !readableWidth) return;
    const width = Math.min(el.clientWidth, el.clientHeight * aspectRatio);
    const fit = ZOOM_LEVELS.findIndex((z) => width * z >= readableWidth);
    const initial = fit === -1 ? ZOOM_LEVELS.length - 1 : fit;
    if (initial > 0) {
      centerNext.current = true;
      setZoomIndex((current) => Math.max(current, initial));
    }
  }, [readableWidth, aspectRatio]);

  return (
    <div className={cx("overflow-hidden rounded-2xl border border-line bg-card", className)}>
      <div ref={hostRef}>
        <div ref={scrollRef} style={{ aspectRatio }} className="max-h-[60dvh] overflow-auto overscroll-contain">
          <div ref={contentRef} className="mx-auto" style={{ width: fittedWidth ? fittedWidth * zoom : "100%" }}>{children}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 border-t border-line px-2 py-1.5">
        <span className="mr-auto pl-1 text-xs text-muted">Zoom {Math.round(zoom * 100)}%</span>
        <Button
          variant="secondary"
          size="sm"
          className="h-10 max-sm:size-11 max-sm:p-0"
          onClick={() => {
            centerNext.current = zoomIndex !== 0;
            if (zoomIndex === 0 && scrollRef.current) {
              scrollRef.current.scrollLeft = 0;
              scrollRef.current.scrollTop = 0;
            }
            setZoomIndex(0);
          }}
          aria-label="Pas ke layar"
          title="Tampilkan seluruh denah"
        >
          <Maximize aria-hidden className="size-4" /> <span className="max-sm:sr-only">Pas ke layar</span>
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="max-sm:size-11"
          onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
          disabled={zoomIndex === 0}
          aria-label="Perkecil denah"
        >
          <Minus className="size-5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="max-sm:size-11"
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
