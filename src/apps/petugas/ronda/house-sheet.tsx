import { Check, Minus, Plus, UserCheck, X } from "lucide-react";
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
    existing?.status === "filled" && existing.amount > 0
      ? existing.amount
      : defaultAmount,
  );
  const presets = [...new Set([defaultAmount, 1000, 2000, 5000])]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  // Sudah dicatat petugas lain: jangan langsung ditimpa, minta konfirmasi dulu.
  const byOther = existing !== undefined && !existing.mine;
  const otherName = existing?.collectorName ?? "petugas lain";
  // "Ada" milik petugas lain tidak bisa diganti "Kosong" atau dihapus (server juga menolak):
  // wadahnya tampak kosong karena isinya sudah diambil petugas itu.
  const keepsFilled = byOther && existing.status === "filled";
  const [replacing, setReplacing] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
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
            <h2
              id="house-sheet-title"
              className="text-3xl font-bold tracking-tight"
            >
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
            Ditandai rumah kosong/mudik — tidak dihitung.
          </p>
        )}
        {existing && byOther && (
          <div className="mt-3 flex gap-2.5 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2.5 text-sm text-warn">
            <UserCheck className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">
                Sudah dicatat {otherName} pukul{" "}
                {formatTime(existing.recordedAt)}:{" "}
                {existing.status === "filled"
                  ? `Ada · ${formatRupiah(existing.amount)}`
                  : "Kosong"}
              </p>
              <p className="mt-0.5">
                {keepsFilled
                  ? `Isi wadahnya kemungkinan sudah diambil ${otherName}. Tidak perlu dicatat lagi.`
                  : "Tidak perlu dicatat lagi, kecuali sekarang wadahnya ada isinya."}
              </p>
            </div>
          </div>
        )}
        {existing && !byOther && (
          <p
            className={cx(
              "mt-3 rounded-xl px-3 py-2 text-sm",
              existing.status === "filled"
                ? "bg-filled-soft text-filled"
                : "bg-empty-soft text-empty",
            )}
          >
            Sudah dicatat {formatTime(existing.recordedAt)}
            {existing.collectorName
              ? ` oleh ${existing.collectorName}`
              : ""}:{" "}
            <strong>
              {existing.status === "filled"
                ? `Ada · ${formatRupiah(existing.amount)}`
                : "Kosong"}
            </strong>
            {existing.pending && " (belum terkirim)"}
          </p>
        )}

        {byOther && !replacing ? (
          <div className="mt-5 grid gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-fg shadow-sm active:scale-[0.98]"
            >
              Oke, biarkan
            </button>
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className={buttonClass("ghost", "sm")}
            >
              Ganti catatan {otherName}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-muted">
                Isi jimpitan
              </p>
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
                  onClick={() =>
                    setAmount((a) => Math.min(1_000_000, a + STEP))
                  }
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
                      p === amount
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-line text-muted",
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
                <Check className="size-7" strokeWidth={3} /> Ada ·{" "}
                {formatRupiah(amount)}
              </button>
              <button
                type="button"
                onClick={() => onRecord("empty", 0)}
                disabled={keepsFilled}
                className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-empty text-lg font-bold text-empty active:scale-[0.98] disabled:opacity-40"
              >
                Kosong
              </button>
              {keepsFilled ? (
                <p className="text-center text-xs text-muted">
                  Catatan Ada milik {otherName} tidak bisa diganti Kosong atau
                  dihapus dari HP. Minta admin mengoreksi kalau memang salah.
                </p>
              ) : (
                existing && (
                  <button
                    type="button"
                    onClick={() => onRecord("none", 0)}
                    className={buttonClass("ghost", "sm")}
                  >
                    Hapus catatan (belum dicek)
                  </button>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
