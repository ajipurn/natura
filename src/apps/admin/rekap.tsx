import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Search,
  Sheet,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Menu } from "@/components/menu";
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
import { SheetsLinkDialog } from "./sheets-link";

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
  // BOM supaya Excel membaca UTF-8.
  saveFile(
    new Blob(["\uFEFF", buildRecapCsv(recap)], {
      type: "text/csv;charset=utf-8",
    }),
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
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const ready = query.data && query.data.month === month;

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
          <Menu
            label="Unduh rekap"
            className="shrink-0"
            trigger={
              <>
                <Download className="size-4" />
                {exporting ? "Menyiapkan…" : "Unduh"}
                <ChevronDown className="-mr-1 size-4 text-muted" />
              </>
            }
            items={[
              {
                label: "Excel (.xlsx)",
                hint: "Berwarna, lembar per rumah dan per malam",
                icon: <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-filled" />,
                onSelect: exportXlsx,
                disabled: !ready || exporting,
              },
              {
                label: "CSV",
                hint: "Tabel polos untuk aplikasi lain",
                icon: <FileText className="mt-0.5 size-4 shrink-0 text-muted" />,
                onSelect: () => query.data && downloadCsv(month, query.data),
                disabled: !ready,
              },
              {
                label: "Google Sheets",
                hint: "Link IMPORTDATA yang ikut terbarui",
                icon: <Sheet className="mt-0.5 size-4 shrink-0 text-primary" />,
                onSelect: () => setSheetsOpen(true),
              },
            ]}
          />
        }
      />
      <SheetsLinkDialog
        open={sheetsOpen}
        onClose={() => setSheetsOpen(false)}
        month={month}
        thisMonth={thisMonth}
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
 * Tabel rekap: semua tanggal bulan itu seperti kalender. Malam tanpa catatan tampil pudar, malam
 * yang belum tiba kosong. Saat `editing`, tiap kotak sampai malam ini bisa diketuk untuk mengisi
 * atau mengubah catatan rumah itu.
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
  const headRef = useRef<HTMLDivElement>(null);
  const dates = daysInMonth(data.month);
  const patrolDates = new Set(data.dates);
  const { rows, dateTotals, grandTotal } = summarizeMonth({ ...data, dates });
  const nights = data.dates.length;
  const maxNight = Math.max(...dateTotals, 1);
  // Malam yang belum tiba (selalu di akhir bulan) diberi kolom sempit.
  const future = dates.filter((d) => d > tonight).length;
  // Kolom tanggal berbagi sisa lebar, tapi tidak lebih sempit dari ini (lihat `RecapCols`).
  const minWidth = `calc(var(--rumah-col) + ${dates.length - future} * ${DATE_COL} + ${future} * ${FUTURE_COL} + ${ADA_COL} + ${TOTAL_COL})`;

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
          hint={`${emptyCells} kosong · ${uncheckedCells} tidak dicek`}
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

      <Legend editing={editing} defaultAmount={data.defaultAmount} />

      {visible.length === 0 ? (
        <Card className="mt-3 text-center text-muted">
          Tidak ada rumah yang cocok.
        </Card>
      ) : (
        <div className="mt-3 rounded-2xl border border-line bg-card [--rumah-col:10rem] sm:[--rumah-col:12rem]">
          {/*
           * Judul kolom menempel di atas saat halaman digulir (di bawah header HP, lihat layout.tsx).
           * Tabel terpisah karena wadah geser-mendatar di bawah menghalangi `sticky` vertikal; strip
           * ini ikut digeser mendatar lewat `onScrollCapture`. Lebar kolom sama lewat `RecapCols`.
           */}
          <div
            ref={headRef}
            className="sticky top-[57px] z-20 overflow-hidden rounded-t-[15px] border-b border-line bg-card lg:top-0"
          >
            <table
              role="presentation"
              className="w-full table-fixed border-collapse text-sm"
              style={{ minWidth }}
            >
              <RecapCols dates={dates.length} future={future} />
              <thead>
                <tr className="text-xs text-muted">
                  <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold">
                    Rumah
                  </th>
                  {dates.map((d) => {
                    const label = (
                      <>
                        <span className="text-[10px]">
                          {formatDateShort(d).split(",")[0]}
                        </span>
                        <span className="font-semibold">
                          {Number(d.slice(8))}
                        </span>
                      </>
                    );
                    return (
                      <th key={d} className="px-px py-1.5 font-medium">
                        {d > tonight ? (
                          <span className="flex flex-col items-center py-0.5 leading-tight text-muted/40">
                            <span className="text-[10px]">
                              {formatDateShort(d).slice(0, 1)}
                            </span>
                            <span className="text-[10px]">
                              {Number(d.slice(8))}
                            </span>
                          </span>
                        ) : (
                          <Link
                            to={`/admin/riwayat/${d}`}
                            title={`Buka riwayat ${formatDateShort(d)}${patrolDates.has(d) ? "" : " (belum ada catatan)"}`}
                            aria-label={`Buka riwayat ${formatDateShort(d)}`}
                            className={cx(
                              "flex flex-col items-center rounded-md py-0.5 leading-tight hover:bg-idle-soft hover:text-fg",
                              !patrolDates.has(d) && "opacity-50",
                              d === tonight && "bg-primary/10 text-primary opacity-100",
                            )}
                          >
                            {label}
                          </Link>
                        )}
                      </th>
                    );
                  })}
                  <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                    Ada
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
            </table>
          </div>
          <div
            onScrollCapture={(e) => {
              if (headRef.current && e.target instanceof HTMLElement) {
                headRef.current.scrollLeft = e.target.scrollLeft;
              }
            }}
          >
            <ScrollArea className="overflow-x-auto rounded-b-[15px]">
              <table
                className="w-full table-fixed border-collapse text-sm"
                style={{ minWidth }}
              >
                <RecapCols dates={dates.length} future={future} />
                {/* Judul kolom untuk pembaca layar; yang terlihat ada di strip di atas. */}
                <thead className="sr-only">
                  <tr>
                    <th>Rumah</th>
                    {dates.map((d) => (
                      <th key={d}>{formatDateShort(d)}</th>
                    ))}
                    <th>Ada</th>
                    <th>Total</th>
                  </tr>
                </thead>
                {groups.map(([block, list]) => (
                  <tbody key={block ?? "semua"}>
                    {block && (
                      <tr className="border-b border-line bg-bg/60">
                        <th
                          colSpan={dates.length + 3}
                          className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                        >
                          {/* Sel ini selebar tabel, jadi yang menempel di kiri saat digeser teksnya. */}
                          <span className="sticky left-3 inline-block">
                            Blok {block} · {list.length} rumah ·{" "}
                            {formatRupiah(list.reduce((s, r) => s + r.total, 0))}
                          </span>
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
                          const date = dates[i];
                          const vacant = r.house.status === "vacant";
                          const recorded = patrolDates.has(date);
                          const future = date > tonight;
                          const content = future ? null : (
                            <Cell
                              cell={cell}
                              vacant={vacant}
                              recorded={recorded}
                              date={date}
                              defaultAmount={data.defaultAmount}
                            />
                          );
                          return (
                            <td
                              key={date}
                              className={cx(
                                "px-px py-1 text-center",
                                // Malam tanpa catatan sama sekali: kolomnya diberi warna latar tipis.
                                !recorded && !future && "bg-idle-soft/25",
                              )}
                            >
                              {editing && !future ? (
                                // Tombol biasa (bukan Base UI Button): jumlahnya bisa ribuan dalam satu tabel.
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTarget({ house: r.house, date, current: cell });
                                    setTargetOpen(true);
                                  }}
                                  aria-label={`${houseLabel(r.house)}, ${formatDateShort(date)}: ${cellText(cell, vacant)}`}
                                  className="flex w-full cursor-pointer justify-center rounded-md transition hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  {content}
                                </button>
                              ) : (
                                content
                              )}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
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
                      // Kolomnya sempit untuk angka: tinggi batang = terkumpul malam itu, angkanya di judul.
                      <td
                        key={dates[i]}
                        title={t > 0 ? `${formatDateShort(dates[i])}: ${formatRupiah(t)}` : undefined}
                        className="px-px py-2 align-bottom"
                      >
                        {t > 0 && (
                          <>
                            <span
                              aria-hidden
                              className="mx-auto block w-full max-w-5 rounded-sm bg-filled/70"
                              style={{ height: `${Math.max(3, (t / maxNight) * 28)}px` }}
                            />
                            <span className="sr-only">{formatRupiah(t)}</span>
                          </>
                        )}
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
          </div>
        </div>
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

const DATE_COL = "1.375rem";
const FUTURE_COL = "1rem";
const ADA_COL = "3.5rem";
const TOTAL_COL = "7rem";

/**
 * Lebar kolom (`table-fixed`), sama untuk strip judul dan isi tabel supaya kolomnya sejajar.
 * Kolom Rumah selebar `--rumah-col`; kolom tanggal berbagi sisa lebar (tidak lebih sempit dari
 * `DATE_COL`), jadi kotaknya tidak terpisah jauh dari nama rumah. `future` kolom terakhir (malam
 * yang belum tiba) dibuat sempit.
 */
function RecapCols({ dates, future }: { dates: number; future: number }) {
  return (
    <colgroup>
      <col style={{ width: "var(--rumah-col)" }} />
      {Array.from({ length: dates }, (_, i) => (
        <col key={i} style={i >= dates - future ? { width: FUTURE_COL } : undefined} />
      ))}
      <col style={{ width: ADA_COL }} />
      <col style={{ width: TOTAL_COL }} />
    </colgroup>
  );
}

function cellText(cell: MonthCell | undefined, vacant: boolean) {
  if (cell?.status === "filled") return formatRupiah(cell.amount);
  if (cell?.status === "empty") return "kosong";
  return vacant ? "mudik" : "tidak dicek";
}

const cellBox = "mx-auto flex h-6 w-full max-w-7 items-center justify-center rounded-[5px]";

/**
 * Satu kotak rumah × malam. "Ada" dengan nominal awal cukup hijau polos; angkanya hanya ditulis kalau
 * nominalnya lain, supaya yang tidak biasa menonjol. `recorded` = malam itu ada catatannya.
 */
function Cell({
  cell,
  vacant,
  recorded,
  date,
  defaultAmount,
}: {
  cell: MonthCell | undefined;
  vacant: boolean;
  recorded: boolean;
  date: string;
  defaultAmount: number;
}) {
  const title = `${formatDateShort(date)}: ${recorded || cell ? cellText(cell, vacant) : "belum ada catatan"}`;
  if (cell?.status === "filled") {
    return (
      <span
        title={title}
        className={cx(cellBox, "bg-filled-soft text-[9px] font-semibold leading-none text-filled ring-1 ring-inset ring-filled/15")}
      >
        {cell.amount !== defaultAmount && formatAmountShort(cell.amount)}
      </span>
    );
  }
  if (cell?.status === "empty") {
    return (
      <span title={title} className={cx(cellBox, "bg-empty-soft text-xs font-bold text-empty")}>
        ×
      </span>
    );
  }
  return (
    <span
      title={title}
      className={cx(
        cellBox,
        "border border-dashed",
        !recorded ? "border-line/70" : vacant ? "border-line" : "border-muted/40",
      )}
    />
  );
}

function Legend({ editing, defaultAmount }: { editing: boolean; defaultAmount: number }) {
  const swatch = "inline-flex h-5 w-4 items-center justify-center rounded-[4px]";
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className={cx(swatch, "bg-filled-soft ring-1 ring-inset ring-filled/15")} />
        Ada ({formatRupiah(defaultAmount)})
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cx(swatch, "w-5 bg-filled-soft text-[9px] font-semibold text-filled ring-1 ring-inset ring-filled/15")}>
          1rb
        </span>
        Nominal lain
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cx(swatch, "bg-empty-soft text-xs font-bold text-empty")}>×</span>
        Kosong
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cx(swatch, "border border-dashed border-muted/40")} />
        Tidak dicek
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cx(swatch, "border border-dashed border-line/70 bg-idle-soft/40")} />
        Malam tanpa catatan
      </span>
      <span className={cx("basis-full sm:basis-auto", editing && "font-semibold text-fg")}>
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
