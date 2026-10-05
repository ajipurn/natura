import { useActionState } from "react";
import { api, call } from "@/client/api";
import { runForm } from "@/client/form";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";

function registerPlanHousesAction() {
  return runForm(() => call(api.admin.rumah["dari-denah"].$post()), { invalidate: [["admin"], ["ronda"], ["jadwal"]] });
}

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
