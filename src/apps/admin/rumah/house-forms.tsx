import { useActionState } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { runForm, str, type FormState } from "@/client/form";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, cx, inputClass } from "@/components/ui";
import type { HouseDTO } from "@/lib/types";

/** Data rumah dipakai di banyak layar (ronda, jadwal, ringkasan, petugas): segarkan semuanya. */
const REFRESH = [["admin"], ["ronda"], ["jadwal"], ["auth", "users"]];

function addHousesAction(_prev: FormState, formData: FormData) {
  return runForm(
    () =>
      call(
        api.admin.rumah.$post({
          json: { block: str(formData, "block"), numbers: str(formData, "numbers"), ownerName: str(formData, "ownerName") },
        }),
      ),
    { invalidate: REFRESH },
  );
}

function houseActions(id: number) {
  const param = { id: String(id) };
  return {
    update: (_prev: FormState, formData: FormData) =>
      runForm(
        () =>
          call(
            api.admin.rumah[":id"].$patch({
              param,
              json: {
                block: str(formData, "block"),
                number: str(formData, "number"),
                ownerName: str(formData, "ownerName"),
                status: str(formData, "status") === "vacant" ? "vacant" : "active",
              },
            }),
          ),
        { invalidate: REFRESH },
      ),
    regenerate: () => runForm(() => call(api.admin.rumah[":id"].token.$post({ param })), { invalidate: REFRESH }),
    remove: () => runForm(() => call(api.admin.rumah[":id"].$delete({ param })), { invalidate: REFRESH }),
  };
}

export function AddHousesForm() {
  const [state, formAction] = useActionState(addHousesAction, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Blok">
          <input name="block" required maxLength={10} placeholder="A" className={cx(inputClass, "uppercase")} />
        </Field>
        <Field label="Nomor rumah" hint="Satu nomor, rentang 1-20, atau daftar 1, 3, 5A.">
          <input name="numbers" required placeholder="1-20" className={inputClass} />
        </Field>
      </div>
      <Field label="Nama KK (opsional)" hint="Dipakai kalau menambah satu rumah.">
        <input name="ownerName" maxLength={80} placeholder="Pak Budi" className={inputClass} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <SubmitButton>Tambah rumah</SubmitButton>
    </form>
  );
}

/** `accounts` = nama akun petugas yang tinggal di rumah ini; nama warganya diambil dari akun itu. */
export function EditHouseForm({ house, accounts, canDelete }: { house: HouseDTO; accounts: string[]; canDelete: boolean }) {
  const actions = houseActions(house.id);
  const [state, formAction] = useActionState(actions.update, undefined);
  const [tokenState, tokenAction] = useActionState(actions.regenerate, undefined);
  const [deleteState, deleteAction] = useActionState(actions.remove, undefined);
  const messages = [state, tokenState, deleteState].filter((m) => m?.error || m?.success);

  return (
    <div className="space-y-3 pt-3">
      <form action={formAction} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Blok">
            <input name="block" required maxLength={10} defaultValue={house.block} className={inputClass} />
          </Field>
          <Field label="Nomor">
            <input name="number" required maxLength={10} defaultValue={house.number} className={inputClass} />
          </Field>
        </div>
        {accounts.length > 1 ? (
          <div className="text-sm">
            <p className="font-medium">Penghuni</p>
            <p>{accounts.join(", ")}</p>
            <p className="text-xs text-muted">
              Nama dari akun petugas; ubah di{" "}
              <Link to="/admin/petugas" className="font-semibold text-primary underline">
                Petugas
              </Link>
              .
            </p>
          </div>
        ) : (
          <Field
            label="Nama KK"
            hint={accounts.length ? "Sama dengan nama akun petugasnya: mengubah di sini ikut mengubah nama akun itu." : undefined}
          >
            <input
              name="ownerName"
              required={accounts.length > 0}
              maxLength={accounts.length ? 40 : 80}
              defaultValue={house.ownerName ?? ""}
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Status">
          <select name="status" defaultValue={house.status} className={inputClass}>
            <option value="active">Dihuni (dihitung)</option>
            <option value="vacant">Kosong / mudik (tidak dihitung bolong)</option>
          </select>
        </Field>
        <SubmitButton size="sm">Simpan</SubmitButton>
      </form>

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <form action={tokenAction}>
          <SubmitButton
            size="sm"
            variant="secondary"
            confirm="Buat QR baru? Stiker lama rumah ini tidak bisa dipakai lagi."
            pendingText="Membuat…"
          >
            Buat QR baru
          </SubmitButton>
        </form>
        {canDelete && (
          <form action={deleteAction}>
            <SubmitButton size="sm" variant="danger" confirm="Hapus rumah ini?" pendingText="Menghapus…">
              Hapus
            </SubmitButton>
          </form>
        )}
      </div>
      {messages.map((m, i) => (
        <Alert key={i} tone={m?.error ? "error" : "success"}>
          {m?.error ?? m?.success}
        </Alert>
      ))}
    </div>
  );
}
