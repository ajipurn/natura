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
            recordingStart: str(formData, "recordingStart"),
            recordingEnd: str(formData, "recordingEnd"),
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
  recordingStart,
  recordingEnd,
}: {
  communityName: string;
  defaultAmount: number;
  cashPublic: boolean;
  recordingStart: string;
  recordingEnd: string;
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
      <fieldset className="space-y-2">
        <legend className="font-semibold">Jam pencatatan jimpitan</legend>
        <p className="text-sm text-muted">Hanya petugas yang dijadwalkan boleh mencatat pada jam ini. Di luar jam tersebut, scan QR membuka informasi rumah.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mulai (WIB)"><Input type="time" name="recordingStart" required defaultValue={recordingStart} /></Field>
          <Field label="Selesai (WIB)"><Input type="time" name="recordingEnd" required defaultValue={recordingEnd} /></Field>
        </div>
        <p className="text-xs text-muted">00.00 berarti tengah malam. Jam selesai boleh melewati tengah malam.</p>
      </fieldset>
      <SwitchField
        name="cashPublic"
        defaultChecked={cashPublic}
        label="Tampilkan kas di Beranda"
        description="Saldo, setoran, dan rincian pemasukan/pengeluaran bulan ini, tanpa nama pencatat."
      />
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <SubmitButton>Simpan</SubmitButton>
    </form>
  );
}
