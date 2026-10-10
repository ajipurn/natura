import { ArrowUpRight, Pencil, ReceiptText, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Select } from "@/components/select";
import { Button, Card, Field, Input, buttonClass, cx } from "@/components/ui";
import { adminPath } from "@/lib/app-paths";
import { formatDateShort, formatMonth } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { CashTransaction } from "@/server/kas";

const SOURCES = { deposit: "Jimpitan · Setoran", payment: "Jimpitan · Langsung", dues: "Iuran", entry: "Manual" };
const FILTERS = [
  { value: "all", label: "Semua sumber" },
  { value: "jimpitan", label: "Jimpitan" },
  { value: "dues", label: "Iuran" },
  { value: "entry", label: "Transaksi manual" },
] as const;
type SourceFilter = typeof FILTERS[number]["value"];

export function CashTransactions({ transactions, month, onEdit }: {
  transactions: CashTransaction[];
  month: string;
  onEdit: (transaction: CashTransaction) => void;
}) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const term = search.trim().toLocaleLowerCase("id");
  const filtered = source !== "all" || !!term;
  const shown = transactions.filter((t) => (
    source === "all" || (source === "jimpitan" ? t.source === "deposit" || t.source === "payment" : t.source === source)
  ) && `${t.description} ${t.note ?? ""} ${t.recordedByName ?? ""} ${SOURCES[t.source]}`.toLocaleLowerCase("id").includes(term));
  const income = shown.filter((t) => t.direction === "in").reduce((sum, t) => sum + t.amount, 0);
  const expenses = shown.filter((t) => t.direction === "out").reduce((sum, t) => sum + t.amount, 0);
  const clear = () => { setSearch(""); setSource("all"); };

  return (
    <section aria-labelledby="transaksi">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="transaksi" className="font-semibold">Transaksi kas</h2>
          <p className="mt-1 text-sm text-muted">Seluruh pemasukan dan pengeluaran {formatMonth(month)}.</p>
        </div>
        <span className="rounded-full bg-idle-soft px-2.5 py-1 text-xs font-medium text-muted">{transactions.length} transaksi</span>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field label="Cari transaksi">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keterangan, rumah, atau pencatat" className="ps-9" />
            </div>
          </Field>
          <Select label="Sumber transaksi" value={source} onValueChange={setSource} options={FILTERS} />
        </div>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <ReceiptText className="mb-3 size-8 text-muted/60" aria-hidden />
            <p className="text-sm font-medium">{filtered ? "Tidak ada transaksi yang cocok" : "Belum ada transaksi bulan ini"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">{filtered ? "Coba kata kunci atau sumber lain." : "Catat pemasukan atau pengeluaran. Setoran jimpitan dan penerimaan iuran otomatis tampil di sini."}</p>
            {filtered && <Button variant="secondary" size="sm" className="mt-4" onClick={clear}>Hapus filter</Button>}
          </div>
        ) : (
          <table className="w-full table-fixed text-start text-sm" aria-labelledby="transaksi">
            <colgroup>
              <col className="hidden w-24 sm:table-column" />
              <col />
              <col className="w-28 sm:hidden" />
              <col className="hidden w-32 sm:table-column" />
              <col className="hidden w-32 sm:table-column" />
              <col className="w-12 sm:w-24" />
            </colgroup>
            <thead className="border-b border-line bg-idle-soft/40 text-xs text-muted">
              <tr>
                <th scope="col" className="hidden px-4 py-3 text-start font-medium sm:table-cell">Tanggal</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">Keterangan</th>
                <th scope="col" className="py-3 pe-2 text-end font-medium sm:hidden">Jumlah</th>
                <th scope="col" className="hidden px-4 py-3 text-end font-medium sm:table-cell">Masuk</th>
                <th scope="col" className="hidden px-4 py-3 text-end font-medium sm:table-cell">Keluar</th>
                <th scope="col" className="px-2 py-3 font-medium"><span className="sr-only">Tindakan</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((t) => {
                const out = t.direction === "out";
                const day = formatDateShort(t.date).split(", ")[1];
                const editable = t.source === "entry" || t.source === "deposit";
                const href = t.source === "payment"
                  ? adminPath(`/rekap?bulan=${t.relatedMonth}&view=payments`)
                  : adminPath(`/iuran?bulan=${t.relatedMonth}&view=receipts`);
                return (
                  <tr key={t.id} className="align-top hover:bg-idle-soft/20">
                    <td className="hidden whitespace-nowrap px-4 py-4 text-muted sm:table-cell"><time dateTime={t.date}>{day}</time></td>
                    <td className="px-4 py-4 [overflow-wrap:anywhere]">
                      <p className="font-medium">{t.description}</p>
                      {t.note && <p className="mt-1 text-xs text-muted">{t.note}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <time dateTime={t.date} className="sm:hidden">{day}</time>
                        <span className="rounded-md bg-idle-soft/60 px-1.5 py-0.5">{SOURCES[t.source]}</span>
                        {t.recordedByName && <span>Dicatat {t.recordedByName}</span>}
                      </div>
                    </td>
                    <td className={cx("py-4 pe-2 text-end text-xs font-semibold tabular-nums sm:hidden", out ? "text-empty" : "text-filled")}>
                      <span className="sr-only">{out ? "Pengeluaran " : "Pemasukan "}</span>{out ? "−" : "+"}{formatRupiah(t.amount)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-4 text-end font-medium tabular-nums text-filled sm:table-cell">{!out ? formatRupiah(t.amount) : <span className="text-muted/50">—</span>}</td>
                    <td className="hidden whitespace-nowrap px-4 py-4 text-end font-medium tabular-nums text-empty sm:table-cell">{out ? formatRupiah(t.amount) : <span className="text-muted/50">—</span>}</td>
                    <td className="py-2 pe-1 sm:px-2">
                      {editable ? (
                        <Button variant="ghost" size="sm" className="size-11 gap-1.5 px-0 sm:w-auto sm:px-2" aria-label={`Ubah ${t.description}, ${day}`} onClick={() => onEdit(t)}>
                          <Pencil className="size-4" aria-hidden /><span className="hidden sm:inline">Ubah</span>
                        </Button>
                      ) : (
                        <Link to={href} className={cx(buttonClass("ghost", "sm"), "size-11 gap-1.5 px-0 sm:w-auto sm:px-2")} aria-label={`Lihat ${t.description}, ${day}`}>
                          <ArrowUpRight className="size-4" aria-hidden /><span className="hidden sm:inline">Lihat</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line bg-idle-soft/20 px-4 py-3 text-xs">
          <p className="text-muted" role="status">{filtered ? `${shown.length} dari ${transactions.length} transaksi` : "Total bulan ini"}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
            <span>Masuk <strong className="font-semibold text-filled">{formatRupiah(income)}</strong></span>
            <span>Keluar <strong className="font-semibold text-empty">{formatRupiah(expenses)}</strong></span>
          </div>
          {filtered && <Button variant="ghost" size="sm" className="h-8 px-0" onClick={clear}>Hapus filter</Button>}
        </div>
      </Card>
    </section>
  );
}
