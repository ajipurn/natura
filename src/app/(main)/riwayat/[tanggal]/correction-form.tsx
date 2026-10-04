"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { cx, inputClass } from "@/components/ui";
import type { CollectionStatus } from "@/lib/types";
import { correctCollection } from "./actions";

export function CorrectionForm({
  date,
  houseId,
  status,
  amount,
  defaultAmount,
}: {
  date: string;
  houseId: number;
  status: CollectionStatus | "none";
  amount: number;
  defaultAmount: number;
}) {
  const [state, formAction] = useActionState(correctCollection, undefined);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="houseId" value={houseId} />
      <select name="status" defaultValue={status} className={cx(inputClass, "h-9 w-auto text-sm")} aria-label="Status">
        <option value="filled">Ada</option>
        <option value="empty">Kosong</option>
        <option value="none">Belum dicek</option>
      </select>
      <input
        name="amount"
        inputMode="numeric"
        defaultValue={status === "filled" ? amount : defaultAmount}
        className={cx(inputClass, "h-9 w-24 text-sm")}
        aria-label="Nominal (Rp)"
      />
      <SubmitButton size="sm" variant="secondary">
        Simpan
      </SubmitButton>
      {state?.error && <span className="text-sm text-empty">{state.error}</span>}
      {state?.success && <span className="text-sm text-filled">{state.success}</span>}
    </form>
  );
}
