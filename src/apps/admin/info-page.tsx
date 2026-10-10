import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Lock,
  Megaphone,
  MessageCircle,
  Pencil,
  Phone,
  Pin,
  Plus,
  Share2,
  Trash2,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, call } from "@/client/api";
import { wargaPath } from "@/lib/app-paths";
import { checked, str } from "@/client/form";
import { invalidate } from "@/client/query";
import { CheckboxField } from "@/components/choice";
import { Dialog } from "@/components/dialog";
import { QrSvg } from "@/components/qr-svg";
import { QueryState } from "@/components/query-state";
import { Alert, Button, Card, Field, Input, PageHeader, Textarea, buttonClass } from "@/components/ui";
import { formatDateShort, localDate } from "@/lib/dates";
import { phoneDigits, whatsappNumber } from "@/lib/format";
import { infoQuery, settingsQuery } from "./queries";

/** Isi menu Info warga: link app, pengumuman, dan kontak pengurus. */
export function InfoPage() {
  return (
    <>
      <PageHeader
        title="Info warga"
        subtitle="Pengumuman, kontak pengurus, dan akses Beranda app"
        action={
          <a href={wargaPath()} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
            <ExternalLink className="size-4" /> <span className="max-sm:hidden">Lihat Beranda</span>
            <span className="sm:hidden">Lihat</span>
          </a>
        }
      />
      <div className="space-y-6">
        <WargaAccess />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
          <Announcements />
          <Contacts />
        </div>
      </div>
    </>
  );
}

/** Pesan singkat yang hilang sendiri, mis. "Kontak disimpan." */
function useFlash(ms = 3000) {
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), ms);
    return () => clearTimeout(timer);
  }, [flash, ms]);
  return [flash, setFlash] as const;
}

/** Kepala kartu: judul di kiri, tombol di kanan. */
function CardHeader({ id, title, count, action }: { id: string; title: string; count?: number; action?: ReactNode }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <h2 id={id} className="font-semibold">
        {title}
        {count !== undefined && count > 0 && <span className="ml-1.5 font-normal text-muted">{count}</span>}
      </h2>
      {action}
    </header>
  );
}

function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  danger = false,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant={danger ? "danger" : "primary"} disabled={pending} onClick={onConfirm} data-autofocus>
            {pending ? "Memproses…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-muted">{children}</div>
    </Dialog>
  );
}

/* ---------- Akses menu Info warga ---------- */

function WargaAccess() {
  const query = useQuery(settingsQuery);
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="akses-warga">
      <QueryState query={query}>
        {({ origin, communityName }) => {
          const base = new URL(origin);
          const link = new URL(wargaPath("", base.hostname), base.origin).href;
          const isLocal = /\/\/(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(origin);
          const message = `Info warga ${communityName}: pengumuman, jadwal ronda, dan rekap jimpitan.\nBuka: ${link}\nMasuk dengan nama dan PIN, lalu buka menu Beranda.`;
          return (
            <Card className="overflow-hidden p-0">
              <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <h2 id="akses-warga" className="flex flex-wrap items-center gap-2 font-semibold">
                      Akses Beranda
                      <span className="inline-flex items-center gap-1 rounded-full bg-idle-soft px-2 py-0.5 text-xs font-medium text-muted">
                        <Lock className="size-3" aria-hidden /> Perlu login
                      </span>
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Informasi warga tersedia di menu Beranda. Warga masuk dengan nama dan PIN akun yang sudah dibuat pengurus.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl border border-line bg-idle-soft/50 py-1 pl-3 pr-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm" title={link}>{link}</span>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch { window.prompt("Salin link:", link); }
                    }}>
                      <Copy className="size-4" /> {copied ? "Tersalin" : "Salin"}
                    </Button>
                  </div>
                  {isLocal && (
                    <p className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      Ini alamat lokal. Bagikan link dari alamat aplikasi yang sudah online.
                    </p>
                  )}
                  <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener" className={buttonClass("primary", "sm")}>
                    <Share2 className="size-4" /> Kirim ke grup WhatsApp
                  </a>
                </div>
                <figure className="flex shrink-0 flex-col items-center gap-2 self-center sm:w-40">
                  <div className="rounded-xl border border-line bg-white p-2.5"><QrSvg text={link} className="w-32 sm:w-34" /></div>
                  <figcaption className="text-center text-xs text-muted">Scan untuk membuka app, lalu masuk dengan nama dan PIN</figcaption>
                </figure>
              </div>
            </Card>
          );
        }}
      </QueryState>
    </section>
  );
}

/* ---------- Pengumuman ---------- */

type Announcement = { id: number; title: string; body: string; pinned: boolean; createdAt: string };
type AnnouncementInput = { title: string; body: string; pinned: boolean };

function announcementJson(form: HTMLFormElement): AnnouncementInput {
  const formData = new FormData(form);
  return { title: str(formData, "title"), body: str(formData, "body"), pinned: checked(formData, "pinned") };
}

const REFRESH_INFO = [["admin", "info"], ["warga"]];

function Announcements() {
  const query = useQuery(infoQuery);
  const [writing, setWriting] = useState(false);
  const [flash, setFlash] = useFlash();
  const create = useMutation({
    mutationFn: (json: AnnouncementInput) => call(api.admin.pengumuman.$post({ json })),
    onSuccess: async () => {
      await invalidate(...REFRESH_INFO);
      setWriting(false);
      setFlash("Pengumuman diterbitkan.");
    },
  });

  return (
    <section aria-labelledby="pengumuman">
      <Card className="p-0">
        <QueryState query={query}>
          {({ announcements }) => (
            <>
              <CardHeader
                id="pengumuman"
                title="Pengumuman"
                count={announcements.length}
                action={
                  !writing && (
                    <Button size="sm" onClick={() => setWriting(true)}>
                      <Plus className="size-4" /> Tulis
                    </Button>
                  )
                }
              />
              {writing && (
                <div className="border-b border-line bg-idle-soft/40 p-4">
                  <AnnouncementForm
                    submitLabel="Terbitkan"
                    pending={create.isPending}
                    error={create.isError ? create.error.message : null}
                    onSubmit={(json) => create.mutate(json)}
                    onCancel={() => {
                      setWriting(false);
                      create.reset();
                    }}
                  />
                </div>
              )}
              {flash && (
                <div className="px-4 pt-3">
                  <Alert tone="success">{flash}</Alert>
                </div>
              )}
              {announcements.length === 0 ? (
                !writing && (
                  <div className="px-4 py-10 text-center">
                    <Megaphone className="mx-auto size-9 text-muted" />
                    <p className="mt-2 font-semibold">Belum ada pengumuman</p>
                    <p className="mt-1 text-sm text-muted">Pengumuman tampil paling atas di Beranda, mis. jadwal kerja bakti.</p>
                  </div>
                )
              ) : (
                <ul className="divide-y divide-line">
                  {announcements.map((a) => (
                    <AnnouncementItem key={a.id} announcement={a} onSaved={setFlash} />
                  ))}
                </ul>
              )}
            </>
          )}
        </QueryState>
      </Card>
    </section>
  );
}

function AnnouncementForm({
  value,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  extra,
}: {
  value?: Announcement;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (json: AnnouncementInput) => void;
  onCancel: () => void;
  /** Tombol tambahan di kiri, mis. Hapus. */
  extra?: ReactNode;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSubmit(announcementJson(e.currentTarget));
      }}
    >
      <Field label="Judul">
        <Input name="title" required maxLength={120} defaultValue={value?.title} placeholder="Kerja bakti Minggu" data-autofocus autoFocus />
      </Field>
      <Field label="Isi">
        <Textarea
          name="body"
          rows={4}
          maxLength={4000}
          defaultValue={value?.body}
          placeholder="Minggu, 12 Oktober jam 07.00, kumpul di taman blok AB."
        />
      </Field>
      <CheckboxField label="Sematkan di paling atas" name="pinned" defaultChecked={value?.pinned} />
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        {/* Batal dan Simpan selalu berdampingan di kanan, juga saat barisnya terlipat di HP. */}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Menyimpan…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function AnnouncementItem({ announcement: a, onSaved }: { announcement: Announcement; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const param = { id: String(a.id) };
  const save = useMutation({
    mutationFn: (json: AnnouncementInput) => call(api.admin.pengumuman[":id"].$patch({ param, json })),
    onSuccess: async () => {
      await invalidate(...REFRESH_INFO);
      setEditing(false);
      onSaved("Pengumuman disimpan.");
    },
  });
  const remove = useMutation({
    mutationFn: () => call(api.admin.pengumuman[":id"].$delete({ param })),
    onSuccess: async () => {
      setDeleting(false);
      await invalidate(...REFRESH_INFO);
      onSaved("Pengumuman dihapus.");
    },
  });

  if (editing) {
    return (
      <li className="bg-idle-soft/40 p-4">
        <AnnouncementForm
          value={a}
          submitLabel="Simpan"
          pending={save.isPending}
          error={save.isError ? save.error.message : null}
          onSubmit={(json) => save.mutate(json)}
          onCancel={() => {
            setEditing(false);
            save.reset();
          }}
          extra={
            <Button variant="ghost" size="sm" className="text-empty hover:text-empty" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" /> Hapus
            </Button>
          }
        />
        <ConfirmDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          title="Hapus pengumuman?"
          confirmLabel="Hapus"
          danger
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
        >
          <p>"{a.title}" tidak tampil lagi di Beranda.</p>
          {remove.isError && <Alert>{remove.error.message}</Alert>}
        </ConfirmDialog>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{a.title}</span>
          {a.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Pin className="size-3" aria-hidden /> Disematkan
            </span>
          )}
        </p>
        <p className="text-xs text-muted">{formatDateShort(localDate(new Date(a.createdAt)))}</p>
        {a.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{a.body}</p>}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${a.title}`} title="Ubah" onClick={() => setEditing(true)}>
        <Pencil className="size-4" />
      </Button>
    </li>
  );
}

/* ---------- Kontak ---------- */

type Contact = { name: string; role: string; phone: string };
type ContactRow = Contact & { key: number };

let nextKey = 1;

function Contacts() {
  const query = useQuery(infoQuery);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useFlash();

  return (
    <section aria-labelledby="kontak-pengurus">
      <Card className="p-0">
        <QueryState query={query}>
          {({ contacts }) => (
            <>
              <CardHeader
                id="kontak-pengurus"
                title="Kontak pengurus"
                count={contacts.length}
                action={
                  !editing &&
                  contacts.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="size-4" /> Ubah
                    </Button>
                  )
                }
              />
              {editing ? (
                <ContactsEditor
                  initial={contacts}
                  onDone={(saved) => {
                    setEditing(false);
                    if (saved) setFlash("Kontak disimpan.");
                  }}
                />
              ) : (
                <>
                  {flash && (
                    <div className="px-4 pt-3">
                      <Alert tone="success">{flash}</Alert>
                    </div>
                  )}
                  {contacts.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <UsersRound className="mx-auto size-9 text-muted" />
                      <p className="mt-2 font-semibold">Belum ada kontak</p>
                      <p className="mt-1 text-sm text-muted">Warga bisa langsung menelepon atau WhatsApp pengurus dari Beranda.</p>
                      <Button size="sm" className="mt-4" onClick={() => setEditing(true)}>
                        <Plus className="size-4" /> Tambah kontak
                      </Button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-line">
                      {contacts.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{c.name}</p>
                            {/* Nomor tidak dipotong: kalau tidak muat, pindah ke baris berikutnya. */}
                            <p className="flex flex-wrap gap-x-3 text-sm text-muted">
                              {c.role && <span className="min-w-0 truncate">{c.role}</span>}
                              <span className="whitespace-nowrap tabular-nums">{c.phone}</span>
                            </p>
                          </div>
                          <a
                            href={`https://wa.me/${whatsappNumber(c.phone)}`}
                            target="_blank"
                            rel="noopener"
                            aria-label={`WhatsApp ${c.name}`}
                            title="WhatsApp"
                            className={buttonClass("ghost", "icon-sm")}
                          >
                            <MessageCircle className="size-4" />
                          </a>
                          <a href={`tel:${phoneDigits(c.phone)}`} aria-label={`Telepon ${c.name}`} title="Telepon" className={buttonClass("ghost", "icon-sm")}>
                            <Phone className="size-4" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </QueryState>
      </Card>
    </section>
  );
}

const sameContacts = (a: Contact[], b: Contact[]) =>
  a.length === b.length && a.every((c, i) => c.name === b[i].name && c.role === b[i].role && c.phone === b[i].phone);

function ContactsEditor({ initial, onDone }: { initial: Contact[]; onDone: (saved: boolean) => void }) {
  // Kontak kosong: langsung satu baris isian.
  const [rows, setRows] = useState<ContactRow[]>(() =>
    (initial.length ? initial : [{ name: "", role: "", phone: "" }]).map(({ name, role, phone }) => ({ key: nextKey++, name, role, phone })),
  );
  const contacts = rows.map(({ name, role, phone }) => ({ name, role, phone }));
  const dirty = !sameContacts(contacts, initial);
  const save = useMutation({
    mutationFn: () => call(api.admin.kontak.$put({ json: { contacts } })),
    onSuccess: async () => {
      await invalidate(...REFRESH_INFO);
      onDone(true);
    },
  });
  const update = (key: number, patch: Partial<ContactRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((list) => {
      const next = [...list];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <ul className="divide-y divide-line">
        {rows.map((row, i) => (
          <li key={row.key} className="space-y-2 px-4 py-3">
            <fieldset className="contents">
              <legend className="sr-only">Kontak {i + 1}</legend>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={row.name}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                  required
                  maxLength={60}
                  placeholder="Nama"
                  aria-label={`Nama kontak ${i + 1}`}
                  className="h-10"
                  autoFocus={!row.name && i === rows.length - 1}
                />
                <Input
                  value={row.role}
                  onChange={(e) => update(row.key, { role: e.target.value })}
                  maxLength={60}
                  placeholder="Jabatan, mis. Ketua RT"
                  aria-label={`Jabatan kontak ${i + 1}`}
                  className="h-10"
                />
              </div>
              <div className="flex items-center gap-1">
                <Input
                  value={row.phone}
                  onChange={(e) => update(row.key, { phone: e.target.value })}
                  required
                  inputMode="tel"
                  maxLength={20}
                  placeholder="0812-3456-7890"
                  aria-label={`Nomor HP kontak ${i + 1}`}
                  className="mr-1 h-10 min-w-0 flex-1 tabular-nums"
                />
                <Button variant="ghost" size="icon-sm" aria-label="Naikkan" title="Naikkan" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Turunkan"
                  title="Turunkan"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hapus kontak ${row.name || i + 1}`}
                  title="Hapus"
                  className="text-empty hover:text-empty"
                  onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="space-y-3 border-t border-line px-4 py-3">
        {save.isError && <Alert>{save.error.message}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length >= 20}
            onClick={() => setRows((list) => [...list, { key: nextKey++, name: "", role: "", phone: "" }])}
          >
            <Plus className="size-4" /> Tambah kontak
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onDone(false)}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
              {save.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
