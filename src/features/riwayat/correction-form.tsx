import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useMutation } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { Alert, Button, Input, cx } from "@/components/ui";
import { formatDateLong } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { houseLabel } from "@/lib/houses";
import type { CollectionStatus, HouseDTO } from "@/lib/types";

type Status = CollectionStatus | "none";

/** Layar yang menampilkan catatan jimpitan: segarkan semuanya setelah admin mengoreksi. */
const CORRECTION_REFRESH = [["riwayat"], ["rekap"], ["admin", "ringkasan"], ["admin", "audit"]];

/** Warna pilihan yang aktif mengikuti statusnya (hijau Ada, merah Kosong). */
const FILL_OPTIONS: [CollectionStatus, string, string][] = [
  ["filled", "Ada", "data-checked:bg-filled data-checked:text-white dark:data-checked:text-black"],
  ["empty", "Kosong", "data-checked:bg-empty data-checked:text-white dark:data-checked:text-black"],
];
const OPTIONS: [Status, string, string][] = [...FILL_OPTIONS, ["none", "Belum dicek", "data-checked:bg-card data-checked:text-fg data-checked:shadow-sm"]];

/** Koreksi catatan satu rumah oleh admin, untuk tanggal mana pun. Tertutup sendiri setelah tersimpan. */
export function CorrectionForm({
  date,
  houseId,
  status: initialStatus,
  amount: initialAmount,
  defaultAmount,
  onDone,
  className,
}: {
  date: string;
  houseId: number;
  status: Status;
  amount: number;
  defaultAmount: number;
  onDone: () => void;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [amount, setAmount] = useState(String(initialStatus === "filled" ? initialAmount : defaultAmount));
  const save = useMutation({
    mutationFn: () =>
      call(
        api.admin.riwayat[":date"][":houseId"].$put({
          param: { date, houseId: String(houseId) },
          json: { status, amount: status === "filled" ? Number(amount) || 0 : 0 },
        }),
      ),
    onSuccess: async () => {
      await invalidate(...CORRECTION_REFRESH);
      onDone();
    },
  });
  const unchanged = status === initialStatus && (status !== "filled" || Number(amount) === initialAmount);

  return (
    <form
      className={cx("mt-2.5 max-w-xl space-y-2.5 border-t border-line pt-2.5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <StatusChoice value={status} onChange={setStatus} options={OPTIONS} />
      {status === "filled" && <AmountChoice value={amount} onChange={setAmount} defaultAmount={defaultAmount} />}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Batal
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={save.isPending || unchanged || (status === "filled" && !(Number(amount) > 0))}
        >
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

/** Rumah + malam yang sedang diisi/diubah lewat `CorrectionDialog`. */
export type CorrectionTarget = {
  house: HouseDTO;
  date: string;
  current: { status: CollectionStatus; amount: number } | undefined;
  /** Keterangan catatan yang sekarang (mis. jam dan pencatatnya). */
  note?: ReactNode;
};

/**
 * Koreksi satu rumah dalam dialog (dari denah atau tabel rekap). `target` tetap diisi selama dialog
 * menutup supaya judulnya tidak hilang di tengah animasi.
 */
export function CorrectionDialog({
  target,
  open,
  onClose,
  defaultAmount,
}: {
  target: CorrectionTarget | null;
  open: boolean;
  onClose: () => void;
  defaultAmount: number;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={target ? houseLabel(target.house) : ""}
      description={target && [target.house.ownerName, formatDateLong(target.date)].filter(Boolean).join(", ")}
    >
      {target && (
        <>
          {target.note && <p className="mb-3 text-sm text-muted">{target.note}</p>}
          <CorrectionForm
            className="mt-0 border-t-0 pt-0"
            date={target.date}
            houseId={target.house.id}
            status={target.current?.status ?? "none"}
            amount={target.current?.amount ?? 0}
            defaultAmount={defaultAmount}
            onDone={onClose}
          />
        </>
      )}
    </Dialog>
  );
}

/**
 * Isi banyak rumah sekaligus untuk satu malam (mis. dari catatan kertas): semuanya Ada dengan
 * nominal yang sama, atau semuanya Kosong. Rumah yang berbeda dikoreksi satu per satu sesudahnya.
 */
export function BulkFillForm({
  date,
  houseIds,
  defaultAmount,
  onDone,
  className,
}: {
  date: string;
  houseIds: number[];
  defaultAmount: number;
  onDone: () => void;
  className?: string;
}) {
  const [status, setStatus] = useState<CollectionStatus>("filled");
  const [amount, setAmount] = useState(String(defaultAmount));
  const save = useMutation({
    mutationFn: () =>
      call(
        api.admin.riwayat[":date"].$put({
          param: { date },
          json: { entries: houseIds.map((houseId) => ({ houseId, status, amount: status === "filled" ? Number(amount) || 0 : 0 })) },
        }),
      ),
    onSuccess: async () => {
      await invalidate(...CORRECTION_REFRESH);
      onDone();
    },
  });

  return (
    <form
      className={cx("space-y-2.5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <StatusChoice value={status} onChange={setStatus} options={FILL_OPTIONS} />
      {status === "filled" && <AmountChoice value={amount} onChange={setAmount} defaultAmount={defaultAmount} />}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending || (status === "filled" && !(Number(amount) > 0))}>
          {save.isPending ? "Menyimpan…" : `Isi ${houseIds.length} rumah`}
        </Button>
      </div>
    </form>
  );
}

function StatusChoice<T extends Status>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: [T, string, string][];
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as T)}
      aria-label="Status"
      className="flex gap-1 rounded-xl bg-idle-soft p-0.5 text-sm"
    >
      {options.map(([option, label, checkedClass]) => (
        <Radio.Root
          key={option}
          value={option}
          className={cx(
            "flex-1 cursor-pointer select-none rounded-lg px-2 py-1.5 text-center font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            checkedClass,
          )}
        >
          {label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

/** Nominal (Rp) dengan pilihan cepat. `value` berupa teks angka seperti yang diketik. */
function AmountChoice({ value, onChange, defaultAmount }: { value: string; onChange: (value: string) => void; defaultAmount: number }) {
  const presets = [...new Set([defaultAmount, 1000, 2000, 5000])].filter((n) => n > 0).sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="w-28 shrink-0">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 7))}
          inputMode="numeric"
          aria-label="Nominal (Rp)"
          className="h-9 text-sm"
        />
      </div>
      {presets.map((n) => (
        <Button
          key={n}
          variant="plain"
          onClick={() => onChange(String(n))}
          className={cx(
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            Number(value) === n ? "border-primary bg-primary/10 text-primary" : "border-line text-muted",
          )}
        >
          {formatRupiah(n)}
        </Button>
      ))}
    </div>
  );
}
