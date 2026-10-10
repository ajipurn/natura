import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Dices, KeyRound, LockOpen, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { RadioCards, SwitchField, type RadioCardOption } from "@/components/choice";
import { Collapsible } from "@/components/collapsible";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { Select } from "@/components/select";
import { Alert, Button, Field, Input, buttonClass, cx } from "@/components/ui";
import { scheduleQuery } from "@/features/jadwal/queries";
import { formatTime } from "@/lib/dates";
import { groupByBlock, houseLabel } from "@/lib/houses";
import { randomPin } from "@/lib/random-pin";
import { DAY_NAMES } from "@/lib/schedule";
import type { Role } from "@/lib/types";
import { ROLES as ROLE_VALUES, ROLE_LABEL, ROLE_HINT, isManager } from "@/lib/permissions";
import { housesQuery, residentsQuery, usersQuery } from "../queries";
import type { Resident } from "../warga/warga-dialog";
import { adminPath, petugasPath } from "@/lib/app-paths";

export type Petugas = {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  lockedUntil: string | null;
  locked: boolean;
  houseId: number | null;
  house: string | null;
  days: number[];
  /** Terakhir mencatat jimpitan (scan/manual), ISO; null = belum pernah. */
  lastRecordedAt: string | null;
};

/** Data petugas ikut tampil di jadwal, ronda, ringkasan, dan data rumah (nama warga). */
const REFRESH = [["admin"], ["jadwal"], ["ronda"], ["auth", "users"]];

const ROLES: RadioCardOption<Role>[] = ROLE_VALUES.map((value) => ({ value, label: ROLE_LABEL[value], hint: ROLE_HINT[value] }));

/** Tambah petugas (`petugas` kosong) atau ubah petugas. */
export function PetugasDialog({
  open,
  onClose,
  petugas,
  isSelf = false,
  initialResidentId,
}: {
  open: boolean;
  onClose: () => void;
  petugas?: Petugas;
  isSelf?: boolean;
  initialResidentId?: number;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={petugas ? `Ubah ${petugas.name}` : "Buat akun"}
      description={petugas ? undefined : "Pilih warga dan perannya. Akun masuk memakai nama dan PIN."}
    >
      {petugas ? <EditForm petugas={petugas} isSelf={isSelf} onDone={onClose} /> : <CreateForm initialResidentId={initialResidentId} onDone={onClose} />}
    </Dialog>
  );
}

function CreateForm({ onDone, initialResidentId }: { onDone: () => void; initialResidentId?: number }) {
  const query = useQuery(residentsQuery);
  return <QueryState query={query}>{({ residents }) => {
    const available = residents.filter((r) => !r.userId);
    return initialResidentId && !available.some((r) => r.id === initialResidentId)
      ? <Alert>Warga ini sudah memiliki akun atau datanya tidak tersedia. <Link to={adminPath("/warga")} className="font-semibold underline">Kembali ke Warga</Link></Alert>
      : <CreateAccountForm residents={available} initialResidentId={initialResidentId} onDone={onDone} />;
  }}</QueryState>;
}

function CreateAccountForm({ residents, initialResidentId, onDone }: { residents: Resident[]; initialResidentId?: number; onDone: () => void }) {
  const initial = residents.find((r) => r.id === initialResidentId);
  const [residentId, setResidentId] = useState<number | null>(initial?.id ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [pin, setPin] = useState(randomPin);
  const [role, setRole] = useState<Role>("petugas");
  const [houseId, setHouseId] = useState<number | null>(initial?.houseId ?? null);
  const create = useMutation({
    mutationFn: () => call(api.admin.petugas.$post({ json: { name: name.trim(), pin, role, houseId, residentId } })),
    onSuccess: () => invalidate(...REFRESH),
  });

  if (create.isSuccess) {
    return <SharePin name={name.trim()} role={role} pin={pin} onDone={onDone} />;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <Select label="Warga" value={residentId === null ? "baru" : String(residentId)}
        options={[{ value: "baru", label: "Warga baru" }, ...residents.map((r) => ({ value: String(r.id), label: r.name, hint: r.block ? `${r.block}-${r.number}` : "Belum terhubung" }))]}
        onValueChange={(value) => {
          const selected = residents.find((r) => String(r.id) === value);
          setResidentId(selected?.id ?? null);
          setName(selected?.name ?? "");
          setHouseId(selected?.houseId ?? null);
        }} searchPlaceholder="Cari warga…" />
      <Field label="Nama">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={40}
          data-autofocus
          placeholder="Pak Andi"
        />
      </Field>
      <Field label="PIN (4–6 angka)" hint="Sudah dibuatkan PIN acak. PIN bisa diganti di menu Akun pada app Cluster Natura.">
        <div className="flex gap-2">
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            inputMode="numeric"
            pattern="\d{4,6}"
            autoComplete="off"
            className="font-mono text-lg tracking-[0.3em]"
          />
          <Button onClick={() => setPin(randomPin())} variant="secondary" title="PIN acak lain">
            <Dices className="size-5" />
            <span className="sr-only">PIN acak lain</span>
          </Button>
        </div>
      </Field>
      <GuardFields
        houseId={houseId}
        onHouse={setHouseId}
        days={[]}
      />
      <RoleField role={role} onRole={setRole} />
      {create.isError && <Alert>{create.error.message}</Alert>}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onDone} variant="ghost">
          Batal
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Menyimpan…" : "Buat akun"}
        </Button>
      </div>
    </form>
  );
}

/** Setelah petugas dibuat: PIN ditampilkan sekali untuk dibagikan. */
function SharePin({ name, role, pin, onDone }: { name: string; role: Role; pin: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = new URL(isManager(role) ? adminPath("/") : petugasPath("/"), location.origin).href;
  const message = `Halo ${name}, akun ${ROLE_LABEL[role]} sudah dibuat.\nBuka ${url} lalu pilih nama "${name}" dan masukkan PIN: ${pin}\nPIN bisa diganti sendiri di menu Akun pada app Cluster Natura.`;
  return (
    <div className="space-y-4 text-center">
      <KeyRound className="mx-auto size-10 text-primary" />
      <p>
        <strong>{name}</strong> ditambahkan. PIN-nya:
      </p>
      <p className="font-mono text-4xl font-bold tracking-[0.3em]">{pin}</p>
      <p className="text-sm text-muted">Catat atau kirim sekarang; PIN tidak bisa dilihat lagi setelah dialog ini ditutup.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener" className={buttonClass("primary")}>
          <Send className="size-5" /> Kirim lewat WhatsApp
        </a>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message);
              setCopied(true);
            } catch {
              window.prompt("Salin pesan:", message);
            }
          }}
        >
          <Copy className="size-5" /> {copied ? "Tersalin" : "Salin pesan"}
        </Button>
      </div>
      <Button onClick={onDone} variant="ghost" className="w-full">
        Selesai
      </Button>
    </div>
  );
}

function EditForm({ petugas, isSelf, onDone }: { petugas: Petugas; isSelf: boolean; onDone: () => void }) {
  const [name, setName] = useState(petugas.name);
  const [role, setRole] = useState<Role>(petugas.role);
  const [active, setActive] = useState(petugas.active);
  const [houseId, setHouseId] = useState(petugas.houseId);
  const param = { id: String(petugas.id) };
  const save = useMutation({
    mutationFn: () => call(api.admin.petugas[":id"].$patch({ param, json: { name: name.trim(), role, active, houseId } })),
    onSuccess: async () => {
      await invalidate(...REFRESH);
      onDone();
    },
  });
  const locked = petugas.locked ? petugas.lockedUntil : null;

  return (
    <div className="space-y-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Nama">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
        </Field>
        <GuardFields
          userId={petugas.id}
          houseId={houseId}
          onHouse={(id) => setHouseId(id)}
          days={petugas.days}
        />
        <RoleField role={role} onRole={setRole} disabled={isSelf} />
        <SwitchField
          label="Akun aktif"
          description="Akun nonaktif tidak bisa masuk; namanya tetap ada di riwayat."
          checked={active}
          onCheckedChange={setActive}
          disabled={isSelf}
        />
        {isSelf && <p className="text-xs text-muted">Peran dan status akunmu sendiri tidak bisa diubah.</p>}
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

      {!isSelf && <ResetPin petugas={petugas} locked={locked} />}
    </div>
  );
}

function ResetPin({ petugas, locked }: { petugas: Petugas; locked: string | null }) {
  const [pin, setPin] = useState(randomPin);
  const reset = useMutation({
    mutationFn: () => call(api.admin.petugas[":id"].pin.$post({ param: { id: String(petugas.id) }, json: { pin } })),
    onSuccess: () => invalidate(["admin", "petugas"]),
  });

  if (reset.isSuccess) {
    return (
      <div className="border-t border-line pt-4">
        <SharePin name={petugas.name} role={petugas.role} pin={pin} onDone={() => reset.reset()} />
      </div>
    );
  }
  return (
    <Collapsible
      defaultOpen={Boolean(locked)}
      className="border-t border-line pt-4"
      triggerClassName="text-sm font-semibold"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <LockOpen className="size-4 text-primary" /> Atur ulang PIN
          {locked && (
            <span className="rounded-full bg-empty-soft px-2 py-0.5 text-xs font-medium text-empty">terkunci s.d. {formatTime(locked)}</span>
          )}
        </span>
      }
    >
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate();
        }}
      >
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
          inputMode="numeric"
          pattern="\d{4,6}"
          aria-label="PIN baru"
          autoComplete="off"
          className="font-mono tracking-[0.3em]"
        />
        <Button onClick={() => setPin(randomPin())} variant="secondary" title="PIN acak lain" className="shrink-0">
          <Dices className="size-5" />
          <span className="sr-only">PIN acak lain</span>
        </Button>
        <Button type="submit" disabled={reset.isPending} variant="secondary" className="shrink-0">
          {reset.isPending ? "Menyimpan…" : "Atur ulang"}
        </Button>
      </form>
      <p className="mt-1 text-xs text-muted">Untuk akun yang lupa PIN atau terkunci. Sesi lamanya di HP lain akan keluar.</p>
      {reset.isError && <Alert>{reset.error.message}</Alert>}
    </Collapsible>
  );
}

/**
 * Rumah petugas dan malam jaganya. Nama akun ikut ditampilkan pada data rumah,
 * dan jadwal rumah itu (kalau sudah ada) jadi jadwal petugas ini. Malam jaga hanya diubah di Jadwal
 * ronda; di sini cukup terlihat.
 */
function GuardFields({
  userId,
  houseId,
  onHouse,
  days,
}: {
  userId?: number;
  houseId: number | null;
  onHouse: (id: number | null) => void;
  /** Malam jaga sekarang. */
  days: number[];
}) {
  const houses = useQuery(housesQuery).data?.houses ?? [];
  const users = useQuery(usersQuery).data?.users ?? [];
  const schedule = useQuery(scheduleQuery).data?.schedule ?? [];
  const houseDays = (id: number) => schedule.filter((s) => s.userId === null && s.houseId === id).map((s) => s.day);
  const house = houses.find((h) => h.id === houseId);
  const others = users.filter((u) => u.houseId === houseId && u.id !== userId);
  const scheduled = houseId ? [...new Set(houseDays(houseId))].sort() : [];
  // Setelah disimpan: malam jaga sekarang ditambah jadwal rumah yang dipilih.
  const nights = [...new Set([...days, ...scheduled])].sort();

  return (
    <>
      <div>
        <Select
          label="Rumah"
          value={houseId ? String(houseId) : ""}
          onValueChange={(v) => onHouse(v ? Number(v) : null)}
          options={[{ value: "", label: "Tanpa rumah" }]}
          groups={groupByBlock(houses).map(([block, list]) => ({
            label: `Blok ${block}`,
            options: list.map((h) => ({ value: String(h.id), label: houseLabel(h), hint: h.ownerName ?? undefined })),
          }))}
        />
        {house && (
          <span className="mt-1 block text-xs text-muted">
            {others.length > 0
              ? `Rumah ini juga dihuni ${others.map((u) => u.name).join(", ")}.`
              : "Nama akun ikut ditampilkan di data rumah. Warga lain tetap tercatat."}
            {scheduled.length > 0 && ` Jadwal rumah ini (${scheduled.map((d) => DAY_NAMES[d]).join(", ")}) jadi jadwal petugas ini.`}
          </span>
        )}
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Jaga malam</p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2.5 text-sm">
          <span className={cx(nights.length === 0 && "text-muted")}>
            {nights.length ? nights.map((d) => DAY_NAMES[d]).join(", ") : "Belum dijadwalkan"}
          </span>
          <Link to={adminPath("/jadwal")} className="font-semibold text-primary">
            Atur di Jadwal ronda
          </Link>
        </div>
      </div>
    </>
  );
}

function RoleField({ role, onRole, disabled }: { role: Role; onRole: (role: Role) => void; disabled?: boolean }) {
  return <RadioCards legend="Peran" value={role} onValueChange={onRole} options={ROLES} disabled={disabled} />;
}
