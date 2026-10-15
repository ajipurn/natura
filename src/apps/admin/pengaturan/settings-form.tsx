import { useActionState } from "react";
import { Coins, Eye, Save } from "lucide-react";
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
    <form action={formAction}>
      <div className="px-5 pb-6 pt-5 sm:px-6">
        <Field label="Nama lingkungan" hint="Digunakan di aplikasi, rekap WhatsApp, dan stiker QR.">
          <Input name="communityName" required maxLength={80} defaultValue={communityName} />
        </Field>
      </div>
      <div className="space-y-5 border-t border-line px-5 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Coins className="size-4.5" aria-hidden /></span>
          <h2 className="font-semibold tracking-tight">Pencatatan jimpitan</h2>
        </div>
        <Field label="Nominal per rumah (Rp)" hint="Nilai awal saat petugas menekan “Ada”.">
          <Input name="defaultAmount" required inputMode="numeric" defaultValue={defaultAmount} className="tabular-nums" />
        </Field>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Jam pencatatan jimpitan</legend>
          <p className="text-pretty text-sm leading-relaxed text-muted">Petugas terjadwal dapat mencatat pada jam ini. Di luar jam tersebut, scan QR membuka informasi rumah.</p>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-bg/60 p-3 sm:p-4">
            <Field label="Mulai (WIB)"><Input type="time" name="recordingStart" required defaultValue={recordingStart} className="min-w-0 tabular-nums" /></Field>
            <Field label="Selesai (WIB)"><Input type="time" name="recordingEnd" required defaultValue={recordingEnd} className="min-w-0 tabular-nums" /></Field>
          </div>
          <p className="text-pretty text-xs leading-relaxed text-muted">00.00 berarti tengah malam. Jam selesai boleh melewati tengah malam.</p>
        </fieldset>
      </div>
      <div className="space-y-4 border-t border-line px-5 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Eye className="size-4.5" aria-hidden /></span>
          <h2 className="font-semibold tracking-tight">Tampilan Beranda</h2>
        </div>
        <SwitchField
          name="cashPublic"
          defaultChecked={cashPublic}
          label="Tampilkan kas di Beranda"
          description="Saldo dan rincian kas bulan ini, tanpa nama pencatat."
          className="px-4 py-3"
        />
      </div>
      <div className="space-y-3 border-t border-line bg-bg/40 px-5 py-4 sm:px-6">
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.success && <Alert tone="success">{state.success}</Alert>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">Berlaku untuk seluruh lingkungan.</p>
          <SubmitButton className="w-full sm:w-auto"><Save className="size-4" aria-hidden />Simpan perubahan</SubmitButton>
        </div>
      </div>
    </form>
  );
}
