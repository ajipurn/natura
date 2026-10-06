import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Pencil, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { RadioCards, type RadioCardOption } from "@/components/choice";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { RupiahInput } from "@/components/rupiah-input";
import { Alert, Button, Card, Field, Input, PageHeader, cx } from "@/components/ui";
import { formatDateLong, formatDateShort, formatMonth, isMonth, localDate, rondaDate, shiftMonth } from "@/lib/dates";
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
        subtitle="Setoran jimpitan ke bendahara, pemasukan lain, dan pengeluaran"
        action={
          <Button size="sm" className="shrink-0" onClick={() => openEntry()}>
            <Plus className="size-4" /> Pengeluaran
          </Button>
        }
      />
      <MonthNav month={month} thisMonth={thisMonth} />

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
    <nav aria-label="Pilih bulan" className="mb-4 inline-flex items-center rounded-xl border border-line bg-card p-0.5">
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
  const monthName = formatMonth(data.month).split(" ")[0];
  const rows: [string, number, string?][] = [
    [`Saldo awal ${monthName}`, data.opening],
    ["+ Setoran jimpitan", data.deposits, "text-filled"],
    ["+ Pemasukan lain", data.income, "text-filled"],
    ["− Pengeluaran", data.expenses, "text-empty"],
  ];
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:gap-8">
      <div className="shrink-0 sm:w-56">
        <p className="text-xs text-muted">Saldo kas sekarang</p>
        <p className="text-3xl font-bold tabular-nums">{formatRupiah(data.balance)}</p>
      </div>
      <dl className="min-w-0 flex-1 text-sm sm:max-w-sm">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{label}</dt>
            <dd className={cx("font-semibold tabular-nums", value > 0 && tone)}>{formatRupiah(value)}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-3 border-t border-line pt-1.5">
          <dt className="font-semibold">Saldo akhir {monthName}</dt>
          <dd className="font-bold tabular-nums">{formatRupiah(data.closing)}</dd>
        </div>
      </dl>
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
      <h2 id="setoran" className="font-semibold">
        Setoran per malam
      </h2>
      <p className="mb-2 text-sm text-muted">Uang yang diterima bendahara dari petugas jaga, dibanding jimpitan yang tercatat malam itu.</p>
      {nights.length === 0 ? (
        <Card className="text-center text-sm text-muted">Belum ada jimpitan tercatat bulan ini.</Card>
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
    <li className={cx("px-4 py-3", editing && "bg-idle-soft/50")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-semibold">
            <Link to={`/admin/riwayat/${date}`} className="hover:underline">
              {formatDateShort(date)}
            </Link>
            {isTonight && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Malam ini</span>}
          </p>
          <p className="text-sm text-muted">
            Tercatat <span className="font-semibold text-fg tabular-nums">{formatRupiah(recorded)}</span>
            {filled > 0 && ` · ${filled} rumah ada isinya`}
          </p>
          {deposit && (deposit.note || deposit.recordedByName) && (
            <p className="text-xs text-muted">
              {[deposit.note, deposit.recordedByName && `dicatat ${deposit.recordedByName}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {deposit ? (
          <div className="flex items-center gap-2">
            <div className="text-right">
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
            <div className="flex items-center gap-2">
              {!isTonight && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">Belum disetor</span>}
              <Button variant="secondary" size="sm" onClick={() => onEdit(true)}>
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
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

function Entries({ entries, onOpen, onAdd }: { entries: Entry[]; onOpen: (entry: Entry) => void; onAdd: () => void }) {
  return (
    <section aria-labelledby="transaksi">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 id="transaksi" className="font-semibold">
            Pengeluaran & pemasukan lain
          </h2>
          <p className="text-sm text-muted">Mis. lampu pos ronda, konsumsi, atau saldo awal kas.</p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onAdd}>
          <Plus className="size-4" /> Tambah
        </Button>
      </div>
      {entries.length === 0 ? (
        <Card className="text-center text-sm text-muted">Belum ada pengeluaran atau pemasukan lain bulan ini.</Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {entries.map((e) => {
            const out = e.direction === "out";
            return (
              <li key={e.id}>
                <Button
                  variant="plain"
                  onClick={() => onOpen(e)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-idle-soft/50"
                >
                  <span
                    className={cx(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      out ? "bg-empty-soft text-empty" : "bg-filled-soft text-filled",
                    )}
                  >
                    {out ? <ArrowUpRight className="size-4" aria-label="Pengeluaran" /> : <ArrowDownLeft className="size-4" aria-label="Pemasukan" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.description}</span>
                    <span className="block text-xs text-muted">
                      {formatDateShort(e.date)}
                      {e.recordedByName && ` · dicatat ${e.recordedByName}`}
                    </span>
                  </span>
                  <span className={cx("shrink-0 font-semibold tabular-nums", out ? "text-empty" : "text-filled")}>
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
  { value: "out", label: "Pengeluaran", hint: "Uang kas dipakai" },
  { value: "in", label: "Pemasukan lain", hint: "Mis. saldo awal, sumbangan" },
];

/** Tambah (tanpa `entry`) atau ubah satu pengeluaran/pemasukan lain. */
function EntryDialog({ entry, open, onClose }: { entry?: Entry; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={entry ? "Ubah catatan kas" : "Catat pengeluaran atau pemasukan"}>
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
      <RadioCards legend="Jenis" value={direction} onValueChange={setDirection} options={DIRECTIONS} />
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jumlah">
          <RupiahInput value={amount} onValueChange={setAmount} required />
        </Field>
        <Field label="Tanggal" hint={date && date <= today ? formatDateLong(date) : undefined}>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
        </Field>
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
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
