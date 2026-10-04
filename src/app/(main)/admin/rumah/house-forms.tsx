"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, cx, inputClass } from "@/components/ui";
import type { HouseDTO } from "@/lib/types";
import { addHousesAction, deleteHouseAction, regenerateTokenAction, updateHouseAction } from "./actions";

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

export function EditHouseForm({ house, canDelete }: { house: HouseDTO; canDelete: boolean }) {
  const [state, formAction] = useActionState(updateHouseAction, undefined);
  const [tokenState, tokenAction] = useActionState(regenerateTokenAction, undefined);
  const [deleteState, deleteAction] = useActionState(deleteHouseAction, undefined);
  const messages = [state, tokenState, deleteState].filter((m) => m?.error || m?.success);

  return (
    <div className="space-y-3 pt-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={house.id} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Blok">
            <input name="block" required maxLength={10} defaultValue={house.block} className={inputClass} />
          </Field>
          <Field label="Nomor">
            <input name="number" required maxLength={10} defaultValue={house.number} className={inputClass} />
          </Field>
        </div>
        <Field label="Nama KK">
          <input name="ownerName" maxLength={80} defaultValue={house.ownerName ?? ""} className={inputClass} />
        </Field>
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
          <input type="hidden" name="id" value={house.id} />
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
            <input type="hidden" name="id" value={house.id} />
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
