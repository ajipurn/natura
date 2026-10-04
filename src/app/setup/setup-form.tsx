"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, inputClass } from "@/components/ui";
import { setupAction } from "./actions";

export function SetupForm() {
  const [state, formAction] = useActionState(setupAction, undefined);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Card className="space-y-4">
        <h2 className="font-semibold">Lingkungan</h2>
        <Field label="Nama lingkungan" hint="Muncul di rekap dan stiker QR.">
          <input name="communityName" required maxLength={80} placeholder="RT 05 Perumahan Natura" className={inputClass} />
        </Field>
        <Field label="Nominal jimpitan per rumah (Rp)" hint="Bisa diubah nanti dan saat mencatat.">
          <input name="defaultAmount" required inputMode="numeric" defaultValue="500" className={inputClass} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Akun admin</h2>
        <Field label="Nama">
          <input name="name" required maxLength={40} autoComplete="name" placeholder="Pak Budi" className={inputClass} />
        </Field>
        <Field label="PIN (4–6 angka)">
          <input
            name="pin"
            required
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <Field label="Ulangi PIN">
          <input
            name="pinConfirm"
            required
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      </Card>

      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton size="lg" className="w-full" pendingText="Menyiapkan…">
        Mulai
      </SubmitButton>
    </form>
  );
}
