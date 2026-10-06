import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Pencil,
  Search,
} from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { QueryState } from "@/components/query-state";
import { ScrollArea } from "@/components/scroll-area";
import { Select } from "@/components/select";
import { ChipGroup } from "@/components/toggle-group";
import { Button, Card, Input, PageHeader, cx } from "@/components/ui";
import {
  CorrectionDialog,
  type CorrectionTarget,
} from "@/features/riwayat/correction-form";
import {
  daysInMonth,
  formatDateShort,
  formatMonth,
  isMonth,
  rondaDate,
  shiftMonth,
} from "@/lib/dates";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { groupByBlock, houseLabel, searchHouses } from "@/lib/houses";
import { summarizeMonth } from "@/lib/month-summary";
import { buildRecapCsv } from "@/lib/recap-csv";
import { buildRecapSheets } from "@/lib/recap-xlsx";
import type { MonthCell, MonthRecap } from "@/lib/types";
import { recapQuery } from "./queries";

type Filter = "semua" | "kosong" | "tidak-dicek";
type RecapData = MonthRecap & { month: string; defaultAmount: number };
type Sort = "rumah" | "total" | "kosong";

const SORTS: { value: Sort; label: string }[] = [
  { value: "rumah", label: "Blok & nomor" },
  { value: "total", label: "Total terbesar" },
  { value: "kosong", label: "Paling sering kosong" },
];

function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: fileName,
  });
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(month: string, recap: MonthRecap) {
  saveFile(
    new Blob([buildRecapCsv(recap)], { type: "text/csv;charset=utf-8" }),
    `jimpitan-${month}.csv`,
  );
}

async function downloadXlsx(
  month: string,
  recap: MonthRecap,
  communityName: string,
) {
  // Pustakanya hanya diunduh saat tombol ditekan.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  saveFile(
    await writeXlsxFile(buildRecapSheets(recap, communityName)).toBlob(),
    `jimpitan-${month}.xlsx`,
  );
}

export function RekapPage() {
  const [params] = useSearchParams();
  const tonight = rondaDate(new Date());
  const thisMonth = tonight.slice(0, 7);
  const bulan = params.get("bulan") ?? "";
  const month = isMonth(bulan) && bulan <= thisMonth ? bulan : thisMonth;
  const query = useQuery({
    ...recapQuery(month),
    placeholderData: (previous) => previous,
  });
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const ready =query.data && query.data.month === month;

  async function exportXlsx() {
    if (!query.data) return;
    setExporting(true);
    try {
      await downloadXlsx(month, query.data, query.data.communityName);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Rekap bulanan"
        subtitle="Jimpitan per rumah per malam ronda"
        action={
          <div className="flex shrink-0 gap-2">
            <Button
              disabled={!ready || exporting}
              onClick={exportXlsx}
              variant="secondary"
              size="sm"
            >
              <FileSpreadsheet className="size-4" />{" "}
              {exporting ? "Menyiapkan…" : "Excel"}
            </Button>
            <Button
              disabled={!ready}
              onClick={() => query.data && downloadCsv(month, query.data)}
              variant="secondary"
              size="sm"
            >
              <FileText className="size-4" /> CSV
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <nav
        aria-label="Pilih bulan"
        className="inline-flex items-center rounded-xl border border-line bg-card p-0.5"
      >
        <Link
          to={`/admin/rekap?bulan=${shiftMonth(month, -1)}`}
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-idle-soft"
          aria-label={`Bulan sebelumnya (${formatMonth(shiftMonth(month, -1))})`}
        >
          <ChevronLeft className="size-5" />
        </Link>
        <span className="min-w-36 px-2 text-center font-semibold">
          {formatMonth(month)}
        </span>
        {month < thisMonth ? (
          <Link
            to={`/admin/rekap?bulan=${shiftMonth(month, 1)}`}
            className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-idle-soft"
            aria-label={`Bulan berikutnya (${formatMonth(shiftMonth(month, 1))})`}
          >
            <ChevronRight className="size-5" />
          </Link>
        ) : (
          <span
            aria-hidden
            className="flex size-9 items-center justify-center text-muted/40"
          >
            <ChevronRight className="size-5" />
          </span>
        )}
      </nav>
      <Button
        variant={editing ? "primary" : "secondary"}
        size="sm"
        aria-pressed={editing}
        onClick={() => setEditing(!editing)}
      >
        {editing ? <Check className="size-4" /> : <Pencil className="size-4" />}
        {editing ? "Selesai" : "Isi/ubah catatan"}
      </Button>
      </div>

      <QueryState query={query}>
        {(data) => (
          <div className={cx(query.isPlaceholderData && "opacity-60")}>
            <RecapBody data={data} editing={editing} tonight={tonight} />
          </div>
        )}
      </QueryState>
    </>
  );
}

/**
 * Tabel rekap. Saat `editing`, tabelnya memuat semua tanggal bulan itu sampai malam ini (juga malam
 * tanpa catatan) dan tiap kotak bisa diketuk untuk mengisi atau mengubah catatan rumah itu.
 */
function RecapBody({
  data,
  editing,
  tonight,
}: {
  data: RecapData;
  editing: boolean;
  tonight: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const [sort, setSort] = useState<Sort>("rumah");
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const dates = editing
    ? daysInMonth(data.month).filter((d) => d <= tonight)
    : data.dates;
  const patrolDates = new Set(data.dates);
  const { rows, dateTotals, grandTotal } = summarizeMonth({ ...data, dates });
  const nights = data.dates.length;

  const stats = rows.map((r) => ({
    ...r,
    empty: r.cells.filter((c) => c?.status === "empty").length,
    // Rumah kosong/mudik tidak dihitung "tidak dicek", begitu juga malam tanpa catatan sama sekali.
    unchecked:
      r.house.status === "active"
        ? r.cells.filter((c, i) => !c && patrolDates.has(dates[i])).length
        : 0,
  }));
  const filledCells = stats.reduce((s, r) => s + r.filledCount, 0);
  const emptyCells = stats.reduce((s, r) => s + r.empty, 0);
  const uncheckedCells = stats.reduce((s, r) => s + r.unchecked, 0);
  const checkedCells = filledCells + emptyCells;

  if (rows.length === 0) {
    return (
      <Card className="py-10 text-center text-muted">
        Belum ada data rumah.
      </Card>
    );
  }
  if (nights === 0 && !editing) {
    return (
      <Card className="py-10 text-center text-muted">
        Belum ada catatan ronda di bulan ini.
        <span className="mt-1 block text-sm">
          Tekan “Isi/ubah catatan” untuk mengisinya manual.
        </span>
      </Card>
    );
  }

  const matched = search.trim()
    ? new Set(
        searchHouses(
          stats.map((s) => s.house),
          search,
          stats.length,
        ).map((h) => h.id),
      )
    : null;
  const filters: {
    value: Filter;
    label: string;
    match: (r: (typeof stats)[number]) => boolean;
  }[] = [
    { value: "semua", label: "Semua", match: () => true },
    { value: "kosong", label: "Pernah kosong", match: (r) => r.empty > 0 },
    {
      value: "tidak-dicek",
      label: "Ada yang tidak dicek",
      match: (r) => r.unchecked > 0,
    },
  ];
  const visible = stats
    .filter((r) => !matched || matched.has(r.house.id))
    .filter(filters.find((f) => f.value === filter)!.match)
    .sort((a, b) =>
      sort === "total"
        ? b.total - a.total
        : sort === "kosong"
          ? b.empty - a.empty || a.filledCount - b.filledCount
          : 0,
    );
  // Diurutkan per rumah: dikelompokkan per blok. Urutan lain: satu daftar.
  const groups: [string | null, typeof visible][] =
    sort === "rumah"
      ? groupByBlock(
          visible.map((r) => ({
            ...r,
            block: r.house.block,
            number: r.house.number,
          })),
        )
      : [[null, visible]];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Terkumpul" value={formatRupiah(grandTotal)} />
        <Stat label="Malam ronda" value={String(nights)} />
        <Stat
          label="Rata-rata per malam"
          value={nights ? formatRupiah(Math.round(grandTotal / nights)) : "–"}
        />
        <Stat
          label="Wadah ada isinya"
          value={
            checkedCells
              ? `${Math.round((filledCells / checkedCells) * 100)}%`
              : "–"
          }
          hint={`${emptyCells} kosong | ${uncheckedCells} tidak dicek`}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block lg:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari rumah atau nama…"
            aria-label="Cari rumah"
            className="h-10 pl-10"
          />
        </label>
        <ScrollArea className="-mx-4 overflow-x-auto lg:mx-0">
          <ChipGroup
            aria-label="Saring rumah"
            value={filter}
            onValueChange={setFilter}
            options={filters.map((f) => ({
              value: f.value,
              label: f.label,
              count: stats.filter(f.match).length,
            }))}
            className="w-max min-w-full px-4 lg:px-0"
          />
        </ScrollArea>
        <div className="flex items-center gap-2 text-sm lg:ml-auto">
          <span className="text-muted">Urutkan</span>
          <Select
            aria-label="Urutkan"
            value={sort}
            onValueChange={setSort}
            options={SORTS}
            className="h-10 w-56"
          />
        </div>
      </div>

      <Legend editing={editing} />

      {visible.length === 0 ? (
        <Card className="mt-3 text-center text-muted">
          Tidak ada rumah yang cocok.
        </Card>
      ) : (
        <ScrollArea className="mt-3 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="sticky left-0 z-10 w-full min-w-40 bg-card px-3 py-2 text-left font-semibold">
                  Rumah
                </th>
                {dates.map((d) => (
                  <th key={d} className="px-0.5 py-1.5 font-medium">
                    <Link
                      to={`/admin/riwayat/${d}`}
                      title={`Buka riwayat ${formatDateShort(d)}`}
                      className={cx(
                        "flex min-w-7 flex-col items-center rounded-md py-0.5 leading-tight hover:bg-idle-soft hover:text-fg",
                        // Malam tanpa catatan (hanya tampil saat mengisi).
                        !patrolDates.has(d) && "opacity-50",
                      )}
                    >
                      <span className="text-[10px]">
                        {formatDateShort(d).split(",")[0]}
                      </span>
                      <span className="font-semibold">
                        {Number(d.slice(8))}
                      </span>
                    </Link>
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                  Ada
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            {groups.map(([block, list]) => (
              <tbody key={block ?? "semua"}>
                {block && (
                  <tr className="border-b border-line bg-bg/60">
                    <th
                      colSpan={dates.length + 3}
                      className="sticky left-0 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      Blok {block} | {list.length} rumah |{" "}
                      {formatRupiah(list.reduce((s, r) => s + r.total, 0))}
                    </th>
                  </tr>
                )}
                {list.map((r) => (
                  <tr
                    key={r.house.id}
                    className={cx(
                      "border-b border-line last:border-0 hover:bg-idle-soft/50",
                      r.house.status === "vacant" && "text-muted",
                    )}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-normal"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="font-semibold">
                          {houseLabel(r.house)}
                        </span>
                        <span className="min-w-0 truncate text-xs text-muted">
                          {r.house.ownerName ?? ""}
                        </span>
                        {r.house.status === "vacant" && (
                          <span className="shrink-0 rounded-full bg-warn-soft px-1.5 text-[10px] font-semibold text-warn">
                            mudik
                          </span>
                        )}
                      </span>
                    </th>
                    {r.cells.map((cell, i) => {
                      const vacant = r.house.status === "vacant";
                      const content = (
                        <Cell cell={cell} vacant={vacant} date={dates[i]} />
                      );
                      return (
                        <td key={dates[i]} className="px-0.5 py-1 text-center">
                          {editing ? (
                            // Tombol biasa (bukan Base UI Button): jumlahnya bisa ribuan dalam satu tabel.
                            <button
                              type="button"
                              onClick={() => {
                                setTarget({ house: r.house, date: dates[i], current: cell });
                                setTargetOpen(true);
                              }}
                              aria-label={`${houseLabel(r.house)}, ${formatDateShort(dates[i])}: ${cellText(cell, vacant)}`}
                              className="inline-flex cursor-pointer rounded-md align-middle transition hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {content}
                            </button>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                      {r.filledCount}
                      <span className="text-muted">
                        /{r.filledCount + r.empty}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums">
                      {formatRupiah(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-3 py-2 text-left"
                >
                  Total
                </th>
                {dateTotals.map((t, i) => (
                  <td
                    key={dates[i]}
                    className="px-0.5 py-2 text-center text-[10px] text-muted"
                  >
                    {t > 0 ? formatAmountShort(t) : "–"}
                  </td>
                ))}
                <td />
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatRupiah(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </ScrollArea>
      )}

      <CorrectionDialog
        target={target}
        open={targetOpen}
        onClose={() => setTargetOpen(false)}
        defaultAmount={data.defaultAmount}
      />
    </>
  );
}

function cellText(cell: MonthCell | undefined, vacant: boolean) {
  if (cell?.status === "filled") return formatRupiah(cell.amount);
  if (cell?.status === "empty") return "kosong";
  return vacant ? "mudik" : "tidak dicek";
}

function Cell({
  cell,
  vacant,
  date,
}: {
  cell: MonthCell | undefined;
  vacant: boolean;
  date: string;
}) {
  const title = `${formatDateShort(date)}: ${cellText(cell, vacant)}`;
  if (cell?.status === "filled") {
    return (
      <span
        title={title}
        className="inline-flex size-7 items-center justify-center rounded-md bg-filled-soft align-middle text-[10px] font-semibold text-filled"
      >
        {formatAmountShort(cell.amount)}
      </span>
    );
  }
  if (cell?.status === "empty") {
    return (
      <span
        title={title}
        className="inline-flex size-7 items-center justify-center rounded-md bg-empty-soft align-middle text-sm font-bold text-empty"
      >
        ×
      </span>
    );
  }
  return (
    <span
      title={title}
      className={cx(
        "inline-flex size-7 rounded-md border border-dashed align-middle",
        vacant ? "border-line/60" : "border-muted/50",
      )}
    />
  );
}

function Legend({ editing }: { editing: boolean }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-flex size-5 items-center justify-center rounded bg-filled-soft text-[9px] font-semibold text-filled">
          500
        </span>
        Ada isinya
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex size-5 items-center justify-center rounded bg-empty-soft text-xs font-bold text-empty">
          ×
        </span>
        Kosong
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-5 rounded border border-dashed border-muted/50" />
        Tidak dicek
      </span>
      <span className={cx(editing && "font-semibold text-fg")}>
        {editing
          ? "Ketuk kotak untuk mengisi atau mengubah catatan. Ketuk tanggal untuk mengisi satu malam sekaligus."
          : "Ketuk tanggal untuk membuka riwayat malam itu."}
      </span>
    </p>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="whitespace-nowrap text-xl font-bold leading-tight">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
