import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { usePermission } from "@/client/permissions";
import { invalidate } from "@/client/query";
import { Collapsible } from "@/components/collapsible";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { Select } from "@/components/select";
import { Alert, Button, Field, Input } from "@/components/ui";
import { adminPath } from "@/lib/app-paths";
import { groupByBlock, houseLabel } from "@/lib/houses";
import {
  HOUSING_LABEL,
  RELATION_LABEL,
  type HousingStatus,
  type FamilyRelation,
} from "@/lib/community";
import { formatDateShort, localDate } from "@/lib/dates";
import type { Role } from "@/lib/types";
import { HOUSE_REFRESH, housesQuery, familiesQuery } from "../queries";

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
  familyId: number | null;
  familyRelation: FamilyRelation | null;
  housingStatus: HousingStatus;
  residentSince: string | null;
};

export function WargaDialog({
  open,
  resident,
  onClose,
}: {
  open: boolean;
  resident?: Resident;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={resident ? "Edit warga" : "Tambah warga"}
    >
      <WargaForm
        key={resident?.id ?? "baru"}
        resident={resident}
        onDone={onClose}
      />
    </Dialog>
  );
}

function WargaForm({
  resident,
  onDone,
}: {
  resident?: Resident;
  onDone: () => void;
}) {
  const houses = useQuery(housesQuery);
  const families = useQuery(familiesQuery);
  const canManageAccounts = usePermission("accounts", true);
  const [name, setName] = useState(resident?.name ?? "");
  const [phone, setPhone] = useState(resident?.phone ?? "");
  const [houseId, setHouseId] = useState<number | null>(
    resident?.houseId ?? null,
  );
  const [housingStatus, setHousingStatus] = useState<HousingStatus>(
    resident?.housingStatus ?? "unknown",
  );
  const [residentSince, setResidentSince] = useState(
    resident?.residentSince ?? "",
  );
  const [familyId, setFamilyId] = useState<number | null>(
    resident?.familyId ?? null,
  );
  const [familyRelation, setFamilyRelation] = useState<FamilyRelation>(
    resident?.familyRelation ?? "other",
  );
  const isHead = resident?.familyRelation === "head";
  const moving = houseId !== (resident?.houseId ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const json = {
        name,
        phone,
        houseId,
        housingStatus,
        residentSince: residentSince || null,
        familyId,
        familyRelation: familyId ? familyRelation : null,
      };
      return resident
        ? call(
            api.admin.warga[":id"].$patch({
              param: { id: String(resident.id) },
              json,
            }),
          )
        : call(api.admin.warga.$post({ json }));
    },
    onSuccess: async () => {
      await invalidate(
        ...HOUSE_REFRESH,
        ["admin", "keluarga"],
        ["admin", "warga", "riwayat"],
        ["warga"],
        ["auth"],
      );
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      call(
        api.admin.warga[":id"].$delete({ param: { id: String(resident!.id) } }),
      ),
    onSuccess: async () => {
      await invalidate(...HOUSE_REFRESH, ["admin", "keluarga"], ["warga"]);
      onDone();
    },
  });
  const pending = save.isPending || remove.isPending;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field
        label="Nama"
        hint={
          resident?.userId
            ? "Nama ini juga dipakai untuk masuk ke akunnya."
            : undefined
        }
      >
        <Input
          value={name}
          onValueChange={setName}
          required
          maxLength={resident?.userId ? 40 : 100}
          autoComplete="name"
          data-autofocus
        />
      </Field>
      <Field label="Nomor telepon (opsional)">
        <Input
          type="tel"
          value={phone}
          onValueChange={setPhone}
          maxLength={25}
          autoComplete="tel"
          placeholder="08…"
        />
      </Field>
      <div>
        <Select
          label="Rumah"
          value={houseId === null ? "" : String(houseId)}
          onValueChange={(value) => {
            setHouseId(value ? Number(value) : null);
            setFamilyId(null);
            setResidentSince(value ? localDate(new Date()) : "");
          }}
          options={[{ value: "", label: "Belum ditentukan" }]}
          groups={groupByBlock(houses.data?.houses ?? []).map(
            ([block, rows]) => ({
              label: `Blok ${block}`,
              options: rows.map((house) => ({
                value: String(house.id),
                label: houseLabel(house),
              })),
            }),
          )}
          searchPlaceholder="Cari rumah…"
          disabled={isHead || houses.isPending || houses.isError}
        />
        <p className="mt-1 text-xs text-muted">
          {isHead
            ? "Pindahkan kepala dan anggota bersama melalui tab Keluarga."
            : "Satu rumah bisa terhubung ke beberapa warga."}
        </p>
        {houses.isError && (
          <Alert>
            Daftar rumah belum dimuat.{" "}
            <Button variant="ghost" size="sm" onClick={() => houses.refetch()}>
              Coba lagi
            </Button>
          </Alert>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Status hunian"
          value={housingStatus}
          onValueChange={(v) => setHousingStatus(v as HousingStatus)}
          options={Object.entries(HOUSING_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Field
          label={
            moving && resident ? "Tanggal pindah" : "Mulai tinggal (opsional)"
          }
        >
          <Input
            type="date"
            value={residentSince}
            onValueChange={setResidentSince}
            max={localDate(new Date())}
            required={moving && houseId !== null}
            disabled={houseId === null}
          />
        </Field>
      </div>
      <Select
        label="Keluarga (opsional)"
        value={familyId ? String(familyId) : ""}
        onValueChange={(v) => {
          setFamilyId(v ? Number(v) : null);
          setFamilyRelation("other");
        }}
        disabled={isHead || families.isPending || families.isError}
        options={[
          { value: "", label: "Belum terhubung" },
          ...(families.data?.families ?? [])
            .filter((f) => f.houseId === houseId)
            .map((f) => ({
              value: String(f.id),
              label: `Keluarga ${f.headName}`,
            })),
        ]}
      />
      {familyId && (
        <Select
          label="Hubungan keluarga"
          value={familyRelation}
          onValueChange={(v) => setFamilyRelation(v as FamilyRelation)}
          disabled={isHead}
          options={Object.entries(RELATION_LABEL)
            .filter(([value]) => value !== "head" || isHead)
            .map(([value, label]) => ({ value, label }))}
        />
      )}
      {resident?.userId && canManageAccounts && (
        <p className="text-sm text-muted">
          Akses akun dikelola di{" "}
          <Link
            to={adminPath(`/warga?tab=akun&akun=${resident.userId}`)}
            className="font-medium text-primary underline underline-offset-4"
          >
            Akun
          </Link>
          .
        </p>
      )}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Batal
        </Button>
        <Button
          type="submit"
          disabled={pending || houses.isPending || houses.isError}
        >
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
      {resident && (
        <ResidenceHistory
          residentId={resident.id}
          houses={houses.data?.houses ?? []}
        />
      )}
      {resident && !resident.userId && (
        <div className="border-t border-line pt-4">
          {confirmDelete ? (
            <div className="space-y-3">
              <p className="text-sm">
                Hapus data {resident.name}? Data rumah tetap tersimpan.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                >
                  Batal hapus
                </Button>
                <Button
                  variant="danger"
                  onClick={() => remove.mutate()}
                  disabled={pending}
                >
                  {remove.isPending ? "Menghapus…" : "Hapus warga"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-empty"
              disabled={pending}
            >
              <Trash2 className="size-4" /> Hapus warga
            </Button>
          )}
          {remove.isError && <Alert>{remove.error.message}</Alert>}
        </div>
      )}
    </form>
  );
}

function ResidenceHistory({
  residentId,
  houses,
}: {
  residentId: number;
  houses: { id: number; block: string; number: string }[];
}) {
  const query = useQuery({
    queryKey: ["admin", "warga", "riwayat", residentId],
    queryFn: () =>
      call(
        api.admin.warga[":id"].riwayat.$get({
          param: { id: String(residentId) },
        }),
      ),
  });
  const label = (id: number | null) => {
    const house = houses.find((h) => h.id === id);
    return house ? houseLabel(house) : "Tanpa rumah";
  };
  return (
    <Collapsible
      className="border-t border-line pt-4"
      title="Riwayat tempat tinggal"
    >
      <QueryState query={query}>
        {({ moves }) =>
          moves.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {moves.map((move) => (
                <li key={move.id}>
                  <p>
                    {label(move.fromHouseId)} → {label(move.toHouseId)}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateShort(move.date)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Belum ada perpindahan yang dicatat.
            </p>
          )
        }
      </QueryState>
    </Collapsible>
  );
}
