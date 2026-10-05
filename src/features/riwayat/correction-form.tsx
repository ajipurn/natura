import { useActionState } from "react";
import { api, call } from "@/client/api";
import { int, runForm, str, type FormState } from "@/client/form";
import { SubmitButton } from "@/components/submit-button";
import { cx, inputClass } from "@/components/ui";
import type { CollectionStatus } from "@/lib/types";

/** Koreksi catatan oleh admin untuk tanggal mana pun. */
function correctCollection(date: string, houseId: number) {
  return (_prev: FormState, formData: FormData) => {
    const status = str(formData, "status") as CollectionStatus | "none";
    return runForm(
      () =>
        call(
          api.admin.riwayat[":date"][":houseId"].$put({
            param: { date, houseId: String(houseId) },
            json: { status, amount: status === "filled" ? int(formData, "amount") : 0 },
          }),
        ),
      { invalidate: [["riwayat"], ["rekap"], ["admin", "ringkasan"]] },
    );
  };
}

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
  const [state, formAction] = useActionState(correctCollection(date, houseId), undefined);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
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
