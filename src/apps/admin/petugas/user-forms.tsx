import { useActionState } from "react";
import { api, call } from "@/client/api";
import { checked, runForm, str, type FormState } from "@/client/form";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, inputClass } from "@/components/ui";
import type { Role } from "@/lib/types";

const REFRESH = [["admin"], ["auth", "users"]];
const role = (formData: FormData): Role => (str(formData, "role") === "admin" ? "admin" : "petugas");

function createUserAction(_prev: FormState, formData: FormData) {
  return runForm(
    () => call(api.admin.petugas.$post({ json: { name: str(formData, "name"), pin: str(formData, "pin"), role: role(formData) } })),
    { invalidate: REFRESH },
  );
}

function userActions(id: number) {
  const param = { id: String(id) };
  return {
    update: (_prev: FormState, formData: FormData) =>
      runForm(
        () =>
          call(
            api.admin.petugas[":id"].$patch({
              param,
              json: { name: str(formData, "name"), role: role(formData), active: checked(formData, "active") },
            }),
          ),
        { invalidate: REFRESH },
      ),
    resetPin: (_prev: FormState, formData: FormData) =>
      runForm(() => call(api.admin.petugas[":id"].pin.$post({ param, json: { pin: str(formData, "pin") } })), {
        invalidate: REFRESH,
      }),
  };
}

const pinInputProps = {
  required: true,
  inputMode: "numeric",
  pattern: "\\d{4,6}",
  autoComplete: "off",
  className: inputClass,
} as const;

export function CreateUserForm() {
  const [state, formAction] = useActionState(createUserAction, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <Field label="Nama">
        <input name="name" required maxLength={40} placeholder="Pak Andi" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="PIN (4–6 angka)">
          <input name="pin" {...pinInputProps} />
        </Field>
        <Field label="Peran">
          <select name="role" defaultValue="petugas" className={inputClass}>
            <option value="petugas">Petugas</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      </div>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <SubmitButton>Tambah petugas</SubmitButton>
    </form>
  );
}

export function EditUserForm({
  user,
  isSelf,
}: {
  user: { id: number; name: string; role: Role; active: boolean };
  isSelf: boolean;
}) {
  const actions = userActions(user.id);
  const [state, formAction] = useActionState(actions.update, undefined);
  const [pinState, pinAction] = useActionState(actions.resetPin, undefined);

  return (
    <div className="space-y-4 pt-3">
      <form action={formAction} className="space-y-3">
        <Field label="Nama">
          <input name="name" required maxLength={40} defaultValue={user.name} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Peran">
            <select name="role" defaultValue={user.role} disabled={isSelf} className={inputClass}>
              <option value="petugas">Petugas</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={user.active}
              disabled={isSelf}
              className="size-5 accent-[var(--primary)]"
            />
            Aktif
          </label>
        </div>
        {/* Field yang disabled tidak ikut terkirim, jadi kirim nilai aslinya. */}
        {isSelf && (
          <>
            <input type="hidden" name="role" value={user.role} />
            <input type="hidden" name="active" value="on" />
          </>
        )}
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.success && <Alert tone="success">{state.success}</Alert>}
        <SubmitButton size="sm">Simpan</SubmitButton>
      </form>

      {!isSelf && (
        <form action={pinAction} className="space-y-3 border-t border-line pt-3">
          <Field label="Atur ulang PIN" hint="Untuk petugas yang lupa PIN. Sesi lamanya akan keluar.">
            <input name="pin" placeholder="PIN baru" {...pinInputProps} />
          </Field>
          {pinState?.error && <Alert>{pinState.error}</Alert>}
          {pinState?.success && <Alert tone="success">{pinState.success}</Alert>}
          <SubmitButton size="sm" variant="secondary">
            Atur ulang PIN
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
