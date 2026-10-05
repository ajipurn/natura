import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Alert, buttonClass, cx } from "@/components/ui";
import { formatRupiah } from "@/lib/format";

export function QuickRecord({
  token,
  defaultAmount,
  current,
}: {
  token: string;
  defaultAmount: number;
  current: { status: "filled" | "empty"; amount: number } | null;
}) {
  const record = useMutation({
    mutationFn: ({ status, amount }: { status: "filled" | "empty" | "none"; amount: number }) =>
      call(api.rumah[":token"].catat.$post({ param: { token }, json: { status, amount } })),
    onSuccess: () => invalidate(["rumah", token]),
  });
  const pending = record.isPending;
  const submit = (status: "filled" | "empty" | "none", amount: number) => record.mutate({ status, amount });

  return (
    <div className="mt-4 space-y-3">
      {current && (
        <p
          className={cx(
            "rounded-xl px-3 py-2 text-sm",
            current.status === "filled" ? "bg-filled-soft text-filled" : "bg-empty-soft text-empty",
          )}
        >
          Malam ini sudah dicatat:{" "}
          <strong>{current.status === "filled" ? `Ada · ${formatRupiah(current.amount)}` : "Kosong"}</strong>
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => submit("filled", defaultAmount)}
        className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-filled text-xl font-bold text-white disabled:opacity-60 dark:text-black"
      >
        <Check className="size-7" strokeWidth={3} /> Ada · {formatRupiah(defaultAmount)}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => submit("empty", 0)}
        className="flex h-14 w-full items-center justify-center rounded-2xl border-2 border-empty text-lg font-bold text-empty disabled:opacity-60"
      >
        Kosong
      </button>
      {current && (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("none", 0)}
          className={cx(buttonClass("ghost", "sm"), "w-full")}
        >
          Hapus catatan malam ini
        </button>
      )}
      {record.isError && <Alert>{record.error.message}</Alert>}
      <p className="text-center text-xs text-muted">
        Nominal lain atau scan banyak rumah lebih cepat lewat{" "}
        <a href="/petugas/" className="font-semibold underline">
          app petugas
        </a>{" "}
        → Scan QR.
      </p>
    </div>
  );
}
