import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Printer, RefreshCw, Trash2, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { QrSvg } from "@/components/qr-svg";
import { Alert, Field, buttonClass, cx, inputClass } from "@/components/ui";
import { houseLabelLong, normalizeHouseField, parseNumberList } from "@/lib/houses";
import { houseUrl } from "@/lib/qr";
import type { HouseDTO, HouseStatus } from "@/lib/types";
import { HOUSE_REFRESH } from "../queries";

export type AdminHouse = HouseDTO & { collectionCount: number };


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
  const [ownerName, setOwnerName] = useState("");
  const blocksId = useId();
  const add = useMutation({
    mutationFn: () => call(api.admin.rumah.$post({ json: { block, numbers, ownerName } })),
    onSuccess: () => {
      // Dari kavling di denah: langsung tutup supaya bisa lanjut ke kavling berikutnya.
      if (initial.number) onDone();
      // Selain itu blok dibiarkan supaya bisa langsung menambah nomor lain di blok yang sama.
      setNumbers("");
      setOwnerName("");
      return invalidate(...HOUSE_REFRESH);
    },
  });

  const blockKey = normalizeHouseField(block);
  const parsed = numbers.trim() ? parseNumberList(numbers) : [];
  const existing = new Set(houses.filter((h) => h.block === blockKey).map((h) => h.number));
  const fresh = (parsed ?? []).filter((n) => !existing.has(n));
  const skipped = (parsed?.length ?? 0) - fresh.length;
  // Server hanya memakai nama KK kalau menambah satu rumah.
  const single = parsed !== null && parsed.length <= 1;

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
          <input
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            required
            maxLength={10}
            autoFocus={!initial.block}
            list={blocksId}
            placeholder="A"
            className={cx(inputClass, "uppercase")}
          />
          <datalist id={blocksId}>
            {[...new Set(houses.map((h) => h.block))].map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label="Nomor rumah">
          <input value={numbers} onChange={(e) => setNumbers(e.target.value)} required placeholder="1-20" className={inputClass} />
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

      <Field label="Nama KK (opsional)" hint={single ? undefined : "Hanya dipakai kalau menambah satu rumah."}>
        <input
          value={single ? ownerName : ""}
          onChange={(e) => setOwnerName(e.target.value)}
          disabled={!single}
          maxLength={80}
          // Blok/nomor sudah terisi dari denah: tinggal isi nama.
          autoFocus={Boolean(initial.block)}
          placeholder="Pak Budi"
          className={cx(inputClass, "disabled:opacity-50")}
        />
      </Field>

      {add.isError && <Alert>{add.error.message}</Alert>}
      {add.isSuccess && <Alert tone="success">{add.data.success}</Alert>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className={buttonClass("ghost")}>
          {add.isSuccess ? "Selesai" : "Batal"}
        </button>
        <button type="submit" disabled={add.isPending || parsed === null} className={buttonClass("primary")}>
          {add.isPending ? "Menyimpan…" : fresh.length > 1 ? `Tambah ${fresh.length} rumah` : "Tambah rumah"}
        </button>
      </div>
    </form>
  );
}

/** "A-1, A-2, A-3, …, A-20" */
function previewLabels(block: string, numbers: string[]) {
  const labels = numbers.map((n) => `${block}-${n}`);
  return labels.length > 5 ? `${labels.slice(0, 3).join(", ")}, …, ${labels.at(-1)}` : labels.join(", ");
}

/** `accounts` = nama akun petugas yang tinggal di rumah ini; nama warganya diambil dari akun itu. */
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
            <UserRound className="size-4 text-primary" /> Rumah petugas {accounts.join(", ")}
          </span>
        )
      }
    >
      {house && <EditForm key={house.id} house={house} accounts={accounts} origin={origin} onDone={onClose} />}
    </Dialog>
  );
}

function EditForm({ house, accounts, origin, onDone }: { house: AdminHouse; accounts: string[]; origin: string; onDone: () => void }) {
  const [block, setBlock] = useState(house.block);
  const [number, setNumber] = useState(house.number);
  const [ownerName, setOwnerName] = useState(house.ownerName ?? "");
  const [status, setStatus] = useState<HouseStatus>(house.status);
  const save = useMutation({
    mutationFn: () =>
      call(api.admin.rumah[":id"].$patch({ param: { id: String(house.id) }, json: { block, number, ownerName, status } })),
    onSuccess: async () => {
      await invalidate(...HOUSE_REFRESH);
      onDone();
    },
  });

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
            <input value={block} onChange={(e) => setBlock(e.target.value)} required maxLength={10} className={cx(inputClass, "uppercase")} />
          </Field>
          <Field label="Nomor">
            <input value={number} onChange={(e) => setNumber(e.target.value)} required maxLength={10} className={cx(inputClass, "uppercase")} />
          </Field>
        </div>

        {accounts.length > 1 ? (
          <div>
            <p className="mb-1.5 text-sm font-medium">Penghuni</p>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm text-primary">
                  <UserRound className="size-3.5" /> {name}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Nama dari akun petugas; ubah di{" "}
              <Link to="/admin/petugas" className="font-semibold text-primary underline">
                Petugas
              </Link>
              .
            </p>
          </div>
        ) : (
          <Field
            label={accounts.length ? "Nama penghuni" : "Nama KK"}
            hint={accounts.length ? "Sama dengan nama akun petugasnya: mengubah di sini ikut mengubah nama akun itu." : undefined}
          >
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required={accounts.length > 0}
              maxLength={accounts.length ? 40 : 80}
              placeholder="Pak Budi"
              className={inputClass}
            />
          </Field>
        )}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Status</legend>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map((s) => (
              <label
                key={s.value}
                className={cx(
                  "flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30",
                  status === s.value ? "border-primary bg-primary/10" : "border-line hover:bg-idle-soft/60",
                )}
              >
                <input
                  type="radio"
                  name="status"
                  value={s.value}
                  checked={status === s.value}
                  onChange={() => setStatus(s.value)}
                  className="sr-only"
                />
                <span className={cx("text-sm font-semibold", status === s.value && "text-primary")}>{s.label}</span>
                <span className="text-xs text-muted">{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {save.isError && <Alert>{save.error.message}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onDone} className={buttonClass("ghost")}>
            Batal
          </button>
          <button type="submit" disabled={save.isPending} className={buttonClass("primary")}>
            {save.isPending ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>

      <QrSection house={house} origin={origin} />
      <DeleteSection house={house} onDeleted={onDone} />
    </div>
  );
}

function QrSection({ house, origin }: { house: AdminHouse; origin: string }) {
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
            <Link to={`/admin/rumah/cetak?blok=${encodeURIComponent(house.block)}`} className={buttonClass("secondary", "sm")}>
              <Printer className="size-4" /> Cetak
            </Link>
            <button
              type="button"
              disabled={regenerate.isPending}
              onClick={() => window.confirm("Buat QR baru? Stiker lama rumah ini tidak bisa dipakai lagi.") && regenerate.mutate()}
              className={buttonClass("secondary", "sm")}
            >
              <RefreshCw className={cx("size-4", regenerate.isPending && "animate-spin")} /> QR baru
            </button>
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

  if (house.collectionCount > 0) {
    return (
      <p className="border-t border-line pt-4 text-xs text-muted">
        Rumah ini sudah punya {house.collectionCount} catatan jimpitan, jadi tidak bisa dihapus. Tandai kosong/mudik kalau tidak dihuni
        lagi.
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
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => window.confirm(`Hapus ${houseLabelLong(house)}?`) && remove.mutate()}
          className={cx(buttonClass("danger", "sm"), "shrink-0")}
        >
          <Trash2 className="size-4" /> {remove.isPending ? "Menghapus…" : "Hapus"}
        </button>
      </div>
      {remove.isError && <Alert>{remove.error.message}</Alert>}
    </section>
  );
}
