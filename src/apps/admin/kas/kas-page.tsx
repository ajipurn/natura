import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { RadioCards, type RadioCardOption } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { RupiahInput } from "@/components/rupiah-input";
import { Alert, Button, Card, Field, Input, PageHeader, cx } from "@/components/ui";
import { formatDateShort, formatMonth, isMonth, localDate, rondaDate, shiftMonth } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { CashMonth } from "@/server/kas";
import { CASH_REFRESH, cashQuery, settingsQuery } from "../queries";

type Night = CashMonth["nights"][number];
type Entry = CashMonth["entries"][number];
type Direction = Entry["direction"];

/** "2026-10-05" → "5 Okt" */
const dayMonth = (isoDate: string) => formatDateShort(isoDate).split(", ")[1];

/**
 * Kas jimpitan: uang tiap malam disetor petugas jaga ke bendahara selesai keliling, lalu dicatat di
 * sini dan dibandingkan dengan jimpitan yang tercatat malam itu. Ditambah pemasukan lain (mis. saldo
 * awal) dan pengeluaran, jadi saldonya terlihat.
 */
export function KasPage() {
  const [params] = useSearchParams();
  const tonight = rondaDate(new Date());
  const thisMonth = tonight.slice(0, 7);
  const bulan = params.get("bulan") ?? "";
  const month = isMonth(bulan) && bulan <= thisMonth ? bulan : thisMonth;
  const query = useQuery({ ...cashQuery(month), placeholderData: (previous) => previous });
  const cashPublic = useQuery(settingsQuery).data?.cashPublic;
  // Dialog pengeluaran/pemasukan lain (tanpa `entry` = tambah baru). Isinya tetap selama dialog menutup.
  const [entryTarget, setEntryTarget] = useState<{ entry?: Entry }>({});
  const [entryOpen, setEntryOpen] = useState(false);
  const openEntry = (entry?: Entry) => {
    setEntryTarget({ entry });
    setEntryOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Kas"
        subtitle="Kelola setoran jimpitan, pemasukan lain, dan pengeluaran kas."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} thisMonth={thisMonth} />
        <Button size="sm" onClick={() => openEntry()}>
          <Plus className="size-4" aria-hidden /> Catat transaksi
        </Button>
      </div>

      <QueryState query={query}>
        {(data) => (
          <div className={cx("space-y-6", query.isPlaceholderData && "opacity-60")}>
            <Summary data={data} />
            {data.undeposited.length > 0 && <Undeposited dates={data.undeposited} month={month} />}
            <Deposits nights={data.nights} tonight={tonight} />
            <Entries entries={data.entries} onOpen={openEntry} onAdd={() => openEntry()} />
            {cashPublic !== undefined && (
              <p className="text-xs text-muted">
                {cashPublic
                  ? "Saldo, jumlah bulan ini, dan rincian pemasukan/pengeluaran tampil di halaman warga (tanpa nama pencatat)."
                  : "Kas tidak ditampilkan di halaman warga."}{" "}
                <Link to="/admin/pengaturan" className="font-semibold text-primary">
                  Ubah di Pengaturan
                </Link>
              </p>
            )}
          </div>
        )}
      </QueryState>

      <EntryDialog entry={entryTarget.entry} open={entryOpen} onClose={() => setEntryOpen(false)} />
    </>
  );
}

function MonthNav({ month, thisMonth }: { month: string; thisMonth: string }) {
  const link = (m: string) => (m === thisMonth ? "/admin/kas" : `/admin/kas?bulan=${m}`);
  return (
    <nav aria-label="Pilih bulan" className="inline-flex items-center rounded-xl border border-line bg-card p-0.5">
      <Link
        to={link(shiftMonth(month, -1))}
        className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-idle-soft"
        aria-label={`Bulan sebelumnya (${formatMonth(shiftMonth(month, -1))})`}
      >
        <ChevronLeft className="size-5" />
      </Link>
      <span className="min-w-36 px-2 text-center font-semibold">{formatMonth(month)}</span>
      {month < thisMonth ? (
        <Link
          to={link(shiftMonth(month, 1))}
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-idle-soft"
          aria-label={`Bulan berikutnya (${formatMonth(shiftMonth(month, 1))})`}
        >
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span aria-hidden className="flex size-9 items-center justify-center text-muted/40">
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}

/** Saldo sekarang, dan alur kas bulan itu: saldo awal + setoran + pemasukan lain − pengeluaran. */
function Summary({ data }: { data: CashMonth }) {
  const rows: [string, number, string?][] = [
    ["Saldo awal bulan", data.opening],
    ["+ Setoran jimpitan", data.deposits, "text-filled"],
    ["+ Pemasukan lain", data.income, "text-filled"],
    ["− Pengeluaran", data.expenses, "text-empty"],
  ];
  return (
    <Card className="grid overflow-hidden p-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="bg-primary/5 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Wallet className="size-4 text-primary" aria-hidden /> Saldo kas saat ini
        </p>
        <p className={cx("mt-2 break-words text-3xl font-bold tracking-tight tabular-nums", data.balance < 0 && "text-empty")}>
          {formatRupiah(data.balance)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">Dari seluruh setoran dan transaksi yang tercatat.</p>
      </div>
      <div className="min-w-0 p-5 sm:p-6">
        <h2 className="mb-3 text-sm font-semibold">Ringkasan {formatMonth(data.month)}</h2>
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value, tone]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 text-muted">{label}</dt>
              <dd className={cx("shrink-0 font-medium tabular-nums", value > 0 && tone)}>{formatRupiah(value)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <dt className="font-semibold">Saldo akhir bulan</dt>
            <dd className="shrink-0 font-bold tabular-nums">{formatRupiah(data.closing)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/** Malam yang uangnya belum dicatat setorannya (bulan mana pun; bulan lain bisa diketuk). */
function Undeposited({ dates, month }: { dates: string[]; month: string }) {
  const shown = dates.slice(-6);
  const last = shown.length - 1;
  return (
    <p className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong>{dates.length} malam</strong> belum dicatat setorannya:{" "}
        {dates.length > shown.length && "…, "}
        {shown.map((d, i) => (
          <span key={d}>
            {i > 0 && (i === last ? " dan " : ", ")}
            {d.startsWith(month) ? (
              dayMonth(d)
            ) : (
              <Link to={`/admin/kas?bulan=${d.slice(0, 7)}`} className="underline">
                {dayMonth(d)}
              </Link>
            )}
          </span>
        ))}
        .
      </span>
    </p>
  );
}

function Deposits({ nights, tonight }: { nights: Night[]; tonight: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section aria-labelledby="setoran">
      <h2 id="setoran" className="flex flex-wrap items-center gap-2 font-semibold">
        Setoran jimpitan
        {nights.length > 0 && <span className="rounded-full bg-idle-soft px-2 py-0.5 text-xs font-medium text-muted">{nights.length} malam</span>}
      </h2>
      <p className="mb-3 mt-1 text-sm text-muted">Setoran yang diterima bendahara dibandingkan dengan catatan petugas.</p>
      {nights.length === 0 ? (
        <Card className="py-6 text-center text-sm text-muted">Belum ada jimpitan tercatat bulan ini.</Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {nights.map((n) => (
            <NightRow
              key={n.date}
              night={n}
              isTonight={n.date === tonight}
              editing={editing === n.date}
              onEdit={(on) => setEditing(on ? n.date : null)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NightRow({
  night,
  isTonight,
  editing,
  onEdit,
}: {
  night: Night;
  isTonight: boolean;
  editing: boolean;
  onEdit: (on: boolean) => void;
}) {
  const { date, recorded, filled, deposit } = night;
  return (
    <li className={cx("px-4 py-4", editing && "bg-idle-soft/50")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-semibold">
            <Link to={`/admin/riwayat/${date}`} className="hover:underline">
              {formatDateShort(date)}
            </Link>
            {isTonight && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Malam ini</span>}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Tercatat <span className="font-semibold text-fg tabular-nums">{formatRupiah(recorded)}</span>
            {filled > 0 && ` · ${filled} rumah`}
          </p>
          {deposit && (deposit.note || deposit.recordedByName) && (
            <p className="mt-1 break-words text-xs text-muted">
              {[deposit.note, deposit.recordedByName && `dicatat ${deposit.recordedByName}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {deposit ? (
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="sm:text-right">
              <p className="text-sm font-semibold tabular-nums">Disetor {formatRupiah(deposit.amount)}</p>
              <Difference value={deposit.amount - recorded} />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Ubah setoran ${formatDateShort(date)}`}
              title="Ubah setoran"
              aria-expanded={editing}
              onClick={() => onEdit(!editing)}
              className={cx(editing && "bg-idle-soft text-fg")}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        ) : (
          !editing && (
            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
              {!isTonight && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">Belum dicatat</span>}
              <Button variant="secondary" size="sm" aria-expanded={editing} onClick={() => onEdit(true)}>
                Catat setoran
              </Button>
            </div>
          )
        )}
      </div>
      {editing && <DepositForm night={night} onDone={() => onEdit(false)} />}
    </li>
  );
}

/** Selisih setoran dengan catatan: sesuai, kurang, atau lebih. */
function Difference({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs font-semibold text-filled">Sesuai catatan</span>;
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", value < 0 ? "bg-empty-soft text-empty" : "bg-warn-soft text-warn")}>
      {value < 0 ? "Kurang" : "Lebih"} {formatRupiah(Math.abs(value))}
    </span>
  );
}

function DepositForm({ night, onDone }: { night: Night; onDone: () => void }) {
  const { date, recorded, deposit } = night;
  const [amount, setAmount] = useState<number | null>(deposit?.amount ?? recorded);
  const [note, setNote] = useState(deposit?.note ?? "");
  const param = { date };
  const save = useMutation({
    mutationFn: () => call(api.admin.kas.setoran[":date"].$put({ param, json: { amount: amount ?? 0, note } })),
    onSuccess: async () => {
      await invalidate(...CASH_REFRESH);
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: () => call(api.admin.kas.setoran[":date"].$delete({ param })),
    onSuccess: async () => {
      await invalidate(...CASH_REFRESH);
      onDone();
    },
  });
  const error = save.error ?? remove.error;

  return (
    <form
      className="mt-3 max-w-xl space-y-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Uang yang diterima" hint={amount !== null && amount !== recorded ? <Difference value={amount - recorded} /> : "Sama dengan catatan malam itu."}>
          <RupiahInput value={amount} onValueChange={setAmount} required autoFocus />
        </Field>
        <Field label="Catatan (opsional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Mis. dari Pak Budi, Rp 500 menyusul" />
        </Field>
      </div>
      {error && <Alert>{error.message}</Alert>}
      <div className="flex items-center gap-2">
        {deposit && (
          <Button
            variant="ghost"
            size="sm"
            className="text-empty hover:text-empty"
            disabled={remove.isPending}
            onClick={() => window.confirm(`Hapus setoran ${formatDateShort(date)}?`) && remove.mutate()}
          >
            Hapus
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending || amount === null}>
          {save.isPending ? "Menyimpan…" : "Simpan setoran"}
        </Button>
      </div>
    </form>
  );
}

function Entries({ entries, onOpen, onAdd }: { entries: Entry[]; onOpen: (entry: Entry) => void; onAdd: () => void }) {
  return (
    <section aria-labelledby="transaksi">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="transaksi" className="font-semibold">
            Transaksi kas
          </h2>
          <p className="mt-1 text-sm text-muted">Pengeluaran dan pemasukan lain di luar setoran jimpitan.</p>
        </div>
        <Button variant="secondary" size="sm" className="self-start sm:shrink-0" onClick={onAdd}>
          <Plus className="size-4" aria-hidden /> Catat transaksi
        </Button>
      </div>
      {entries.length === 0 ? (
        <Card className="flex items-start gap-3 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-idle-soft/60 text-muted">
            <ReceiptText className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium">Belum ada transaksi bulan ini</p>
            <p className="mt-1 text-sm text-muted">Pengeluaran dan pemasukan lain akan tampil di sini setelah dicatat.</p>
          </div>
        </Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {entries.map((e) => {
            const out = e.direction === "out";
            return (
              <li key={e.id}>
                <Button
                  variant="plain"
                  onClick={() => onOpen(e)}
                  className="grid w-full grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-4 text-left hover:bg-idle-soft/50 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span
                    className={cx(
                      "row-span-2 flex size-8 items-center justify-center rounded-full sm:row-span-1",
                      out ? "bg-empty-soft text-empty" : "bg-filled-soft text-filled",
                    )}
                  >
                    {out ? <ArrowUpRight className="size-4" aria-label="Pengeluaran" /> : <ArrowDownLeft className="size-4" aria-label="Pemasukan" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium">{e.description}</span>
                    <span className="mt-0.5 block break-words text-xs text-muted">
                      {formatDateShort(e.date)}
                      {e.recordedByName && ` · dicatat ${e.recordedByName}`}
                    </span>
                  </span>
                  <span className={cx("col-start-2 font-semibold tabular-nums sm:col-start-auto sm:text-right", out ? "text-empty" : "text-filled")}>
                    {out ? "−" : "+"}
                    {formatRupiah(e.amount)}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const DIRECTIONS: RadioCardOption<Direction>[] = [
  { value: "out", label: "Pengeluaran", hint: "Uang keluar dari kas" },
  { value: "in", label: "Pemasukan lain", hint: "Saldo awal atau sumbangan" },
];

/** Tambah (tanpa `entry`) atau ubah satu pengeluaran/pemasukan lain. */
function EntryDialog({ entry, open, onClose }: { entry?: Entry; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={entry ? "Ubah transaksi kas" : "Catat transaksi"}
      description="Pengeluaran atau pemasukan lain di luar setoran jimpitan."
    >
      <EntryForm key={entry?.id ?? "baru"} entry={entry} onDone={onClose} />
    </Dialog>
  );
}

function EntryForm({ entry, onDone }: { entry?: Entry; onDone: () => void }) {
  const today = localDate(new Date());
  const [direction, setDirection] = useState<Direction>(entry?.direction ?? "out");
  const [date, setDate] = useState(entry?.date ?? today);
  const [amount, setAmount] = useState<number | null>(entry?.amount ?? null);
  const [description, setDescription] = useState(entry?.description ?? "");
  const done = async () => {
    await invalidate(...CASH_REFRESH);
    onDone();
  };
  const save = useMutation({
    mutationFn: () => {
      const json = { date, direction, amount: amount ?? 0, description };
      return call(
        entry
          ? api.admin.kas.transaksi[":id"].$patch({ param: { id: String(entry.id) }, json })
          : api.admin.kas.transaksi.$post({ json }),
      );
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => call(api.admin.kas.transaksi[":id"].$delete({ param: { id: String(entry!.id) } })),
    onSuccess: done,
  });
  const error = save.error ?? remove.error;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <RadioCards legend="Jenis transaksi" value={direction} onValueChange={setDirection} options={DIRECTIONS} className="grid-cols-1 min-[360px]:grid-cols-2" />
      <Field label="Keterangan">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          maxLength={200}
          placeholder={direction === "out" ? "Mis. lampu pos ronda" : "Mis. saldo awal kas"}
          data-autofocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nominal">
          <RupiahInput value={amount} onValueChange={setAmount} required />
        </Field>
        <DatePicker label="Tanggal transaksi" value={date} onValueChange={setDate} today={today} />
      </div>
      {error && <Alert>{error.message}</Alert>}
      <div className="flex items-center gap-2">
        {entry && (
          <Button
            variant="ghost"
            className="text-empty hover:text-empty"
            disabled={remove.isPending}
            onClick={() => window.confirm(`Hapus "${entry.description}"?`) && remove.mutate()}
          >
            Hapus
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending || !amount}>
          {save.isPending ? "Menyimpan…" : "Simpan transaksi"}
        </Button>
      </div>
    </form>
  );
}
