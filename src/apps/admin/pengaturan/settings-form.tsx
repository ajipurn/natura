import { useActionState } from "react";
import { api, call } from "@/client/api";
import { checked, int, runForm, str, type FormState } from "@/client/form";
import { SwitchField } from "@/components/choice";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

function saveSettingsAction(_prev: FormState, formData: FormData) {
  return runForm(
    () =>
      call(
        api.admin.pengaturan.$put({
          json: {
            communityName: str(formData, "communityName"),
            defaultAmount: int(formData, "defaultAmount"),
            cashPublic: checked(formData, "cashPublic"),
          },
        }),
      ),
    // Nama lingkungan & nominal muncul di banyak layar.
    { invalidate: [["admin"], ["ronda"], ["rekap"], ["riwayat"]] },
  );
}

export function SettingsForm({
  communityName,
  defaultAmount,
  cashPublic,
}: {
  communityName: string;
  defaultAmount: number;
  cashPublic: boolean;
}) {
  const [state, formAction] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nama lingkungan" hint="Muncul di rekap WA dan stiker QR.">
        <Input name="communityName" required maxLength={80} defaultValue={communityName} />
      </Field>
      <Field label="Nominal jimpitan per rumah (Rp)" hint="Nilai awal saat petugas menekan “Ada”.">
        <Input name="defaultAmount" required inputMode="numeric" defaultValue={defaultAmount} />
      </Field>
      <SwitchField
        name="cashPublic"
        defaultChecked={cashPublic}
        label="Tampilkan kas di halaman warga"
        description="Saldo, setoran, dan rincian pemasukan/pengeluaran bulan ini, tanpa nama pencatat."
      />
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <SubmitButton>Simpan</SubmitButton>
    </form>
  );
}
