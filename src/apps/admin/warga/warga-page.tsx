import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Home,
  Pencil,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { QueryState } from "@/components/query-state";
import { Select } from "@/components/select";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { ChipGroup } from "@/components/toggle-group";
import { usePermission } from "@/client/permissions";
import { ROLE_LABEL } from "@/lib/permissions";
import { HOUSING_LABEL } from "@/lib/community";
import { KeluargaPanel } from "./keluarga-page";
import { adminPath } from "@/lib/app-paths";
import { residentsQuery } from "../queries";
import { WargaDialog, type Resident } from "./warga-dialog";

export function WargaPage() {
  const canEdit = usePermission("residents", true);
  const query = useQuery(residentsQuery);
  const [params, setParams] = useSearchParams();
  const familyView = params.get("tab") === "keluarga";
  const [search, setSearch] = useState("");
  const [block, setBlock] = useState("semua");
  const [editing, setEditing] = useState<number | "baru" | null>(
    () => Number(params.get("ubah")) || null,
  );
  const houseFilter = Number(params.get("rumah")) || null;

  return (
    <QueryState query={query}>
      {({ residents }) => {
        const homed = residents.filter((r) => r.houseId !== null);
        const blocks = [...new Set(homed.map((r) => r.block!))].sort((a, b) =>
          a.localeCompare(b, "id", { numeric: true }),
        );
        const q = search.trim().toLocaleLowerCase("id");
        const shown = residents.filter(
          (r) =>
            (!houseFilter || r.houseId === houseFilter) &&
            (block === "semua" ||
              (block === "tanpa-rumah"
                ? r.houseId === null
                : r.block === block)) &&
            (!q ||
              [r.name, r.phone ?? "", r.block && `${r.block}-${r.number}`]
                .filter(Boolean)
                .join(" ")
                .toLocaleLowerCase("id")
                .includes(q)),
        );
        const selected =
          typeof editing === "number"
            ? residents.find((r) => r.id === editing)
            : undefined;
        return (
          <>
            <PageHeader
              title="Warga"
              subtitle="Pendataan warga, keluarga, dan tempat tinggal."
              action={
                canEdit && !familyView && (
                  <Button size="sm" onClick={() => setEditing("baru")}>
                    <UserPlus className="size-4" /> Tambah warga
                  </Button>
                )
              }
            />
            <ChipGroup
              aria-label="Pendataan warga"
              className="mb-5"
              value={familyView ? "keluarga" : "warga"}
              onValueChange={(value) =>
                setParams(value === "keluarga" ? { tab: "keluarga" } : {})
              }
              options={[
                { value: "warga", label: "Daftar warga" },
                { value: "keluarga", label: "Keluarga" },
              ]}
            />
            {familyView ? (
              <KeluargaPanel />
            ) : (
              <>
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Summary label="Warga terdaftar" value={residents.length} />
                  <Summary
                    label="Rumah terhubung"
                    value={new Set(homed.map((r) => r.houseId)).size}
                  />
                  <Summary
                    label="Belum terhubung"
                    value={residents.length - homed.length}
                  />
                </div>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <label className="relative min-w-0 flex-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      aria-label="Cari warga"
                      placeholder="Cari nama, telepon, atau rumah…"
                      value={search}
                      onValueChange={setSearch}
                      className="pl-10"
                    />
                  </label>
                  <div className="sm:w-52">
                    <Select
                      aria-label="Filter blok"
                      value={block}
                      onValueChange={setBlock}
                      options={[
                        { value: "semua", label: "Semua blok" },
                        {
                          value: "tanpa-rumah",
                          label: "Rumah belum ditentukan",
                        },
                        ...blocks.map((value) => ({
                          value,
                          label: `Blok ${value}`,
                        })),
                      ]}
                    />
                  </div>
                </div>
                {houseFilter && (
                  <p className="mb-3 text-sm text-muted">
                    Menampilkan warga pada rumah yang dipilih.{" "}
                    <Link
                      to={adminPath("/warga")}
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      Lihat semua warga
                    </Link>
                  </p>
                )}
                <p className="mb-2 text-xs text-muted" role="status">
                  {shown.length} warga ditampilkan
                </p>
                {shown.length ? (
                  <ResidentList residents={shown} onEdit={setEditing} />
                ) : (
                  <Card className="py-12 text-center">
                    <Users
                      className="mx-auto mb-3 size-8 text-primary"
                      aria-hidden
                    />
                    <p className="font-semibold">
                      {residents.length
                        ? "Tidak ada warga yang cocok"
                        : "Belum ada warga"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {residents.length
                        ? "Ubah pencarian atau filter blok."
                        : canEdit ? "Tambahkan warga. Rumahnya bisa ditentukan nanti." : "Data warga belum dicatat pengurus."}
                    </p>
                    {canEdit && !residents.length && (
                      <Button
                        className="mt-4"
                        size="sm"
                        onClick={() => setEditing("baru")}
                      >
                        <UserPlus className="size-4" /> Tambah warga
                      </Button>
                    )}
                  </Card>
                )}
                {canEdit && <WargaDialog
                  open={editing === "baru" || Boolean(selected)}
                  resident={selected}
                  onClose={() => setEditing(null)}
                />}
              </>
            )}
          </>
        );
      }}
    </QueryState>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}

function ResidentList({
  residents,
  onEdit,
}: {
  residents: Resident[];
  onEdit: (id: number) => void;
}) {
  const canEdit = usePermission("residents", true);
  const manageAccounts = usePermission("accounts", true);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div
        className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-4 border-b border-line bg-idle-soft/40 px-5 py-3 text-xs font-medium text-muted sm:grid"
        aria-hidden
      >
        <span>Nama warga</span>
        <span>Rumah</span>
        <span>Akun</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {residents.map((resident) => (
          <li
            key={resident.id}
            className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-2 px-4 py-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] sm:gap-4 sm:px-5"
          >
            <div className="min-w-0">
              {canEdit ? <Button
                variant="plain"
                className="min-h-6 max-w-full break-words text-left text-sm font-semibold hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => onEdit(resident.id)}
              >
                {resident.name}
              </Button> : <p className="break-words text-sm font-semibold">{resident.name}</p>}
              {resident.phone && (
                <a
                  href={`tel:${resident.phone.replace(/[^+\d]/g, "")}`}
                  className="mt-1 block w-fit text-xs text-muted hover:text-primary hover:underline"
                >
                  {resident.phone}
                </a>
              )}
              {resident.familyRelation && (
                <Link
                  to={adminPath("/warga?tab=keluarga")}
                  className="mt-1 block w-fit text-xs text-muted hover:text-primary hover:underline"
                >
                  {resident.familyRelation === "head"
                    ? "Kepala keluarga"
                    : "Anggota keluarga"}
                </Link>
              )}
            </div>
            <div className="col-start-1 row-start-2 text-xs sm:col-auto sm:row-auto sm:text-sm">
              {resident.houseId ? (
                <Link
                  to={adminPath(`/rumah?ubah=${resident.houseId}`)}
                  className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <Home className="size-3.5" aria-hidden />
                  {resident.block}-{resident.number}
                </Link>
              ) : (
                <span className="text-muted">Rumah belum ditentukan</span>
              )}
              {resident.housingStatus !== "unknown" && (
                <p className="mt-1 text-xs text-muted">
                  {HOUSING_LABEL[resident.housingStatus]}
                </p>
              )}
            </div>
            <div className="col-start-1 row-start-3 text-xs sm:col-auto sm:row-auto">
              {resident.userId ? (
                <span className="inline-flex rounded-full bg-primary/8 px-2 py-1 font-medium text-primary">
                  {ROLE_LABEL[resident.role!]}
                  {resident.accountActive === false ? " · nonaktif" : ""}
                </span>
              ) : manageAccounts ? (
                <Link
                  to={adminPath(`/petugas?warga=${resident.id}`)}
                  className="inline-flex items-center gap-1 text-muted hover:text-primary hover:underline"
                >
                  Buat akun <ArrowUpRight className="size-3" aria-hidden />
                </Link>
              ) : (
                <span className="text-muted">Tanpa akun</span>
              )}
            </div>
            {canEdit && <Button
              size="icon"
              variant="ghost"
              aria-label={`Edit ${resident.name}`}
              onClick={() => onEdit(resident.id)}
              className="col-start-2 row-span-3 row-start-1 sm:col-auto sm:row-span-1 sm:row-auto"
            >
              <Pencil className="size-4" aria-hidden />
            </Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
