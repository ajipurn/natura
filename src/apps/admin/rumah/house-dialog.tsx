import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ExternalLink, Printer, RefreshCw, Trash2, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { usePermission } from "@/client/permissions";
import { invalidate } from "@/client/query";
import { RadioCards } from "@/components/choice";
import { Dialog } from "@/components/dialog";
import { QrSvg } from "@/components/qr-svg";
import { Select } from "@/components/select";
import { Alert, Button, Field, Input, buttonClass, cx } from "@/components/ui";
import { houseLabel, houseLabelLong, normalizeHouseField, parseNumberList } from "@/lib/houses";
import { houseUrl } from "@/lib/qr";
import type { PaymentCadence } from "@/lib/payments";
import type { HouseDTO, HouseStatus } from "@/lib/types";
import { HOUSE_REFRESH, residentsQuery } from "../queries";
import type { Resident } from "../warga/warga-dialog";
import { PaymentPlanSection } from "../payments/plan-section";
import { adminPath } from "@/lib/app-paths";

export type AdminHouse = HouseDTO & { collectionCount: number; paymentCount: number; duesCount?: number; residenceMoveCount?: number; paymentCadence: PaymentCadence; residents?: { id: number; name: string; userId: number | null; familyId?: number | null }[] };


const STATUSES: { value: HouseStatus; label: string; hint: string }[] = [
  { value: "active", label: "Dihuni", hint: "Dihitung saat ronda" },
  { value: "vacant", label: "Kosong / mudik", hint: "Tidak dihitung bolong" },
];

/** `initial` = blok/nomor yang sudah diisi (mis. dari kavling di denah); null = dialog tertutup. */
export function AddHouseDialog({
  initial,
  onClose,
  houses,
}: {
  initial: { block: string; number: string } | null;
  onClose: () => void;
  houses: HouseDTO[];
}) {
  return (
    <Dialog open={initial !== null} onClose={onClose} title="Tambah rumah" description="Satu rumah, atau satu deret nomor sekaligus.">
      {initial && <AddForm houses={houses} initial={initial} onDone={onClose} />}
    </Dialog>
  );
}

function AddForm({ houses, initial, onDone }: { houses: HouseDTO[]; initial: { block: string; number: string }; onDone: () => void }) {
  const [block, setBlock] = useState(initial.block);
  const [numbers, setNumbers] = useState(initial.number);
  const [residentId, setResidentId] = useState<number | null>(null);
  const people = useQuery(residentsQuery);
  const parsed = numbers.trim() ? parseNumberList(numbers) : [];
  const single = parsed?.length === 1;
  const selected = people.data?.residents.find((person) => person.id === residentId);
  const blocksId = useId();
  const add = useMutation({
    mutationFn: () => call(api.admin.rumah.$post({ json: { block, numbers, residentId: single ? residentId : null } })),
    onSuccess: () => {
      // Dari kavling di denah: langsung tutup supaya bisa lanjut ke kavling berikutnya.
      if (initial.number) onDone();
      // Selain itu blok dibiarkan supaya bisa langsung menambah nomor lain di blok yang sama.
      setNumbers("");
      setResidentId(null);
      return invalidate(...HOUSE_REFRESH, ["warga"], ["auth"]);
    },
  });

  const blockKey = normalizeHouseField(block);
  const existing = new Set(houses.filter((h) => h.block === blockKey).map((h) => h.number));
  const fresh = (parsed ?? []).filter((n) => !existing.has(n));
  const skipped = (parsed?.length ?? 0) - fresh.length;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field label="Blok">
          <Input
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            required
            maxLength={10}
            data-autofocus={!initial.block || undefined}
            list={blocksId}
            placeholder="A"
            className="uppercase"
          />
          <datalist id={blocksId}>
            {[...new Set(houses.map((h) => h.block))].map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label="Nomor rumah">
          <Input value={numbers} onChange={(e) => setNumbers(e.target.value)} required placeholder="1-20" />
        </Field>
      </div>

      {parsed === null ? (
        <p className="-mt-2 text-xs text-empty">Format belum benar. Contoh: 12, rentang 1-20, atau daftar 1, 3, 5A.</p>
      ) : parsed.length > 0 && blockKey ? (
        <div className="-mt-1 rounded-xl bg-idle-soft/60 px-3 py-2 text-sm">
          {fresh.length > 0 ? (
            <>
              <strong>{fresh.length} rumah baru:</strong> {previewLabels(blockKey, fresh)}
              {skipped > 0 && <span className="block text-xs text-muted">{skipped} sudah terdaftar, akan dilewati.</span>}
            </>
          ) : (
            <span className="text-muted">Semua nomor ini sudah terdaftar di blok {blockKey}.</span>
          )}
        </div>
      ) : (
        <p className="-mt-2 text-xs text-muted">Satu nomor (12), rentang (1-20), atau daftar (1, 3, 5A).</p>
      )}

      <ResidentSelect query={people} value={single ? residentId : null} onValueChange={setResidentId} disabled={!single || add.isPending} />
      {!single && <p className="-mt-2 text-xs text-muted">Pilih warga saat menambah satu rumah.</p>}
      {single && residentId !== null && <p className="-mt-2 text-xs text-muted">
        {selected?.block && selected.number
          ? `${selected.name} akan dipindahkan dari ${houseLabel({ block: selected.block, number: selected.number })} ke rumah baru ini.`
          : "Warga yang dipilih akan terhubung ke rumah baru ini."}
      </p>}

      {add.isError && <Alert>{add.error.message}</Alert>}
      {add.isSuccess && <Alert tone="success">{add.data.success}</Alert>}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onDone} variant="ghost">
          {add.isSuccess ? "Selesai" : "Batal"}
        </Button>
        <Button type="submit" disabled={add.isPending || parsed === null}>
          {add.isPending ? "Menyimpan…" : fresh.length > 1 ? `Tambah ${fresh.length} rumah` : "Tambah rumah"}
        </Button>
      </div>
    </form>
  );
}

/** "A-1, A-2, A-3, …, A-20" */
function previewLabels(block: string, numbers: string[]) {
  const labels = numbers.map((n) => `${block}-${n}`);
  return labels.length > 5 ? `${labels.slice(0, 3).join(", ")}, …, ${labels.at(-1)}` : labels.join(", ");
}

/** `accounts` = nama akun penghuni rumah ini; nama warganya diambil dari akun itu. */
export function EditHouseDialog({
  house,
  accounts,
  origin,
  onClose,
}: {
  house: AdminHouse | undefined;
  accounts: string[];
  origin: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(house)}
      onClose={onClose}
      title={house ? houseLabelLong(house) : ""}
      description={
        accounts.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-4 text-primary" /> Penghuni berakun: {accounts.join(", ")}
          </span>
        )
      }
    >
      {house && <EditForm key={house.id} house={house} accounts={accounts} origin={origin} onDone={onClose} />}
    </Dialog>
  );
}

function EditForm({ house, accounts, origin, onDone }: { house: AdminHouse; accounts: string[]; origin: string; onDone: () => void }) {
  const canEdit = usePermission("houses", true);
  const canFinance = usePermission("finance");
  const [block, setBlock] = useState(house.block);
  const [number, setNumber] = useState(house.number);
  const people = useQuery({ ...residentsQuery, enabled: canEdit });
  const current = people.data?.residents.filter((person) => person.houseId === house.id) ?? house.residents ?? [];
  const [selection, setSelection] = useState<{ residentId: number | null; previousResidentId: number | null } | null>(null);
  const residentId = selection ? selection.residentId : current[0]?.id ?? null;
  const previous = selection ? people.data?.residents.find((person) => person.id === selection.previousResidentId) : undefined;
  const selected = people.data?.residents.find((person) => person.id === residentId);
  const changed = selection !== null && selection.residentId !== selection.previousResidentId;
  const [status, setStatus] = useState<HouseStatus>(house.status);
  const save = useMutation({
    mutationFn: () =>
      call(api.admin.rumah[":id"].$patch({ param: { id: String(house.id) }, json: { block, number, status, ...selection } })),
    onSuccess: async () => {
      await invalidate(...HOUSE_REFRESH, ["warga"], ["auth"]);
      onDone();
    },
  });

  if (!canEdit) return <div className="space-y-5"><p className="text-sm text-muted">{house.status === "active" ? "Dihuni" : "Kosong / mudik"}</p><p className="text-sm">{house.residents?.map((r) => r.name).join(", ") || house.ownerName || "Nama penghuni belum dicatat"}</p>{canFinance && <PaymentPlanSection houseId={house.id} />}<QrSection house={house} origin={origin} /></div>;

  return (
    <div className="space-y-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Blok">
            <Input value={block} onChange={(e) => setBlock(e.target.value)} required maxLength={10} className="uppercase" />
          </Field>
          <Field label="Nomor">
            <Input value={number} onChange={(e) => setNumber(e.target.value)} required maxLength={10} className="uppercase" />
          </Field>
        </div>

        {current.length > 1 || accounts.length > 1 ? (
          <div>
            <p className="mb-1.5 text-sm font-medium">Penghuni</p>
            <div className="flex flex-wrap gap-1.5">
              {(current.length ? current.map((r) => r.name) : accounts).map((name, index) => (
                <span key={index} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm text-primary">
                  <UserRound className="size-3.5" /> {name}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Kelola penghuni di{" "}
              <Link to={adminPath(`/warga?rumah=${house.id}`)} className="font-semibold text-primary underline">
                Warga
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <ResidentSelect query={people} value={residentId} currentHouseId={house.id}
              disabled={save.isPending || Boolean(current[0]?.familyId)}
              onValueChange={(id) => setSelection({ residentId: id, previousResidentId: selection ? selection.previousResidentId : current[0]?.id ?? null })} />
            {current[0]?.familyId && <p className="text-xs text-muted">Perpindahan keluarga dikelola di menu Warga.</p>}
            {changed && <p className="text-xs text-muted">
              {residentId !== null && (selected?.block && selected.number && selected.houseId !== house.id
                ? `${selected.name} akan dipindahkan dari ${houseLabel({ block: selected.block, number: selected.number })} ke rumah ini. `
                : "Warga yang dipilih akan terhubung ke rumah ini. ")}
              {previous && `${previous.name} tidak lagi terhubung ke rumah ini.`}
            </p>}
          </div>
        )}

        <RadioCards legend="Status" value={status} onValueChange={setStatus} options={STATUSES} />

        {save.isError && <Alert>{save.error.message}</Alert>}
        <div className="flex justify-end gap-2">
          <Button onClick={onDone} variant="ghost">
            Batal
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>

      {canFinance && <PaymentPlanSection houseId={house.id} />}
      <QrSection house={house} origin={origin} />
      <DeleteSection house={house} onDeleted={onDone} />
    </div>
  );
}

function ResidentSelect({ query, value, onValueChange, disabled, currentHouseId }: {
  query: UseQueryResult<{ residents: Resident[] }>;
  value: number | null;
  onValueChange: (value: number | null) => void;
  disabled?: boolean;
  currentHouseId?: number;
}) {
  return <div>
    <Select label="Nama warga" value={value === null ? "" : String(value)}
      onValueChange={(id) => onValueChange(id ? Number(id) : null)}
      disabled={disabled || query.isPending || query.isError}
      placeholder={query.isPending ? "Memuat warga…" : "Pilih warga"}
      searchPlaceholder="Cari nama atau rumah…"
      options={[
        { value: "", label: "Belum ditentukan" },
        ...(query.data?.residents ?? [])
          .filter((person) => !person.familyId || person.houseId === currentHouseId)
          .map((person) => ({ value: String(person.id), label: person.name,
            hint: person.block && person.number ? houseLabel({ block: person.block, number: person.number }) : "Tanpa rumah" })),
      ]} />
    <p className="mt-1.5 text-xs text-muted">Kelola data penghuni di <Link to={adminPath(currentHouseId ? `/warga?rumah=${currentHouseId}` : "/warga")} className="font-semibold text-primary underline">Warga</Link>.</p>
    {query.isError && <Alert>Daftar warga belum dimuat. <Button variant="ghost" size="sm" onClick={() => query.refetch()}>Coba lagi</Button></Alert>}
  </div>;
}

function QrSection({ house, origin }: { house: AdminHouse; origin: string }) {
  const canEdit = usePermission("houses", true);
  const regenerate = useMutation({
    mutationFn: () => call(api.admin.rumah[":id"].token.$post({ param: { id: String(house.id) } })),
    onSuccess: () => invalidate(...HOUSE_REFRESH),
  });
  const url = houseUrl(origin, house.token);

  return (
    <section className="space-y-3 border-t border-line pt-4">
      <div className="flex gap-4">
        <div className="shrink-0 rounded-xl border border-line bg-white p-2">
          <QrSvg text={url} className="size-24" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Stiker QR</h3>
          <p className="mt-0.5 text-xs text-muted">Dipindai petugas saat ronda; warga bisa melihat riwayat jimpitan rumahnya.</p>
          <p className="mt-1.5 font-mono text-sm tracking-wider">{house.token}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a href={url} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
              <ExternalLink className="size-4" /> Buka
            </a>
            <Link to={adminPath(`/rumah/cetak?blok=${encodeURIComponent(house.block)}`)} className={buttonClass("secondary", "sm")}>
              <Printer className="size-4" /> Cetak
            </Link>
            {canEdit && <Button
              disabled={regenerate.isPending}
              onClick={() => window.confirm("Buat QR baru? Stiker lama rumah ini tidak bisa dipakai lagi.") && regenerate.mutate()}
              variant="secondary" size="sm"
            >
              <RefreshCw className={cx("size-4", regenerate.isPending && "animate-spin")} /> QR baru
            </Button>}
          </div>
        </div>
      </div>
      {regenerate.isSuccess && <Alert tone="success">{regenerate.data.success}</Alert>}
      {regenerate.isError && <Alert>{regenerate.error.message}</Alert>}
    </section>
  );
}

function DeleteSection({ house, onDeleted }: { house: AdminHouse; onDeleted: () => void }) {
  const remove = useMutation({
    mutationFn: () => call(api.admin.rumah[":id"].$delete({ param: { id: String(house.id) } })),
    onSuccess: () => {
      onDeleted();
      return invalidate(...HOUSE_REFRESH);
    },
  });

  if (house.collectionCount > 0 || house.paymentCount > 0 || house.duesCount || house.residenceMoveCount || house.residents?.some((r) => r.familyId)) {
    return (
      <p className="border-t border-line pt-4 text-xs text-muted">
        Rumah ini sudah memiliki catatan pembayaran atau hunian, jadi tidak bisa dihapus. Tandai kosong/mudik kalau tidak dihuni lagi.
      </p>
    );
  }
  return (
    <section className="space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Hapus rumah</h3>
          <p className="text-xs text-muted">Belum ada catatan jimpitan. Stiker QR-nya tidak bisa dipakai lagi.</p>
        </div>
        <Button
          disabled={remove.isPending}
          onClick={() => window.confirm(`Hapus ${houseLabelLong(house)}?`) && remove.mutate()}
          variant="danger" size="sm" className="shrink-0"
        >
          <Trash2 className="size-4" /> {remove.isPending ? "Menghapus…" : "Hapus"}
        </Button>
      </div>
      {remove.isError && <Alert>{remove.error.message}</Alert>}
    </section>
  );
}
