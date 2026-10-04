"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { formatRupiah } from "@/lib/format";
import { houseLabel, searchHouses } from "@/lib/houses";
import type { HouseDTO } from "@/lib/types";
import type { MergedCollection } from "./use-ronda-store";

/**
 * Cari rumah dengan mengetik, untuk saat QR tidak bisa di-scan (stiker rusak, kamera bermasalah).
 * Muncul dari atas layar supaya tidak tertutup keyboard HP.
 */
export function HouseSearch({
  houses,
  collections,
  onPick,
  onClose,
}: {
  houses: HouseDTO[];
  collections: Map<number, MergedCollection>;
  onPick: (house: HouseDTO) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHouses(houses, query), [houses, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="house-search-title"
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-b-3xl bg-card p-4 pt-[max(env(safe-area-inset-top),16px)] text-fg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="house-search-title" className="text-lg font-bold">
            Catat manual
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full bg-idle-soft"
            aria-label="Tutup"
          >
            <X className="size-5" />
          </button>
        </div>
        <form
          className="relative mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (results.length === 1) onPick(results[0]);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            autoFocus
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contoh: A12, 12, atau nama KK"
            aria-label="Cari rumah"
            className="h-12 w-full rounded-xl border border-line bg-bg pl-10 pr-3 text-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </form>
        <p className="mt-2 text-xs text-muted">Untuk QR yang tidak bisa di-scan. Catatan ditandai “manual” di riwayat.</p>

        <ul className="mt-3 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {results.map((h) => {
            const c = collections.get(h.id);
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onPick(h)}
                  className="flex w-full items-center gap-3 px-1 py-3 text-left active:bg-idle-soft"
                >
                  <span className="w-16 shrink-0 text-lg font-bold">{houseLabel(h)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{h.ownerName ?? ""}</span>
                  <span
                    className={cx(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      c?.status === "filled" && "bg-filled-soft text-filled",
                      c?.status === "empty" && "bg-empty-soft text-empty",
                      !c && h.status === "vacant" && "border border-dashed border-line text-muted",
                      !c && h.status !== "vacant" && "bg-idle-soft text-muted",
                    )}
                  >
                    {c?.status === "filled"
                      ? formatRupiah(c.amount)
                      : c?.status === "empty"
                        ? "Kosong"
                        : h.status === "vacant"
                          ? "Mudik"
                          : "Belum"}
                  </span>
                </button>
              </li>
            );
          })}
          {query.trim() && results.length === 0 && (
            <li className="py-6 text-center text-sm text-muted">Tidak ada rumah yang cocok.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
