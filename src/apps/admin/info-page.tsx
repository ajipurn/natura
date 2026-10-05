import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, ExternalLink, KeyRound, Pin, Plus, Share2, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { api, call } from "@/client/api";
import { checked, runForm, str, type FormState } from "@/client/form";
import { invalidate } from "@/client/query";
import { QueryState } from "@/components/query-state";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, PageHeader, SectionTitle, buttonClass, cx, inputClass } from "@/components/ui";
import { formatDateShort } from "@/lib/dates";
import { infoQuery, settingsQuery } from "./queries";

/** Isi halaman warga: kode akses, pengumuman, dan kontak pengurus. */
export function InfoPage() {
  return (
    <>
      <PageHeader title="Info warga" subtitle="Yang tampil di halaman warga" />
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="space-y-6">
          <WargaCode />
          <Contacts />
        </div>
        <Announcements />
      </div>
    </>
  );
}

/* ---------- Kode warga ---------- */

function WargaCode() {
  const query = useQuery(settingsQuery);
  const [copied, setCopied] = useState(false);
  const change = useMutation({
    mutationFn: (enabled: boolean) => call(api.admin.pengaturan["kode-warga"].$post({ json: { enabled } })),
    onSuccess: () => invalidate(["admin"]),
  });

  return (
    <section>
      <SectionTitle>Kode warga</SectionTitle>
      <QueryState query={query}>
        {({ wargaCode, origin }) => {
          const link = wargaCode ? `${origin}/?kode=${wargaCode}` : null;
          const message = link
            ? `Info ronda & jimpitan warga bisa dilihat di ${link}\nKode warga: ${wargaCode}`
            : "";
          return (
            <Card className="space-y-3">
              {link ? (
                <>
                  <p className="text-sm text-muted">
                    Bagikan link ini di grup warga. Yang tidak punya kodenya tidak bisa melihat nama dan data rumah.
                  </p>
                  <p className="flex items-center gap-3">
                    <KeyRound className="size-5 text-primary" />
                    <span className="font-mono text-2xl font-bold tracking-[0.2em]">{wargaCode}</span>
                  </p>
                  <p className="break-all rounded-xl bg-idle-soft px-3 py-2 font-mono text-sm">{link}</p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                      target="_blank"
                      rel="noopener"
                      className={buttonClass("primary", "sm")}
                    >
                      <Share2 className="size-4" /> Kirim ke WhatsApp
                    </a>
                    <button
                      type="button"
                      className={buttonClass("secondary", "sm")}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(link);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {
                          window.prompt("Salin link:", link);
                        }
                      }}
                    >
                      <Copy className="size-4" /> {copied ? "Tersalin" : "Salin link"}
                    </button>
                    <a href="/" target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
                      <ExternalLink className="size-4" /> Lihat halaman warga
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <button
                      type="button"
                      disabled={change.isPending}
                      className={buttonClass("secondary", "sm")}
                      onClick={() => {
                        if (window.confirm("Buat kode baru? Warga perlu memasukkan kode baru; kode lama tidak berlaku.")) {
                          change.mutate(true);
                        }
                      }}
                    >
                      Buat kode baru
                    </button>
                    <button
                      type="button"
                      disabled={change.isPending}
                      className={buttonClass("danger", "sm")}
                      onClick={() => {
                        if (window.confirm("Tutup halaman warga? Semua warga tidak bisa membukanya sampai kode baru dibuat.")) {
                          change.mutate(false);
                        }
                      }}
                    >
                      Tutup halaman warga
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Halaman warga masih tertutup. Buat kode untuk membukanya: warga memasukkan kode ini sekali di HP-nya.
                  </p>
                  <button
                    type="button"
                    disabled={change.isPending}
                    onClick={() => change.mutate(true)}
                    className={buttonClass("primary")}
                  >
                    <KeyRound className="size-5" /> Buat kode warga
                  </button>
                </>
              )}
              {change.isError && <Alert>{change.error.message}</Alert>}
            </Card>
          );
        }}
      </QueryState>
    </section>
  );
}

/* ---------- Pengumuman ---------- */

type Announcement = { id: number; title: string; body: string; pinned: boolean; createdAt: string };

function announcementJson(formData: FormData) {
  return { title: str(formData, "title"), body: str(formData, "body"), pinned: checked(formData, "pinned") };
}

function addAnnouncement(_prev: FormState, formData: FormData) {
  return runForm(() => call(api.admin.pengumuman.$post({ json: announcementJson(formData) })), {
    invalidate: [["admin", "info"], ["warga"]],
  });
}

function Announcements() {
  const query = useQuery(infoQuery);
  const [state, formAction] = useActionState(addAnnouncement, undefined);

  return (
    <section>
      <SectionTitle>Pengumuman</SectionTitle>
      <Card>
        <form action={formAction} className="space-y-3">
          <AnnouncementFields />
          {state?.error && <Alert>{state.error}</Alert>}
          {state?.success && <Alert tone="success">{state.success}</Alert>}
          <SubmitButton size="sm" pendingText="Menerbitkan…">
            <Plus className="size-4" /> Terbitkan
          </SubmitButton>
        </form>
      </Card>
      <QueryState query={query}>
        {({ announcements }) =>
          announcements.length === 0 ? (
            <p className="mt-3 text-center text-sm text-muted">Belum ada pengumuman.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {announcements.map((a) => (
                <AnnouncementItem key={a.id} announcement={a} />
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}

function AnnouncementFields({ value }: { value?: Announcement }) {
  return (
    <>
      <Field label="Judul">
        <input name="title" required maxLength={120} defaultValue={value?.title} placeholder="Kerja bakti Minggu" className={inputClass} />
      </Field>
      <Field label="Isi">
        <textarea
          name="body"
          rows={4}
          maxLength={4000}
          defaultValue={value?.body}
          placeholder="Minggu, 12 Oktober jam 07.00, kumpul di taman blok AB."
          className={cx(inputClass, "h-auto py-2")}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pinned" defaultChecked={value?.pinned} className="size-4 accent-[var(--primary)]" />
        Sematkan di atas
      </label>
    </>
  );
}

function AnnouncementItem({ announcement: a }: { announcement: Announcement }) {
  const param = { id: String(a.id) };
  const [state, formAction] = useActionState(
    (_prev: FormState, formData: FormData) =>
      runForm(() => call(api.admin.pengumuman[":id"].$patch({ param, json: announcementJson(formData) })), {
        invalidate: [["admin", "info"], ["warga"]],
      }),
    undefined,
  );
  const remove = useMutation({
    mutationFn: () => call(api.admin.pengumuman[":id"].$delete({ param })),
    onSuccess: () => invalidate(["admin", "info"], ["warga"]),
  });

  return (
    <li className="rounded-2xl border border-line bg-card">
      <details className="group p-4">
        <summary className="flex cursor-pointer list-none items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {a.pinned && <Pin className="mr-1 inline size-4 text-primary" aria-label="Disematkan" />}
              {a.title}
            </p>
            <p className="text-xs text-muted">{formatDateShort(new Date(a.createdAt).toISOString().slice(0, 10))}</p>
            {a.body && <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted group-open:hidden">{a.body}</p>}
          </div>
          <span className="text-sm font-semibold text-muted group-open:hidden">Ubah</span>
          <span className="hidden text-sm font-semibold text-muted group-open:inline">Tutup</span>
        </summary>
        <form action={formAction} className="mt-3 space-y-3">
          <AnnouncementFields value={a} />
          {state?.error && <Alert>{state.error}</Alert>}
          {state?.success && <Alert tone="success">{state.success}</Alert>}
          <div className="flex flex-wrap gap-2">
            <SubmitButton size="sm">Simpan</SubmitButton>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => window.confirm("Hapus pengumuman ini?") && remove.mutate()}
              className={buttonClass("danger", "sm")}
            >
              <Trash2 className="size-4" /> Hapus
            </button>
          </div>
          {remove.isError && <Alert>{remove.error.message}</Alert>}
        </form>
      </details>
    </li>
  );
}

/* ---------- Kontak ---------- */

type ContactRow = { key: number; name: string; role: string; phone: string };

function Contacts() {
  const query = useQuery(infoQuery);
  return (
    <section>
      <SectionTitle>Kontak pengurus</SectionTitle>
      <QueryState query={query}>
        {/* Editor memakai data saat halaman dibuka; setelah disimpan, isinya sudah sama dengan server. */}
        {({ contacts }) => <ContactsEditor initial={contacts} />}
      </QueryState>
    </section>
  );
}

let nextKey = 1;

function ContactsEditor({ initial }: { initial: { name: string; role: string; phone: string }[] }) {
  const [rows, setRows] = useState<ContactRow[]>(() => initial.map((c) => ({ key: nextKey++, ...c })));
  const save = useMutation({
    mutationFn: () =>
      call(api.admin.kontak.$put({ json: { contacts: rows.map(({ name, role, phone }) => ({ name, role, phone })) } })),
    onSuccess: () => invalidate(["admin", "info"], ["warga"]),
  });
  const update = (key: number, patch: Partial<ContactRow>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((list) => {
      const next = [...list];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });

  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {rows.length === 0 && <p className="text-sm text-muted">Belum ada kontak. Tambahkan ketua RT, koordinator ronda, dll.</p>}
        {rows.map((row, i) => (
          <fieldset key={row.key} className="rounded-xl border border-line p-3">
            <legend className="sr-only">Kontak {i + 1}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={row.name}
                onChange={(e) => update(row.key, { name: e.target.value })}
                required
                maxLength={60}
                placeholder="Nama"
                aria-label="Nama"
                className={inputClass}
              />
              <input
                value={row.role}
                onChange={(e) => update(row.key, { role: e.target.value })}
                maxLength={60}
                placeholder="Jabatan, mis. Ketua RT"
                aria-label="Jabatan"
                className={inputClass}
              />
              <input
                value={row.phone}
                onChange={(e) => update(row.key, { phone: e.target.value })}
                required
                inputMode="tel"
                maxLength={20}
                placeholder="0812-3456-7890"
                aria-label="Nomor HP"
                className={cx(inputClass, "sm:col-span-2")}
              />
            </div>
            <div className="mt-2 flex justify-end gap-1">
              <IconButton label="Naikkan" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton label="Turunkan" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton label="Hapus kontak" onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}>
                <Trash2 className="size-4 text-empty" />
              </IconButton>
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRows((list) => [...list, { key: nextKey++, name: "", role: "", phone: "" }])}
            className={buttonClass("secondary", "sm")}
          >
            <Plus className="size-4" /> Tambah kontak
          </button>
          <button type="submit" disabled={save.isPending} className={buttonClass("primary", "sm")}>
            {save.isPending ? "Menyimpan…" : "Simpan kontak"}
          </button>
        </div>
        {save.isError && <Alert>{save.error.message}</Alert>}
        {save.isSuccess && <Alert tone="success">{save.data.success}</Alert>}
      </form>
    </Card>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-lg border border-line disabled:opacity-40"
    >
      {children}
    </button>
  );
}
