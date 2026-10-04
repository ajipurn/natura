"use client";

import { useMemo } from "react";
import { houseLabelLong } from "@/lib/houses";
import { pointFromEvent, type MapPoint, type MapSize } from "@/lib/site-map";
import type { HouseDTO } from "@/lib/types";
import { cx } from "./ui";
import { ZoomPane } from "./zoom-pane";

export type MarkerState = "filled" | "empty" | "unchecked" | "vacant" | "neutral";

const MARKER_STYLES: Record<MarkerState, string> = {
  filled: "border-filled bg-filled text-white dark:text-black",
  empty: "border-empty bg-empty text-white dark:text-black",
  unchecked: "border-fg/70 bg-card text-fg",
  vacant: "border-dashed border-muted bg-card/80 text-muted",
  neutral: "border-primary bg-card text-primary",
};

export const STATE_TEXT: Record<MarkerState, string> = {
  filled: "ada",
  empty: "kosong",
  unchecked: "belum dicek",
  vacant: "rumah kosong/mudik",
  neutral: "",
};

/**
 * Denah perumahan: gambar latar (opsional) dengan penanda tiap rumah.
 * Posisi rumah disimpan 0–1 relatif terhadap denah, jadi tetap pas di semua ukuran layar dan zoom.
 */
export function SiteMap({
  houses,
  size,
  imageUrl,
  markers,
  pending,
  selectedId,
  onHouseClick,
  onMapClick,
  className,
}: {
  houses: HouseDTO[];
  size: MapSize;
  imageUrl: string | null;
  /** Status tiap rumah (id → status). Rumah tanpa status tampil netral. */
  markers?: Record<number, MarkerState>;
  /** Rumah yang catatannya belum terkirim. */
  pending?: Set<number>;
  selectedId?: number | null;
  onHouseClick?: (house: HouseDTO) => void;
  onMapClick?: (point: MapPoint) => void;
  className?: string;
}) {
  const placed = useMemo(() => houses.filter((h) => h.mapX != null && h.mapY != null), [houses]);

  // Tanpa gambar, tampilkan nama blok di atas kelompok rumahnya.
  const blockLabels = useMemo(() => {
    if (imageUrl) return [];
    const bounds = new Map<string, { x: number; y: number }>();
    for (const h of placed) {
      const b = bounds.get(h.block);
      bounds.set(h.block, { x: Math.min(b?.x ?? 1, h.mapX!), y: Math.min(b?.y ?? 1, h.mapY!) });
    }
    return [...bounds].map(([block, p]) => ({ block, ...p }));
  }, [placed, imageUrl]);

  return (
    <ZoomPane className={className}>
      <div
        className={cx(
          "relative w-full select-none",
          onMapClick && "cursor-crosshair",
          !imageUrl &&
            "bg-[linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] bg-[size:24px_24px]",
        )}
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
        onClick={(e) => {
          if (!onMapClick || e.target !== e.currentTarget) return;
          onMapClick(pointFromEvent(e, e.currentTarget.getBoundingClientRect()));
        }}
      >
        {imageUrl && (
          // Gambar milik pengguna dari rute yang butuh login; next/image tidak perlu di sini.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Denah perumahan"
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full"
          />
        )}

        {blockLabels.map((l) => (
          <span
            key={l.block}
            className="pointer-events-none absolute whitespace-nowrap text-xs font-bold uppercase tracking-wide text-muted"
            // Di atas penanda paling atas (tinggi penanda 28 px, jadi setengahnya 14 px + jarak).
            style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, transform: "translate(-14px, calc(-100% - 18px))" }}
          >
            Blok {l.block}
          </span>
        ))}

        {placed.map((h) => {
          const state = markers?.[h.id] ?? "neutral";
          const selected = selectedId === h.id;
          return (
            <button
              key={h.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onHouseClick?.(h);
              }}
              aria-label={`${houseLabelLong(h)}${STATE_TEXT[state] ? `, ${STATE_TEXT[state]}` : ""}${pending?.has(h.id) ? ", belum terkirim" : ""}`}
              aria-pressed={selected || undefined}
              className={cx(
                "absolute flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border-2 px-1 text-xs font-bold shadow-sm transition-transform active:scale-90",
                MARKER_STYLES[state],
                selected && "z-10 scale-125 ring-4 ring-primary/50",
              )}
              style={{ left: `${h.mapX! * 100}%`, top: `${h.mapY! * 100}%` }}
            >
              {h.number}
              {pending?.has(h.id) && (
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full border border-card bg-warn" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </ZoomPane>
  );
}
