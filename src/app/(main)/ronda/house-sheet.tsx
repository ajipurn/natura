"use client";

import { Check, Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import { buttonClass, cx } from "@/components/ui";
import { formatTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { houseLabelLong } from "@/lib/houses";
import type { CollectionMethod, CollectionStatus, HouseDTO } from "@/lib/types";
import type { MergedCollection } from "./use-ronda-store";

const STEP = 500;

export function HouseSheet({
  house,
  existing,
  defaultAmount,
  method,
  onRecord,
  onClose,
}: {
  house: HouseDTO;
  existing: MergedCollection | undefined;
  defaultAmount: number;
  method: CollectionMethod;
  onRecord: (status: CollectionStatus | "none", amount: number) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(
    existing?.status === "filled" && existing.amount > 0 ? existing.amount : defaultAmount,
  );
  const presets = [...new Set([defaultAmount, 1000, 2000, 5000])].filter((n) => n > 0).sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="house-sheet-title"
        className="w-full max-w-lg rounded-t-3xl bg-card p-5 pb-[max(env(safe-area-inset-bottom),20px)] text-fg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {method === "scan" ? "Hasil scan" : "Catat manual"}
            </p>
            <h2 id="house-sheet-title" className="text-3xl font-bold tracking-tight">
              {houseLabelLong(house)}
            </h2>
            {house.ownerName && <p className="text-muted">{house.ownerName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full bg-idle-soft"
            aria-label="Tutup"
          >
            <X className="size-5" />
          </button>
        </div>

        {house.status === "vacant" && (
          <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
            Ditandai rumah kosong/mudik — tidak dihitung bolong.
          </p>
        )}
        {existing && (
          <p
            className={cx(
              "mt-3 rounded-xl px-3 py-2 text-sm",
              existing.status === "filled" ? "bg-filled-soft text-filled" : "bg-empty-soft text-empty",
            )}
          >
            Sudah dicatat {formatTime(existing.recordedAt)}
            {existing.collectorName ? ` oleh ${existing.collectorName}` : ""}:{" "}
            <strong>{existing.status === "filled" ? `Ada · ${formatRupiah(existing.amount)}` : "Kosong"}</strong>
            {existing.pending && " (belum terkirim)"}
          </p>
        )}

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-muted">Isi jimpitan</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAmount((a) => Math.max(0, a - STEP))}
              className={buttonClass("secondary")}
              aria-label="Kurangi"
            >
              <Minus className="size-5" />
            </button>
            <input
              inputMode="numeric"
              value={amount.toLocaleString("id-ID")}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                if (Number.isSafeInteger(n) && n <= 1_000_000) setAmount(n);
              }}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-card text-center text-xl font-semibold"
              aria-label="Nominal (Rp)"
            />
            <button
              type="button"
              onClick={() => setAmount((a) => Math.min(1_000_000, a + STEP))}
              className={buttonClass("secondary")}
              aria-label="Tambah"
            >
              <Plus className="size-5" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                className={cx(
                  "rounded-full border px-3 py-1 text-sm",
                  p === amount ? "border-primary bg-primary text-primary-fg" : "border-line text-muted",
                )}
              >
                {formatRupiah(p)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={() => onRecord("filled", amount)}
            disabled={amount <= 0}
            className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-filled text-xl font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-50 dark:text-black"
          >
            <Check className="size-7" strokeWidth={3} /> Ada · {formatRupiah(amount)}
          </button>
          <button
            type="button"
            onClick={() => onRecord("empty", 0)}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-empty text-lg font-bold text-empty active:scale-[0.98]"
          >
            Kosong
          </button>
          {existing && (
            <button type="button" onClick={() => onRecord("none", 0)} className={buttonClass("ghost", "sm")}>
              Hapus catatan (belum dicek)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
