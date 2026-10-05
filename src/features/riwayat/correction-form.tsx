import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Alert, Button, Input, cx } from "@/components/ui";
import { formatRupiah } from "@/lib/format";
import type { CollectionStatus } from "@/lib/types";

type Status = CollectionStatus | "none";

/** Warna pilihan yang aktif mengikuti statusnya (hijau Ada, merah Kosong). */
const OPTIONS: [Status, string, string][] = [
  ["filled", "Ada", "data-checked:bg-filled data-checked:text-white dark:data-checked:text-black"],
  ["empty", "Kosong", "data-checked:bg-empty data-checked:text-white dark:data-checked:text-black"],
  ["none", "Belum dicek", "data-checked:bg-card data-checked:text-fg data-checked:shadow-sm"],
];

/** Koreksi catatan satu rumah oleh admin, untuk tanggal mana pun. Tertutup sendiri setelah tersimpan. */
export function CorrectionForm({
  date,
  houseId,
  status: initialStatus,
  amount: initialAmount,
  defaultAmount,
  onDone,
}: {
  date: string;
  houseId: number;
  status: Status;
  amount: number;
  defaultAmount: number;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [amount, setAmount] = useState(String(initialStatus === "filled" ? initialAmount : defaultAmount));
  const presets = [...new Set([defaultAmount, 1000, 2000, 5000])].filter((n) => n > 0).sort((a, b) => a - b);
  const save = useMutation({
    mutationFn: () =>
      call(
        api.admin.riwayat[":date"][":houseId"].$put({
          param: { date, houseId: String(houseId) },
          json: { status, amount: status === "filled" ? Number(amount) || 0 : 0 },
        }),
      ),
    onSuccess: async () => {
      await invalidate(["riwayat"], ["rekap"], ["admin", "ringkasan"], ["admin", "audit"]);
      onDone();
    },
  });
  const unchanged = status === initialStatus && (status !== "filled" || Number(amount) === initialAmount);

  return (
    <form
      className="mt-2.5 max-w-xl space-y-2.5 border-t border-line pt-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <RadioGroup
        value={status}
        onValueChange={(next) => setStatus(next as Status)}
        aria-label="Status"
        className="flex gap-1 rounded-xl bg-idle-soft p-0.5 text-sm"
      >
        {OPTIONS.map(([value, label, checkedClass]) => (
          <Radio.Root
            key={value}
            value={value}
            className={cx(
              "flex-1 cursor-pointer select-none rounded-lg px-2 py-1.5 text-center font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              checkedClass,
            )}
          >
            {label}
          </Radio.Root>
        ))}
      </RadioGroup>
      {status === "filled" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="w-28 shrink-0">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))}
              inputMode="numeric"
              aria-label="Nominal (Rp)"
              className="h-9 text-sm"
            />
          </div>
          {presets.map((n) => (
            <Button
              key={n}
              variant="plain"
              onClick={() => setAmount(String(n))}
              className={cx(
                "rounded-full border px-2.5 py-1 text-xs font-semibold",
                Number(amount) === n ? "border-primary bg-primary/10 text-primary" : "border-line text-muted",
              )}
            >
              {formatRupiah(n)}
            </Button>
          ))}
        </div>
      )}
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
          {save.isPending ? "Menyimpan…" : "Simpan koreksi"}
        </Button>
      </div>
    </form>
  );
}
