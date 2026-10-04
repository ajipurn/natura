"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";
import { registerPlanHousesAction } from "./actions";

export function RegisterPlanHouses({ count }: { count: number }) {
  const [state, formAction] = useActionState(registerPlanHousesAction, undefined);
  return (
    <form action={formAction} className="space-y-3">
      {count > 0 && (
        <SubmitButton
          confirm={`Daftarkan ${count} rumah dari denah? Nama KK bisa diisi nanti di Data rumah.`}
          pendingText="Mendaftarkan…"
        >
          Daftarkan {count} rumah dari denah
        </SubmitButton>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
    </form>
  );
}
