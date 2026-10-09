import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Users } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { Select } from "@/components/select";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { HOUSING_LABEL, RELATION_LABEL } from "@/lib/community";
import { localDate } from "@/lib/dates";
import {
  familiesQuery,
  housesQuery,
  HOUSE_REFRESH,
  residentsQuery,
} from "../queries";

type Family = {
  id: number;
  headResidentId: number;
  headName: string;
  houseId: number | null;
  block: string | null;
  number: string | null;
  housingStatus: keyof typeof HOUSING_LABEL;
  note: string | null;
  members: {
    id: number;
    name: string;
    familyRelation: keyof typeof RELATION_LABEL | null;
  }[];
};
type Member = { id: number; relation: "spouse" | "child" | "parent" | "other" };

/** Dikelola sebagai tab di Warga, memakai orang yang sama dengan daftar warga. */
export function KeluargaPanel() {
  const query = useQuery(familiesQuery);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  return (
    <QueryState query={query}>
      {({ families }) => {
        const shown = families.filter((family) =>
          `${family.headName} ${family.block ?? ""}-${family.number ?? ""} ${family.members.map((member) => member.name).join(" ")}`
            .toLocaleLowerCase("id")
            .includes(search.trim().toLocaleLowerCase("id")),
        );
        const selected =
          typeof editing === "number"
            ? families.find((family) => family.id === editing)
            : undefined;
        return (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <Input
                aria-label="Cari keluarga"
                type="search"
                placeholder="Cari kepala, anggota, atau rumah…"
                value={search}
                onValueChange={setSearch}
              />
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => setEditing("new")}
              >
                <Plus className="size-4" />
                Tambah keluarga
              </Button>
            </div>
            <p className="mb-3 text-xs text-muted" role="status">
              {shown.length} keluarga ·{" "}
              {families.reduce((sum, family) => sum + family.members.length, 0)}{" "}
              anggota terhubung
            </p>
            {!shown.length ? (
              <Card className="py-10 text-center">
                <Users
                  className="mx-auto mb-3 size-8 text-primary"
                  aria-hidden
                />
                <p className="font-semibold">
                  {families.length
                    ? "Tidak ada keluarga yang cocok"
                    : "Belum ada keluarga"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Pilih kepala dan anggota dari daftar warga yang sudah
                  terdaftar.
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {shown.map((family) => (
                  <Card key={family.id}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="break-words font-semibold">
                          Keluarga {family.headName}
                        </h2>
                        <p className="mt-1 text-sm text-muted">
                          {family.houseId
                            ? `${family.block}-${family.number}`
                            : "Rumah belum ditentukan"}{" "}
                          · {HOUSING_LABEL[family.housingStatus]}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit keluarga ${family.headName}`}
                        onClick={() => setEditing(family.id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                    <ul className="mt-4 divide-y divide-line">
                      {family.members.map((member) => (
                        <li
                          key={member.id}
                          className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                        >
                          <span className="break-words font-medium">
                            {member.name}
                          </span>
                          <span className="text-xs text-muted">
                            {member.familyRelation
                              ? RELATION_LABEL[member.familyRelation]
                              : "Anggota"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {family.note && (
                      <p className="mt-3 break-words text-xs text-muted">
                        {family.note}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
            <Dialog
              open={editing !== null}
              onClose={() => setEditing(null)}
              title={selected ? "Edit keluarga" : "Tambah keluarga"}
              description="Setiap anggota memakai data yang sama dengan daftar warga."
            >
              <FamilyForm
                key={selected?.id ?? "new"}
                family={selected}
                onDone={() => setEditing(null)}
              />
            </Dialog>
          </>
        );
      }}
    </QueryState>
  );
}

function FamilyForm({
  family,
  onDone,
}: {
  family?: Family;
  onDone: () => void;
}) {
  const people = useQuery(residentsQuery);
  const homes = useQuery(housesQuery);
  const [headId, setHeadId] = useState(String(family?.headResidentId ?? ""));
  const [houseId, setHouseId] = useState<number | null>(
    family?.houseId ?? null,
  );
  const [members, setMembers] = useState<Member[]>(
    family?.members
      .filter((member) => member.id !== family.headResidentId)
      .map((member) => ({
        id: member.id,
        relation:
          member.familyRelation && member.familyRelation !== "head"
            ? member.familyRelation
            : "other",
      })) ?? [],
  );
  const [note, setNote] = useState(family?.note ?? "");
  const [moveDate, setMoveDate] = useState(localDate(new Date()));
  const [memberSearch, setMemberSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const json = {
        headResidentId: Number(headId),
        houseId,
        members,
        note,
        moveDate,
      };
      return family
        ? call(
            api.admin.keluarga[":id"].$patch({
              param: { id: String(family.id) },
              json,
            }),
          )
        : call(api.admin.keluarga.$post({ json }));
    },
    onSuccess: async () => {
      await invalidate(...HOUSE_REFRESH, ["auth"]);
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      call(
        api.admin.keluarga[":id"].$delete({
          param: { id: String(family!.id) },
        }),
      ),
    onSuccess: async () => {
      await invalidate(...HOUSE_REFRESH);
      onDone();
    },
  });
  const pending = save.isPending || remove.isPending;
  return (
    <QueryState query={people}>
      {({ residents }) => {
        const available = residents.filter(
          (resident) => !resident.familyId || resident.familyId === family?.id,
        );
        const shown = available.filter(
          (resident) =>
            String(resident.id) !== headId &&
            resident.name
              .toLocaleLowerCase("id")
              .includes(memberSearch.toLocaleLowerCase("id")),
        );
        return (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Select
              label="Kepala keluarga"
              value={headId}
              onValueChange={(value) => {
                const person = available.find(
                  (resident) => String(resident.id) === value,
                );
                if (!family) setHouseId(person?.houseId ?? null);
                setMembers((current) => {
                  const kept = current.filter(
                    (member) => String(member.id) !== value,
                  );
                  return family &&
                    headId &&
                    headId !== value &&
                    !kept.some((member) => String(member.id) === headId)
                    ? [...kept, { id: Number(headId), relation: "other" }]
                    : kept;
                });
                setHeadId(value);
              }}
              options={[
                { value: "", label: "Pilih warga…" },
                ...available.map((resident) => ({
                  value: String(resident.id),
                  label: resident.name,
                  hint: resident.block
                    ? `${resident.block}-${resident.number}`
                    : "Belum terhubung",
                })),
              ]}
              searchPlaceholder="Cari warga…"
            />
            <Select
              label="Rumah keluarga"
              value={houseId ? String(houseId) : ""}
              onValueChange={(value) =>
                setHouseId(value ? Number(value) : null)
              }
              options={[
                { value: "", label: "Belum ditentukan" },
                ...(homes.data?.houses ?? []).map((house) => ({
                  value: String(house.id),
                  label: `${house.block}-${house.number}`,
                })),
              ]}
              disabled={homes.isPending || homes.isError}
            />
            <p className="text-xs text-muted">
              Semua anggota terhubung ke rumah ini. Mengubah rumah akan
              memindahkan seluruh anggota yang dipilih.
            </p>
            <div>
              <p className="mb-2 text-sm font-medium">Anggota keluarga</p>
              <Input
                type="search"
                aria-label="Cari anggota keluarga"
                placeholder="Cari warga untuk ditambahkan…"
                value={memberSearch}
                onValueChange={setMemberSearch}
              />
              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line p-2">
                {shown.map((resident) => {
                  const selected = members.find(
                    (member) => member.id === resident.id,
                  );
                  return (
                    <div
                      key={resident.id}
                      className="space-y-1 border-b border-line py-2 last:border-0"
                    >
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 px-1 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-primary"
                          checked={Boolean(selected)}
                          onChange={(event) =>
                            setMembers((current) =>
                              event.target.checked
                                ? [
                                    ...current,
                                    { id: resident.id, relation: "other" },
                                  ]
                                : current.filter(
                                    (member) => member.id !== resident.id,
                                  ),
                            )
                          }
                        />
                        <span className="min-w-0 break-words">
                          {resident.name}
                        </span>
                        <span className="ml-auto text-xs text-muted">
                          {resident.block &&
                            `${resident.block}-${resident.number}`}
                        </span>
                      </label>
                      {selected && (
                        <Select
                          aria-label={`Hubungan ${resident.name}`}
                          value={selected.relation}
                          onValueChange={(value) =>
                            setMembers((current) =>
                              current.map((member) =>
                                member.id === resident.id
                                  ? { ...member, relation: value }
                                  : member,
                              ),
                            )
                          }
                          options={Object.entries(RELATION_LABEL)
                            .filter(([value]) => value !== "head")
                            .map(([value, label]) => ({
                              value: value as Member["relation"],
                              label,
                            }))}
                        />
                      )}
                    </div>
                  );
                })}
                {!shown.length && (
                  <p className="p-3 text-sm text-muted">
                    Tidak ada anggota yang cocok. Tambahkan orang baru melalui
                    Daftar warga.
                  </p>
                )}
              </div>
            </div>
            <DatePicker
              label="Tanggal pindah"
              value={moveDate}
              onValueChange={setMoveDate}
              today={localDate(new Date())}
              max={localDate(new Date())}
            />
            <p className="text-xs text-muted">
              Tanggal ini dipakai untuk anggota yang rumahnya berubah.
            </p>
            <Field label="Catatan (opsional)">
              <Input value={note} onValueChange={setNote} maxLength={200} />
            </Field>
            {homes.isError && (
              <Alert>
                Daftar rumah belum dimuat.{" "}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => homes.refetch()}
                >
                  Coba lagi
                </Button>
              </Alert>
            )}
            {save.isError && <Alert>{save.error.message}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onDone} disabled={pending}>
                Batal
              </Button>
              <Button
                type="submit"
                disabled={pending || homes.isPending || homes.isError}
              >
                {save.isPending ? "Menyimpan…" : "Simpan keluarga"}
              </Button>
            </div>
            {family && (
              <div className="border-t border-line pt-3">
                {confirmDelete ? (
                  <>
                    <p className="mb-3 text-sm">
                      Hapus kelompok keluarga ini? Semua warga dan rumahnya
                      tetap tersimpan.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Kembali
                      </Button>
                      <Button
                        variant="danger"
                        disabled={pending}
                        onClick={() => remove.mutate()}
                      >
                        Hapus kelompok keluarga
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Hapus kelompok keluarga
                  </Button>
                )}
                {remove.isError && <Alert>{remove.error.message}</Alert>}
              </div>
            )}
          </form>
        );
      }}
    </QueryState>
  );
}
