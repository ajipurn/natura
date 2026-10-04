"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, buttonClass, cx } from "@/components/ui";
import { formatRupiah } from "@/lib/format";
import { recordFromHousePage } from "./actions";

export function QuickRecord({
  token,
  defaultAmount,
  current,
}: {
  token: string;
  defaultAmount: number;
  current: { status: "filled" | "empty"; amount: number } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(status: "filled" | "empty" | "none", amount: number) {
    setError(null);
    startTransition(async () => {
      const result = await recordFromHousePage(token, status, amount);
      if (result.error) setError(result.error);
    });
  }

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
      {error && <Alert>{error}</Alert>}
      <p className="text-center text-xs text-muted">
        Nominal lain atau scan banyak rumah lebih cepat lewat halaman Ronda → Scan QR.
      </p>
    </div>
  );
}
