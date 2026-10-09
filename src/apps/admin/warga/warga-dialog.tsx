import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Alert, Button, Field, Input } from "@/components/ui";
import { adminPath } from "@/lib/app-paths";
import { groupByBlock, houseLabel } from "@/lib/houses";
import type { Role } from "@/lib/types";
import { HOUSE_REFRESH, housesQuery } from "../queries";

export type Resident = {
  id: number;
  name: string;
  phone: string | null;
  houseId: number | null;
  block: string | null;
  number: string | null;
  userId: number | null;
  role: Role | null;
  accountActive: boolean | null;
};

export function WargaDialog({ open, resident, onClose }: { open: boolean; resident?: Resident; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={resident ? "Edit warga" : "Tambah warga"}>
      <WargaForm key={resident?.id ?? "baru"} resident={resident} onDone={onClose} />
    </Dialog>
  );
}

function WargaForm({ resident, onDone }: { resident?: Resident; onDone: () => void }) {
  const houses = useQuery(housesQuery);
  const [name, setName] = useState(resident?.name ?? "");
  const [phone, setPhone] = useState(resident?.phone ?? "");
  const [houseId, setHouseId] = useState<number | null>(resident?.houseId ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const json = { name, phone, houseId };
      return resident
        ? call(api.admin.warga[":id"].$patch({ param: { id: String(resident.id) }, json }))
        : call(api.admin.warga.$post({ json }));
    },
    onSuccess: async () => { await invalidate(...HOUSE_REFRESH, ["warga"], ["auth"]); onDone(); },
  });
  const remove = useMutation({
    mutationFn: () => call(api.admin.warga[":id"].$delete({ param: { id: String(resident!.id) } })),
    onSuccess: async () => { await invalidate(...HOUSE_REFRESH, ["warga"]); onDone(); },
  });
  const pending = save.isPending || remove.isPending;

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <Field label="Nama" hint={resident?.userId ? "Nama ini juga dipakai oleh akun petugasnya." : undefined}>
        <Input value={name} onValueChange={setName} required maxLength={resident?.userId ? 40 : 100} autoComplete="name" data-autofocus />
      </Field>
      <Field label="Nomor telepon (opsional)">
        <Input type="tel" value={phone} onValueChange={setPhone} maxLength={25} autoComplete="tel" placeholder="08…" />
      </Field>
      <div>
        <Select label="Rumah" value={houseId === null ? "" : String(houseId)} onValueChange={(value) => setHouseId(value ? Number(value) : null)}
          options={[{ value: "", label: "Belum ditentukan" }]}
          groups={groupByBlock(houses.data?.houses ?? []).map(([block, rows]) => ({
            label: `Blok ${block}`,
            options: rows.map((house) => ({ value: String(house.id), label: houseLabel(house) })),
          }))} searchPlaceholder="Cari rumah…" disabled={houses.isPending || houses.isError} />
        <p className="mt-1 text-xs text-muted">Satu rumah bisa terhubung ke beberapa warga.</p>
        {houses.isError && <Alert>Daftar rumah belum dimuat. <Button variant="ghost" size="sm" onClick={() => houses.refetch()}>Coba lagi</Button></Alert>}
      </div>
      {resident?.userId && (
        <p className="text-sm text-muted">Akses akun dikelola di <Link to={adminPath("/petugas")} className="font-medium text-primary underline underline-offset-4">Akun petugas</Link>.</p>
      )}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone} disabled={pending}>Batal</Button>
        <Button type="submit" disabled={pending || houses.isPending || houses.isError}>{save.isPending ? "Menyimpan…" : "Simpan"}</Button>
      </div>
      {resident && !resident.userId && (
        <div className="border-t border-line pt-4">
          {confirmDelete ? (
            <div className="space-y-3">
              <p className="text-sm">Hapus data {resident.name}? Data rumah tetap tersimpan.</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={pending}>Batal hapus</Button>
                <Button variant="danger" onClick={() => remove.mutate()} disabled={pending}>{remove.isPending ? "Menghapus…" : "Hapus warga"}</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-empty" disabled={pending}><Trash2 className="size-4" /> Hapus warga</Button>
          )}
          {remove.isError && <Alert>{remove.error.message}</Alert>}
        </div>
      )}
    </form>
  );
}
