import { useActionState } from "react";
import { api, call } from "@/client/api";
import { runForm, str, type FormState } from "@/client/form";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, inputClass } from "@/components/ui";

function changePinAction(_prev: FormState, formData: FormData) {
  return runForm(() =>
    call(
      api.auth.pin.$post({
        json: { currentPin: str(formData, "currentPin"), newPin: str(formData, "newPin"), confirmPin: str(formData, "confirmPin") },
      }),
    ),
  );
}

const pinProps = {
  required: true,
  type: "password",
  inputMode: "numeric",
  pattern: "\\d{4,6}",
  className: inputClass,
} as const;

export function ChangePinForm() {
  const [state, formAction] = useActionState(changePinAction, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <Field label="PIN lama">
        <input name="currentPin" autoComplete="current-password" {...pinProps} />
      </Field>
      <Field label="PIN baru (4–6 angka)">
        <input name="newPin" autoComplete="new-password" {...pinProps} />
      </Field>
      <Field label="Ulangi PIN baru">
        <input name="confirmPin" autoComplete="new-password" {...pinProps} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <SubmitButton>Ganti PIN</SubmitButton>
    </form>
  );
}
