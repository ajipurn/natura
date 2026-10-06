import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { Alert, Button, Field, Input } from "@/components/ui";
import { houseLabelLong } from "@/lib/houses";
import type { HouseDTO } from "@/lib/types";
import { HOUSE_REFRESH } from "../queries";

/**
 * Isi nama KK rumah yang belum ada namanya, langsung dari jadwal. Namanya disimpan di data rumah
 * (satu sumber), bukan di jadwal. `house` = null: dialog tertutup.
 */
export function HouseNameDialog({
  house,
  onClose,
  onSaved,
}: {
  house: HouseDTO | null;
  onClose: () => void;
  onSaved: (houseId: number, ownerName: string) => void;
}) {
  return (
    <Dialog
      open={house !== null}
      onClose={onClose}
      title={house ? `Nama KK ${houseLabelLong(house)}` : ""}
      description="Disimpan di data rumah, jadi ikut tampil di Rumah & QR dan halaman warga."
    >
      {house && <NameForm key={house.id} house={house} onCancel={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function NameForm({
  house,
  onCancel,
  onSaved,
}: {
  house: HouseDTO;
  onCancel: () => void;
  onSaved: (houseId: number, ownerName: string) => void;
}) {
  const [ownerName, setOwnerName] = useState("");
  const save = useMutation({
    mutationFn: () =>
      call(
        api.admin.rumah[":id"].$patch({
          param: { id: String(house.id) },
          json: { block: house.block, number: house.number, ownerName, status: house.status },
        }),
      ),
    onSuccess: async () => {
      await invalidate(...HOUSE_REFRESH);
      onSaved(house.id, ownerName.trim());
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Nama KK">
        <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required maxLength={80} placeholder="Pak Budi" data-autofocus />
      </Field>
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
