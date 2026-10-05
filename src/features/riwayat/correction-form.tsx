import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Alert, buttonClass, cx, inputClass } from "@/components/ui";
import { formatRupiah } from "@/lib/format";
import type { CollectionStatus } from "@/lib/types";

type Status = CollectionStatus | "none";

const OPTIONS: [Status, string][] = [
  ["filled", "Ada"],
  ["empty", "Kosong"],
  ["none", "Belum dicek"],
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
      <div role="radiogroup" aria-label="Status" className="flex gap-1 rounded-xl bg-idle-soft p-0.5 text-sm">
        {OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={status === value}
            onClick={() => setStatus(value)}
            className={cx(
              "flex-1 rounded-lg px-2 py-1.5 font-semibold",
              status === value
                ? value === "filled"
                  ? "bg-filled text-white dark:text-black"
                  : value === "empty"
                    ? "bg-empty text-white dark:text-black"
                    : "bg-card text-fg shadow-sm"
                : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {status === "filled" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="w-28 shrink-0">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))}
              inputMode="numeric"
              aria-label="Nominal (Rp)"
              className={cx(inputClass, "h-9 text-sm")}
            />
          </div>
          {presets.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(String(n))}
              className={cx(
                "rounded-full border px-2.5 py-1 text-xs font-semibold",
                Number(amount) === n ? "border-primary bg-primary/10 text-primary" : "border-line text-muted",
              )}
            >
              {formatRupiah(n)}
            </button>
          ))}
        </div>
      )}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={buttonClass("ghost", "sm")}>
          Batal
        </button>
        <button
          type="submit"
          disabled={save.isPending || unchanged || (status === "filled" && !(Number(amount) > 0))}
          className={buttonClass("primary", "sm")}
        >
          {save.isPending ? "Menyimpan…" : "Simpan koreksi"}
        </button>
      </div>
    </form>
  );
}
