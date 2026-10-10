import { Tabs } from "@base-ui/react/tabs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Pencil, Plus, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { RadioCards, type RadioCardOption } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { RupiahInput } from "@/components/rupiah-input";
import { Select } from "@/components/select";
import { Alert, Button, Card, Field, Input, PageHeader, buttonClass, cx } from "@/components/ui";
import { formatDateShort, formatMonth, isMonth, localDate, rondaDate, shiftMonth } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { CashMonth } from "@/server/kas";
import { CASH_REFRESH, cashQuery, settingsQuery } from "../queries";
import { adminPath } from "@/lib/app-paths";
import { CashTransactions } from "./cash-transactions";
import { CashIncomeChart } from "./cash-income-chart";

type Night = CashMonth["nights"][number];
type Entry = CashMonth["entries"][number];
type Direction = Entry["direction"];
type CashView = "transactions" | "deposits";
type DepositFilter = "attention" | "pending" | "difference" | "all";

const depositStatus = (night: Night) => !night.deposit ? "pending" : night.deposit.amount !== night.recorded ? "difference" : "matched";
const depositPriority = { pending: 0, difference: 1, matched: 2 };
const cashTabClass = "inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-active:bg-primary data-active:text-primary-fg data-active:hover:text-primary-fg";

/** "2026-10-05" → "5 Okt" */
const dayMonth = (isoDate: string) => formatDateShort(isoDate).split(", ")[1];

/**
 * Kas lingkungan: seluruh pemasukan/pengeluaran, dengan pencocokan setoran jimpitan tersendiri.
 */
export function KasPage() {
  const [params, setParams] = useSearchParams();
  const view: CashView = params.get("view") === "deposits" ? "deposits" : "transactions";
  const selectView = (value: CashView) => {
    const next = new URLSearchParams(params);
    if (value === "transactions") next.delete("view");
    else next.set("view", value);
    setParams(next, { replace: true });
  };
  const tonight = rondaDate(new Date());
  const thisMonth = tonight.slice(0, 7);
  const bulan = params.get("bulan") ?? "";
  const month = isMonth(bulan) && bulan <= thisMonth ? bulan : thisMonth;
  const query = useQuery({ ...cashQuery(month), placeholderData: (previous) => previous });
  const attentionCount = query.data?.nights.filter((n) => depositStatus(n) !== "matched").length ?? 0;
  const cashPublic = useQuery(settingsQuery).data?.cashPublic;
  // Dialog pengeluaran/pemasukan lain (tanpa `entry` = tambah baru). Isinya tetap selama dialog menutup.
  const [entryTarget, setEntryTarget] = useState<{ entry?: Entry }>({});
  const [entryOpen, setEntryOpen] = useState(false);
  const openEntry = (entry?: Entry) => {
    setEntryTarget({ entry });
    setEntryOpen(true);
  };
  const [depositTarget, setDepositTarget] = useState<Night>();
  const [depositOpen, setDepositOpen] = useState(false);
  const openDeposit = (night: Night) => { setDepositTarget(night); setDepositOpen(true); };

  return (
    <>
      <PageHeader title="Kas lingkungan" subtitle="Pemasukan, pengeluaran, dan saldo bersama." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <MonthNav month={month} thisMonth={thisMonth} view={view} />
        <div className="flex flex-wrap justify-end gap-2">
          <Link to={adminPath("/iuran")} className={buttonClass("secondary", "sm")}>Kelola iuran</Link>
          <Button size="sm" onClick={() => openEntry()}><Plus className="size-4" aria-hidden /> Catat transaksi</Button>
        </div>
      </div>

      <QueryState query={query}>
        {(data) => (
          <div className={cx("space-y-6", query.isPlaceholderData && "opacity-60")}>
            <Summary data={data} />
            {data.undeposited.length > 0 && <Undeposited dates={data.undeposited} month={month} onOpen={() => selectView("deposits")} />}
            <Tabs.Root value={view} onValueChange={(value: CashView) => selectView(value)}>
              <Tabs.List aria-label="Tampilan kas" activateOnFocus className="mb-5 flex w-fit max-w-full rounded-xl border border-line bg-card p-0.5">
                <Tabs.Tab value="transactions" className={cashTabClass}>Transaksi</Tabs.Tab>
                <Tabs.Tab value="deposits" className={cashTabClass}>
                  <span>Setoran jimpitan</span>
                  {attentionCount > 0 && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">
                    {attentionCount}<span className="sr-only"> malam perlu dicek</span>
                  </span>}
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="transactions" keepMounted className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                <CashTransactions key={data.month} transactions={data.transactions} month={data.month} onEdit={(transaction) => {
                  if (transaction.source === "entry") {
                    const entry = data.entries.find((e) => e.id === transaction.sourceId);
                    if (entry) openEntry(entry);
                  } else if (transaction.source === "deposit") {
                    const night = data.nights.find((n) => n.date === transaction.date);
                    if (night) openDeposit(night);
                  }
                }} />
              </Tabs.Panel>
              <Tabs.Panel value="deposits" keepMounted className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                <Deposits key={data.month} nights={data.nights} tonight={tonight} onOpen={openDeposit} />
              </Tabs.Panel>
            </Tabs.Root>
            {cashPublic !== undefined && (
              <p className="text-xs text-muted">
                {cashPublic
                  ? "Saldo, jumlah bulan ini, dan rincian pemasukan/pengeluaran tampil di Beranda (tanpa nama pencatat)."
                  : "Kas tidak ditampilkan di Beranda."}{" "}
                <Link to={adminPath("/pengaturan")} className="font-semibold text-primary">
                  Ubah di Pengaturan
                </Link>
              </p>
            )}
          </div>
        )}
      </QueryState>

      <EntryDialog entry={entryTarget.entry} open={entryOpen} onClose={() => setEntryOpen(false)} />
      <Dialog open={depositOpen} onClose={() => setDepositOpen(false)} title={depositTarget?.deposit ? "Ubah setoran jimpitan" : "Catat setoran jimpitan"}
        description={depositTarget ? `Ronda ${formatDateShort(depositTarget.date)} · tercatat ${formatRupiah(depositTarget.recorded)}.` : undefined}>
        {depositTarget && <DepositForm key={`${depositTarget.date}:${depositTarget.deposit?.updatedAt ?? "baru"}`} night={depositTarget} onDone={() => setDepositOpen(false)} />}
      </Dialog>
    </>
  );
}

function MonthNav({ month, thisMonth, view }: { month: string; thisMonth: string; view: CashView }) {
  const link = (m: string) => {
    const query = new URLSearchParams();
    if (m !== thisMonth) query.set("bulan", m);
    if (view === "deposits") query.set("view", view);
    return adminPath(`/kas${query.size ? `?${query}` : ""}`);
  };
  const monthLabel = formatMonth(month);
  return (
    <nav aria-label="Pilih bulan" className="flex min-w-0 flex-1 items-center rounded-xl border border-line bg-card p-px sm:flex-none">
      <Link
        to={link(shiftMonth(month, -1))}
        className={buttonClass("ghost", "icon-sm")}
        aria-label={`Bulan sebelumnya (${formatMonth(shiftMonth(month, -1))})`}
      >
        <ChevronLeft className="size-5" />
      </Link>
      <span className="min-w-0 flex-1 whitespace-nowrap text-center text-sm font-semibold sm:min-w-36 sm:px-1 sm:text-base">
        {monthLabel}
      </span>
      {month < thisMonth ? (
        <Link
          to={link(shiftMonth(month, 1))}
          className={buttonClass("ghost", "icon-sm")}
          aria-label={`Bulan berikutnya (${formatMonth(shiftMonth(month, 1))})`}
        >
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span aria-hidden className={cx(buttonClass("ghost", "icon-sm"), "pointer-events-none text-muted/40")}>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}

/** Saldo sekarang dan arus kas bulan terpilih dari seluruh sumber penerimaan. */
function Summary({ data }: { data: CashMonth }) {
  const income = data.deposits + data.directPayments + data.duesIncome + data.income;
  return (
    <Card className="grid overflow-hidden p-0 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1.2fr)]" aria-label="Overview kas">
      <div className="bg-primary/5 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Wallet className="size-4 text-primary" aria-hidden /> Saldo kas saat ini
        </p>
        <p className={cx("mt-2 break-words text-3xl font-bold tracking-tight tabular-nums", data.balance < 0 && "text-empty")}>
          {formatRupiah(data.balance)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">Saldo dari seluruh transaksi sampai saat ini.</p>
      </div>
      <CashIncomeChart data={data} />
      <div className="min-w-0 p-5 sm:col-span-2 sm:p-6 xl:col-span-1">
        <h2 className="mb-4 text-sm font-semibold">Arus kas {formatMonth(data.month)}</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <div>
            <dt className="flex items-center gap-1.5 text-muted"><ArrowDownLeft className="size-4 text-filled" aria-hidden /> Pemasukan</dt>
            <dd className="mt-1 break-words text-xl font-semibold tracking-tight tabular-nums text-filled">{formatRupiah(income)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-muted"><ArrowUpRight className="size-4 text-empty" aria-hidden /> Pengeluaran</dt>
            <dd className="mt-1 break-words text-xl font-semibold tracking-tight tabular-nums text-empty">{formatRupiah(data.expenses)}</dd>
          </div>
          <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
            <dt className="text-muted">Saldo awal bulan</dt><dd className="font-medium tabular-nums">{formatRupiah(data.opening)}</dd>
          </div>
          <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-2">
            <dt className="font-semibold">Saldo akhir bulan</dt>
            <dd className="shrink-0 font-bold tabular-nums">{formatRupiah(data.closing)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/** Malam yang uangnya belum dicatat setorannya (bulan mana pun; bulan lain bisa diketuk). */
function Undeposited({ dates, month, onOpen }: { dates: string[]; month: string; onOpen: () => void }) {
  const shown = dates.slice(-6);
  const last = shown.length - 1;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
      <p className="flex min-w-0 flex-1 basis-64 gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>{dates.length} malam</strong> belum dicatat setorannya:{" "}
          {dates.length > shown.length && "…, "}
          {shown.map((d, i) => (
            <span key={d}>
              {i > 0 && (i === last ? " dan " : ", ")}
              {d.startsWith(month) ? (
                dayMonth(d)
              ) : (
                <Link to={adminPath(`/kas?bulan=${d.slice(0, 7)}&view=deposits`)} className="underline">
                  {dayMonth(d)}
                </Link>
              )}
            </span>
          ))}
          .
        </span>
      </p>
      <Button variant="ghost" size="sm" onClick={onOpen} className="text-warn hover:text-warn">Periksa setoran <ChevronRight className="size-4" aria-hidden /></Button>
    </div>
  );
}

function Deposits({ nights, tonight, onOpen }: { nights: Night[]; tonight: string; onOpen: (night: Night) => void }) {
  const [filter, setFilter] = useState<DepositFilter>("attention");
  const pending = nights.filter((n) => depositStatus(n) === "pending").length;
  const difference = nights.filter((n) => depositStatus(n) === "difference").length;
  const shown = nights.filter((n) => filter === "all" || (filter === "attention" ? depositStatus(n) !== "matched" : depositStatus(n) === filter))
    .sort((a, b) => depositPriority[depositStatus(a)] - depositPriority[depositStatus(b)] || b.date.localeCompare(a.date));
  const options = [
    { value: "attention", label: "Perlu dicek", hint: `${pending + difference} malam` },
    { value: "pending", label: "Belum disetor", hint: `${pending} malam` },
    { value: "difference", label: "Ada selisih", hint: `${difference} malam` },
    { value: "all", label: "Semua setoran", hint: `${nights.length} malam` },
  ] as const;
  return (
    <section aria-labelledby="setoran">
      <h2 id="setoran" className="font-semibold">Setoran jimpitan</h2>
      <p className="mb-3 mt-1 text-sm text-muted">Cocokkan uang yang diterima dengan catatan ronda. Setoran tersimpan otomatis tampil di transaksi kas.</p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:w-72"><Select label="Status setoran" value={filter} onValueChange={setFilter} options={options} /></div>
        <p role="status" className="text-xs text-muted">{shown.length} dari {nights.length} malam</p>
      </div>
      {nights.length === 0 ? (
        <Card className="py-6 text-center text-sm text-muted">Belum ada jimpitan tercatat bulan ini.</Card>
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center px-5 py-8 text-center">
          {filter === "attention" && <CheckCircle2 className="mb-3 size-8 text-filled" aria-hidden />}
          <p className="text-sm font-semibold">{filter === "attention" ? "Semua setoran sudah sesuai" : "Tidak ada setoran dengan status ini"}</p>
          <p className="mt-1 text-sm text-muted">{filter === "attention" ? `${nights.length} malam sudah dicatat setorannya dan sesuai dengan catatan ronda.` : "Pilih status lain atau lihat seluruh setoran bulan ini."}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setFilter("all")}>Lihat semua setoran</Button>
        </Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {shown.map((n) => (
            <NightRow
              key={n.date}
              night={n}
              isTonight={n.date === tonight}
              onEdit={() => onOpen(n)}
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
  onEdit,
}: {
  night: Night;
  isTonight: boolean;
  onEdit: () => void;
}) {
  const { date, recorded, filled, deposit } = night;
  return (
    <li className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-semibold">
            <Link to={adminPath(`/riwayat/${date}`)} className="hover:underline">
              {formatDateShort(date)}
            </Link>
            {isTonight && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Malam ini</span>}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Tercatat <span className="font-semibold text-fg tabular-nums">{formatRupiah(recorded)}</span>
            {filled > 0 && ` · ${filled} rumah`}
          </p>
          {night.periodPayments > 0 && <p className="mt-1 text-xs text-muted">Termasuk pembayaran periode ke petugas {formatRupiah(night.periodPayments)}.</p>}
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
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">Belum disetor</span>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Catat setoran
            </Button>
          </div>
        )}
      </div>
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
      className="space-y-4"
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
      description="Catat pengeluaran, saldo awal, atau pemasukan lain. Jimpitan dan iuran tercatat otomatis dari penerimaannya."
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
