"use client";

import { Minus, Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

const ZOOM_LEVELS = [1, 1.5, 2, 3, 4];

/**
 * Bingkai denah yang bisa di-zoom dan digeser. Tombol zoom ada di bawah, di luar denah,
 * supaya tidak menutupi rumah. Isi (`children`) selebar bingkai × zoom.
 */
export function ZoomPane({
  children,
  readableWidth,
  className,
}: {
  children: ReactNode;
  /** Lebar minimum (px) agar isi terbaca; zoom awal dinaikkan di layar sempit lalu ditengahkan. */
  readableWidth?: number;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_LEVELS[zoomIndex];
  const prevZoom = useRef(zoom);
  const centerNext = useRef(false);

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
      <div ref={scrollRef} className="max-h-[60vh] overflow-auto overscroll-contain">
        <div style={{ width: `${zoom * 100}%` }}>{children}</div>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-line px-2 py-1.5">
        <span className="mr-auto pl-1 text-xs text-muted">Zoom {Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
          disabled={zoomIndex === 0}
          className="flex size-10 items-center justify-center rounded-lg border border-line disabled:opacity-40"
          aria-label="Perkecil denah"
        >
          <Minus className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          className="flex size-10 items-center justify-center rounded-lg border border-line disabled:opacity-40"
          aria-label="Perbesar denah"
        >
          <Plus className="size-5" />
        </button>
      </div>
    </div>
  );
}
