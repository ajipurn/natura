"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, inputClass } from "@/components/ui";
import { saveSettingsAction } from "./actions";

export function SettingsForm({ communityName, defaultAmount }: { communityName: string; defaultAmount: number }) {
  const [state, formAction] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nama lingkungan" hint="Muncul di rekap WA dan stiker QR.">
        <input name="communityName" required maxLength={80} defaultValue={communityName} className={inputClass} />
      </Field>
      <Field label="Nominal jimpitan per rumah (Rp)" hint="Nilai awal saat petugas menekan “Ada”.">
        <input name="defaultAmount" required inputMode="numeric" defaultValue={defaultAmount} className={inputClass} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <SubmitButton>Simpan</SubmitButton>
    </form>
  );
}
