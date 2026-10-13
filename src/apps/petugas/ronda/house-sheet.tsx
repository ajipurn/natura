import { NumberTicker } from "@/components/number-ticker";
import { Check, UserCheck, X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { AmountField } from "@/components/amount-field";
import { Button, cx } from "@/components/ui";
import { formatTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { houseLabelLong } from "@/lib/houses";
import type { CollectionMethod, CollectionStatus, HouseDTO } from "@/lib/types";
import type { MergedCollection } from "./use-ronda-store";
import { PaymentNotice } from "@/components/payment-notice";
import type { BillingPeriod, PaymentCell } from "@/lib/payments";

const STEP = 500;

export function HouseSheet({
  house,
  existing,
  defaultAmount,
  method,
  onRecord,
  onClose,
  paymentPeriod,
  paymentCell,
}: {
  house: HouseDTO;
  existing: MergedCollection | undefined;
  defaultAmount: number;
  method: CollectionMethod;
  onRecord: (status: CollectionStatus | "none", amount: number) => void;
  onClose: () => void;
  paymentPeriod?: BillingPeriod;
  paymentCell?: PaymentCell;
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
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Popup initialFocus={true} className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-5 pb-[max(env(safe-area-inset-bottom),20px)] text-fg shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {paymentPeriod ? "Status pembayaran" : method === "scan" ? "Hasil scan" : "Catat manual"}
            </p>
            <Dialog.Title
              className="text-3xl font-bold tracking-tight"
            >
              {houseLabelLong(house)}
            </Dialog.Title>
            {house.ownerName && <p className="text-muted">{house.ownerName}</p>}
          </div>
          <Button
            variant="plain"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full bg-idle-soft"
            aria-label="Tutup"
          >
            <X className="size-5" />
          </Button>
        </div>

        {house.status === "active" && <div className="mt-3"><PaymentNotice period={paymentPeriod} cell={paymentCell} /></div>}
        {paymentPeriod && <p className="mt-2 text-xs text-muted">Status otomatis dari pembayaran periode. Rumah ini tidak perlu discan dan tidak bisa dicatat Ada/Kosong.</p>}

        {house.status === "vacant" && (
          <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
            Ditandai rumah kosong/mudik — tidak dihitung.
          </p>
        )}
        {existing && byOther && !paymentPeriod && (
          <div className="mt-3 flex gap-2.5 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2.5 text-sm text-warn">
            <UserCheck className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">
                Sudah dicatat {otherName} pukul{" "}
                {formatTime(existing.recordedAt)}:{" "}
                {existing.status === "filled"
                  ? <NumberTicker value={`Ada · ${formatRupiah(existing.amount)}`} />
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
        {existing && !byOther && !paymentPeriod && (
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
                ? <NumberTicker value={`Ada · ${formatRupiah(existing.amount)}`} />
                : "Kosong"}
            </strong>
            {existing.pending && " (belum terkirim)"}
          </p>
        )}

        {paymentPeriod ? (
          <Button onClick={onClose} className="mt-5 w-full">Tutup</Button>
        ) : byOther && !replacing ? (
          <div className="mt-5 grid gap-3">
            <Button
              variant="plain"
              onClick={onClose}
              className="flex h-11 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-fg shadow-sm active:scale-[0.98]"
            >
              Oke, biarkan
            </Button>
            <Button
              onClick={() => setReplacing(true)}
              variant="ghost"
              size="sm"
            >
              Ganti catatan {otherName}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-muted">
                Isi jimpitan
              </p>
              <AmountField
                value={amount}
                onValueChange={setAmount}
                step={STEP}
                max={1_000_000}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {presets.map((p) => (
                  <Button
                    key={p}
                    variant="plain"
                    onClick={() => setAmount(p)}
                    className={cx(
                      "h-11 rounded-full border px-3 text-sm",
                      p === amount
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-line text-muted",
                    )}
                  >
                    <NumberTicker value={formatRupiah(p)} />
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <Button
                variant="plain"
                onClick={() => onRecord("filled", amount)}
                disabled={amount <= 0}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-filled text-xl font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-50 dark:text-black"
              >
                <Check className="size-7" strokeWidth={3} /> Ada ·{" "}
                <NumberTicker value={formatRupiah(amount)} />
              </Button>
              <Button
                variant="plain"
                onClick={() => onRecord("empty", 0)}
                disabled={keepsFilled}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border-2 border-empty text-lg font-bold text-empty active:scale-[0.98] disabled:opacity-40"
              >
                Kosong
              </Button>
              {keepsFilled ? (
                <p className="text-center text-xs text-muted">
                  Catatan Ada milik {otherName} tidak bisa diganti Kosong atau
                  dihapus dari HP. Minta admin mengoreksi kalau memang salah.
                </p>
              ) : (
                existing && (
                  <Button
                    onClick={() => onRecord("none", 0)}
                    variant="ghost"
                    size="sm"
                  >
                    Hapus catatan (belum dicek)
                  </Button>
                )
              )}
            </div>
          </>
        )}
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
