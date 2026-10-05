import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Dices, KeyRound, LockOpen, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { RadioCards, SwitchField, type RadioCardOption } from "@/components/choice";
import { Collapsible } from "@/components/collapsible";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Alert, Button, Field, Input, buttonClass, cx } from "@/components/ui";
import { scheduleQuery } from "@/features/jadwal/queries";
import { formatTime } from "@/lib/dates";
import { groupByBlock, houseLabel } from "@/lib/houses";
import { randomPin } from "@/lib/random-pin";
import { DAY_NAMES, dayLabel } from "@/lib/schedule";
import type { Role } from "@/lib/types";
import { housesQuery, usersQuery } from "../queries";

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

const ROLES: RadioCardOption<Role>[] = [
  { value: "petugas", label: "Petugas", hint: "Mencatat jimpitan" },
  { value: "admin", label: "Admin", hint: "Juga mengelola data" },
];

/** Tambah petugas (`petugas` kosong) atau ubah petugas. */
export function PetugasDialog({
  open,
  onClose,
  petugas,
  isSelf = false,
}: {
  open: boolean;
  onClose: () => void;
  petugas?: Petugas;
  isSelf?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={petugas ? `Ubah ${petugas.name}` : "Tambah petugas"}
      description={petugas ? undefined : "Petugas masuk ke app petugas dengan nama dan PIN ini."}
    >
      {petugas ? <EditForm petugas={petugas} isSelf={isSelf} onDone={onClose} /> : <CreateForm onDone={onClose} />}
    </Dialog>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState(randomPin);
  const [role, setRole] = useState<Role>("petugas");
  const [houseId, setHouseId] = useState<number | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const create = useMutation({
    mutationFn: () => call(api.admin.petugas.$post({ json: { name: name.trim(), pin, role, houseId, days } })),
    onSuccess: () => invalidate(...REFRESH),
  });

  if (create.isSuccess) {
    return <SharePin name={name.trim()} pin={pin} onDone={onDone} />;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        create.mutate();
      }}
    >
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
      <Field label="PIN (4–6 angka)" hint="Sudah dibuatkan PIN acak. Petugas bisa menggantinya sendiri di menu Akun.">
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
        name={name}
        houseId={houseId}
        onHouse={(id, ownerName) => {
          setHouseId(id);
          // Rumah tanpa akun yang sudah punya nama KK: namanya dipakai untuk akun baru.
          if (ownerName && !name.trim()) setName(ownerName);
        }}
        days={days}
        onDays={setDays}
      />
      <RoleField role={role} onRole={setRole} />
      {create.isError && <Alert>{create.error.message}</Alert>}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onDone} variant="ghost">
          Batal
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Menyimpan…" : "Tambah petugas"}
        </Button>
      </div>
    </form>
  );
}

/** Setelah petugas dibuat: PIN ditampilkan sekali untuk dibagikan. */
function SharePin({ name, pin, onDone }: { name: string; pin: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = `Halo ${name}, akun petugas ronda jimpitan sudah dibuat.\nBuka ${location.origin}/petugas/ lalu pilih nama "${name}" dan masukkan PIN: ${pin}\nPIN bisa diganti sendiri di menu Akun.`;
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
  const [days, setDays] = useState(petugas.days);
  const param = { id: String(petugas.id) };
  const save = useMutation({
    mutationFn: () => call(api.admin.petugas[":id"].$patch({ param, json: { name: name.trim(), role, active, houseId, days } })),
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
          name={name}
          userId={petugas.id}
          houseId={houseId}
          onHouse={(id) => setHouseId(id)}
          days={days}
          onDays={setDays}
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
        <SharePin name={petugas.name} pin={pin} onDone={() => reset.reset()} />
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
          className="font-mono tracking-[0.3em]"
        />
        <Button type="submit" disabled={reset.isPending} variant="secondary" className="shrink-0">
          {reset.isPending ? "Menyimpan…" : "Atur ulang"}
        </Button>
      </form>
      <p className="mt-1 text-xs text-muted">Untuk petugas yang lupa PIN atau terkunci. Sesi lamanya di HP lain akan keluar.</p>
      {reset.isError && <Alert>{reset.error.message}</Alert>}
    </Collapsible>
  );
}

/**
 * Rumah petugas dan malam jaganya. Rumah yang dipilih memakai nama akun ini sebagai nama warganya,
 * dan jadwal rumah itu (kalau sudah ada) jadi jadwal petugas ini.
 */
function GuardFields({
  name,
  userId,
  houseId,
  onHouse,
  days,
  onDays,
}: {
  name: string;
  userId?: number;
  houseId: number | null;
  onHouse: (id: number | null, ownerName: string | null) => void;
  days: number[];
  onDays: (days: number[]) => void;
}) {
  const houses = useQuery(housesQuery).data?.houses ?? [];
  const users = useQuery(usersQuery).data?.users ?? [];
  const schedule = useQuery(scheduleQuery).data?.schedule ?? [];
  const toggle = (day: number) => onDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort());
  const houseDays = (id: number) => schedule.filter((s) => s.userId === null && s.houseId === id).map((s) => s.day);
  const house = houses.find((h) => h.id === houseId);
  const others = users.filter((u) => u.houseId === houseId && u.id !== userId);
  const scheduled = houseId ? [...new Set(houseDays(houseId))].sort() : [];

  function pick(id: number | null) {
    const picked = houses.find((h) => h.id === id);
    const hasAccount = users.some((u) => u.houseId === id && u.id !== userId);
    onHouse(id, picked && !hasAccount ? picked.ownerName : null);
    if (id) onDays([...new Set([...days, ...houseDays(id)])].sort());
  }

  return (
    <>
      <div>
        <Select
          label="Rumah"
          value={houseId ? String(houseId) : ""}
          onValueChange={(v) => pick(v ? Number(v) : null)}
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
              : house.ownerName && house.ownerName !== name.trim() && !users.some((u) => u.id === userId && u.houseId === house.id)
                ? `Nama KK rumah ini (${house.ownerName}) diganti nama akun ini.`
                : "Nama warga rumah ini ikut nama akun ini."}
            {scheduled.length > 0 && ` Jadwal rumah ini (${scheduled.map((d) => DAY_NAMES[d]).join(", ")}) jadi jadwal petugas ini.`}
          </span>
        )}
      </div>
      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Jaga malam</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {DAY_NAMES.map((label, day) => {
            const on = days.includes(day);
            return (
              <Button
                key={day}
                variant="plain"
                aria-pressed={on}
                title={dayLabel(day)}
                onClick={() => toggle(day)}
                className={cx(
                  "h-10 rounded-xl border text-sm font-semibold transition",
                  on ? "border-primary bg-primary text-primary-fg" : "border-line bg-card text-fg hover:border-primary/50",
                )}
              >
                {label}
              </Button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted">
          {days.length
            ? `Jaga ${days.map((d) => DAY_NAMES[d]).join(", ")}. Malam baru ditaruh di urutan terakhir; urutannya bisa diatur di Jadwal ronda.`
            : "Belum dijadwalkan."}
        </p>
      </fieldset>
    </>
  );
}

function RoleField({ role, onRole, disabled }: { role: Role; onRole: (role: Role) => void; disabled?: boolean }) {
  return <RadioCards legend="Peran" value={role} onValueChange={onRole} options={ROLES} disabled={disabled} />;
}
