import { useMutation, useQuery } from "@tanstack/react-query";
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
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { BarChart } from "@/components/bar-chart";
import { Menu } from "@/components/menu";
import { QueryState } from "@/components/query-state";
import { ScrollArea } from "@/components/scroll-area";
import { Select } from "@/components/select";
import { ChipGroup } from "@/components/toggle-group";
import { api, call, errorMessage } from "@/client/api";
import { invalidate } from "@/client/query";
import { Alert, Button, Card, Input, PageHeader, cx } from "@/components/ui";
import { AmountChoice } from "@/features/riwayat/correction-form";
import { CORRECTION_REFRESH } from "@/features/riwayat/queries";
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
  // Kotak yang dipilih untuk diisi sekaligus ("idRumah:tanggal"), hanya saat `editing`.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Pilihan tidak terbawa keluar dari mode isi atau ke bulan lain.
  const selectionScope = `${editing}|${data.month}`;
  const [scope, setScope] = useState(selectionScope);
  if (scope !== selectionScope) {
    setScope(selectionScope);
    setSelected(new Set());
  }
  // Menyeret dengan mouse: pilihan saat mulai, memilih atau melepas, dan kotak awalnya (baris, kolom).
  const drag = useRef<{ base: ReadonlySet<string>; on: boolean; row: number; col: number } | null>(null);
  // Klik sesudah tekan-mouse di kotak sudah ditangani saat ditekan.
  const skipClick = useRef(false);
  useEffect(() => {
    const stop = () => {
      drag.current = null;
      // Klik dikirim tepat sesudah tombol mouse dilepas; sesudahnya klik biasa berlaku lagi.
      setTimeout(() => (skipClick.current = false));
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);
  const headRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  // Sorotan kolom di bawah kursor: satu aturan CSS yang diganti langsung, tanpa render ulang tabel.
  const hoverStyleRef = useRef<HTMLStyleElement>(null);
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

  // Ringkasan per malam. Malam ini yang belum dicatat belum dihitung terlewat.
  const due = dates.filter((d) => d < tonight || (d === tonight && patrolDates.has(d)));
  const missingNights = due.length - nights;
  const activeRows = rows.filter((r) => r.house.status === "active");
  const checkedPerDate = dates.map((_, i) => activeRows.filter((r) => r.cells[i]).length);
  // Malam yang dicek kurang dari separuh rumah (mis. baru mulai diisi) tidak ikut rata-rata.
  const halfChecked = (i: number) => checkedPerDate[i] * 2 >= activeRows.length;
  const countedNights = dates.flatMap((d, i) => (patrolDates.has(d) && halfChecked(i) ? [i] : []));
  const partialNights = nights - countedNights.length;
  const average = countedNights.length
    ? countedNights.reduce((sum, i) => sum + dateTotals[i], 0) / countedNights.length
    : nights
      ? grandTotal / nights
      : null;
  const best = dates.reduce<number | null>((top, _, i) => (dateTotals[i] > (top === null ? 0 : dateTotals[top]) ? i : top), null);

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
      label: "Pernah tidak dicek",
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

  const editableDates = dates.filter((d) => d <= tonight);
  const cellKey = (houseId: number, date: string) => `${houseId}:${date}`;
  function setCells(keys: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }
  /** Pilih semuanya, atau lepas semuanya kalau sudah terpilih semua. */
  const toggleCells = (keys: string[]) => setCells(keys, !keys.every((k) => selected.has(k)));
  const keyAt = (target: EventTarget) => (target as HTMLElement).closest<HTMLElement>("[data-cell]")?.dataset.cell;
  // Urutan rumah seperti yang tampil, untuk memilih kotak di antara dua titik.
  const rowOrder = groups.flatMap(([, list]) => list.map((r) => r.house.id));
  const position = (key: string) => {
    const [houseId, date] = key.split(":");
    return { row: rowOrder.indexOf(Number(houseId)), col: editableDates.indexOf(date) };
  };
  /** Kotak di persegi panjang antara kotak awal seretan dan kotak di bawah mouse. */
  function dragTo(key: string) {
    const start = drag.current;
    const end = position(key);
    if (!start || end.row < 0 || end.col < 0) return;
    const next = new Set(start.base);
    for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
      for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col++) {
        const k = cellKey(rowOrder[row], editableDates[col]);
        if (start.on) next.add(k);
        else next.delete(k);
      }
    }
    setSelected(next);
  }
  /**
   * Satu penangan untuk semua kotak. Mouse: tekan lalu seret untuk memilih/melepas semua kotak di
   * antaranya (mis. seminggu, atau beberapa rumah sekaligus), seperti di spreadsheet. Sentuh: ketuk
   * satu per satu; menggeser tabel tidak ikut memilih.
   */
  const selectHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      const key = keyAt(e.target);
      if (!key || e.pointerType !== "mouse" || e.button !== 0) return;
      drag.current = { base: selected, on: !selected.has(key), ...position(key) };
      skipClick.current = true;
      dragTo(key);
    },
    onPointerOver: (e: React.PointerEvent) => {
      const key = keyAt(e.target);
      if (key && drag.current && e.buttons & 1) dragTo(key);
    },
    onClick: (e: React.MouseEvent) => {
      const key = keyAt(e.target);
      if (!key) return;
      if (skipClick.current) {
        skipClick.current = false;
        return;
      }
      setCells([key], !selected.has(key));
    },
  };
  const rowKeys = (houseId: number) => editableDates.map((d) => cellKey(houseId, d));
  // Satu malam: rumah yang tampil dan dihuni (rumah mudik tidak dicek).
  const columnKeys = (date: string) => visible.filter((r) => r.house.status === "active").map((r) => cellKey(r.house.id, date));

  return (
    <>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="shrink-0 sm:w-56">
          <p className="text-xs text-muted">Terkumpul {formatMonth(data.month)}</p>
          <p className="text-3xl font-bold leading-tight tracking-tight tabular-nums">
            {formatRupiah(grandTotal)}
          </p>
          {best !== null && (
            <p className="mt-1 text-xs text-muted">
              Tertinggi {formatRupiah(dateTotals[best])} pada{" "}
              {formatDateShort(dates[best])}
            </p>
          )}
        </div>
        <BarChart
          size="sm"
          labelEvery={7}
          className="min-w-0 flex-1"
          caption={`Jimpitan terkumpul per malam, ${formatMonth(data.month)}`}
          bars={dates.map((d, i) => ({
            key: d,
            label: String(Number(d.slice(8))),
            value: dateTotals[i],
            highlight: d === tonight && patrolDates.has(d),
            faint: patrolDates.has(d) && !halfChecked(i),
            blank: d > tonight,
            title:
              d > tonight
                ? `${formatDateShort(d)}: belum tiba`
                : patrolDates.has(d)
                  ? `${formatDateShort(d)}: ${formatRupiah(dateTotals[i])} · ${checkedPerDate[i]} dari ${activeRows.length} rumah dicek`
                  : `${formatDateShort(d)}: belum ada catatan`,
          }))}
        />
      </Card>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          label="Malam tercatat"
          value={
            <>
              {nights}
              <span className="text-sm font-medium text-muted"> dari {due.length}</span>
            </>
          }
          hint={
            missingNights > 0 ? (
              <span className="text-warn">{missingNights} malam belum ada catatan</span>
            ) : due.length > 0 ? (
              "Semua malam tercatat"
            ) : undefined
          }
        />
        <Stat
          label="Rata-rata per malam"
          value={average === null ? "–" : formatRupiah(Math.round(average))}
          hint={
            countedNights.length === 0 && nights > 0
              ? "Semua malam baru sebagian dicek"
              : partialNights > 0
                ? `Tanpa ${partialNights} malam yang belum separuh dicek`
                : nights > 0
                  ? `Dari ${nights} malam`
                  : undefined
          }
        />
        <Stat
          className="col-span-2 sm:col-span-1"
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
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(new Set());
            }}
            placeholder="Cari rumah atau nama…"
            aria-label="Cari rumah"
            className="h-10 pl-10"
          />
        </label>
        <ScrollArea className="-mx-4 overflow-x-auto lg:mx-0">
          <ChipGroup
            aria-label="Saring rumah"
            value={filter}
            onValueChange={(next) => {
              setFilter(next);
              setSelected(new Set());
            }}
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
        <div
          data-recap
          className="mt-3 rounded-2xl border border-line bg-card [--rumah-col:5.75rem] sm:[--rumah-col:12rem]"
          onMouseOver={(e) => {
            const col = (e.target as HTMLElement).closest<HTMLElement>("[data-col]")?.dataset.col;
            if (hoverStyleRef.current) {
              hoverStyleRef.current.textContent = col
                ? `[data-recap] [data-col="${col}"] { background-color: color-mix(in oklab, var(--primary) 9%, transparent); }`
                : "";
            }
          }}
          onMouseLeave={() => {
            if (hoverStyleRef.current) hoverStyleRef.current.textContent = "";
          }}
        >
          <style ref={hoverStyleRef} />
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
                  <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold sm:px-3">
                    Rumah
                  </th>
                  {dates.map((d, i) => {
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
                      <th key={d} data-col={i} className="px-px py-1.5 font-medium">
                        {editing && d <= tonight ? (
                          <button
                            type="button"
                            onClick={() => toggleCells(columnKeys(d))}
                            aria-pressed={columnKeys(d).every((k) => selected.has(k))}
                            aria-label={`Pilih semua rumah ${formatDateShort(d)}`}
                            title={`Pilih semua rumah ${formatDateShort(d)}`}
                            className={cx(
                              "flex w-full flex-col items-center rounded-md py-0.5 leading-tight hover:bg-primary/10 hover:text-primary",
                              d === tonight && "bg-primary/10 text-primary",
                            )}
                          >
                            {label}
                          </button>
                        ) : d > tonight ? (
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
              if (!(e.target instanceof HTMLElement)) return;
              for (const strip of [headRef.current, footRef.current]) {
                if (strip) strip.scrollLeft = e.target.scrollLeft;
              }
            }}
          >
            <ScrollArea className="overflow-x-auto">
              <table
                className={cx("w-full table-fixed border-collapse text-sm", editing && "select-none")}
                style={{ minWidth }}
                {...(editing ? selectHandlers : {})}
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
                          "group border-b border-line last:border-0 hover:bg-idle-soft/50",
                          r.house.status === "vacant" && "text-muted",
                        )}
                      >
                        <th
                          scope="row"
                          // Latar harus pekat (kolom ini menempel di kiri): warna sorotan barisnya dicampur.
                          className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-normal group-hover:bg-[color-mix(in_oklab,var(--idle-soft)_50%,var(--card))] sm:px-3"
                        >
                          {/* HP: label di atas, nama kecil di bawah. Layar lebar: satu baris. */}
                          <RowLabel
                            editing={editing}
                            selected={editableDates.length > 0 && rowKeys(r.house.id).every((k) => selected.has(k))}
                            onSelect={() => toggleCells(rowKeys(r.house.id))}
                            label={houseLabel(r.house)}
                          >
                          <span className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                            <span className="font-semibold leading-4 sm:leading-normal">
                              {houseLabel(r.house)}
                            </span>
                            <span className="flex h-3 min-w-0 items-center gap-1 sm:contents">
                              {r.house.status === "vacant" && (
                                <span className="shrink-0 rounded-full bg-warn-soft px-1 text-[9px] font-semibold leading-3 text-warn sm:order-last sm:px-1.5 sm:text-[10px] sm:leading-normal">
                                  mudik
                                </span>
                              )}
                              <span className="min-h-3 min-w-0 truncate text-[10px] leading-3 text-muted sm:min-h-0 sm:text-xs sm:leading-normal">
                                {r.house.ownerName ?? ""}
                              </span>
                            </span>
                          </span>
                          </RowLabel>
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
                              data-col={i}
                              className={cx(
                                "px-px py-1 text-center",
                                // Kolom malam ini disorot tipis; malam tanpa catatan diberi latar abu tipis.
                                date === tonight
                                  ? "bg-primary/5"
                                  : !recorded && !future && "bg-idle-soft/25",
                              )}
                            >
                              {editing && !future ? (
                                // Tombol biasa (bukan Base UI Button): jumlahnya bisa ribuan dalam satu tabel. Diketuk
                                // atau diseret dipilih lewat `selectHandlers` di tabel.
                                <button
                                  type="button"
                                  data-cell={cellKey(r.house.id, date)}
                                  aria-pressed={selected.has(cellKey(r.house.id, date))}
                                  aria-label={`${houseLabel(r.house)}, ${formatDateShort(date)}: ${cellText(cell, vacant)}`}
                                  // Seukuran kotaknya supaya cincin sorotan pas di kotak, bukan selebar kolom.
                                  className={cx(
                                    cellBox,
                                    "cursor-pointer transition hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                    selected.has(cellKey(r.house.id, date)) && "bg-primary/15 ring-2 ring-primary hover:ring-primary",
                                  )}
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
                {/* Baris total untuk pembaca layar; yang terlihat ada di strip bawah. */}
                <tfoot className="sr-only">
                  <tr>
                    <th scope="row">Total</th>
                    {dateTotals.map((t, i) => (
                      <td key={dates[i]}>{t > 0 ? formatRupiah(t) : "–"}</td>
                    ))}
                    <td />
                    <td>{formatRupiah(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </ScrollArea>
          </div>
          {/* Baris total menempel di bawah layar selama tabelnya terlihat, digeser bersama tabel. */}
          <div
            ref={footRef}
            aria-hidden
            className="sticky bottom-0 z-20 overflow-hidden rounded-b-[15px] border-t-2 border-line bg-card"
          >
            <table
              role="presentation"
              className="w-full table-fixed border-collapse text-sm"
              style={{ minWidth }}
            >
              <RecapCols dates={dates.length} future={future} />
              <tbody>
                <tr className="font-semibold">
                  <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left sm:px-3">
                    Total
                  </th>
                  {dateTotals.map((t, i) => (
                    // Kolomnya sempit untuk angka: tinggi batang = terkumpul malam itu, angkanya di judul.
                    <td
                      key={dates[i]}
                      data-col={i}
                      title={t > 0 ? `${formatDateShort(dates[i])}: ${formatRupiah(t)}` : undefined}
                      className="h-10 px-px py-1.5 align-bottom"
                    >
                      {t > 0 && (
                        <span
                          className="mx-auto block w-full max-w-5 rounded-sm bg-filled/70"
                          style={{ height: `${Math.max(3, (t / maxNight) * 26)}px` }}
                        />
                      )}
                    </td>
                  ))}
                  <td />
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatRupiah(grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <BulkBar
          selected={selected}
          defaultAmount={data.defaultAmount}
          onClear={() => setSelected(new Set())}
        />
      )}
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

/** Kotak persegi selebar kolom, paling besar 24px (kolom tanggal bisa lebih lebar atau lebih sempit). */
const cellBox = "mx-auto flex aspect-square w-full max-w-6 items-center justify-center rounded-[5px]";

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

/** Nama rumah di tabel; di mode isi jadi tombol untuk memilih semua malamnya (mis. warga yang bayar bulanan). */
function RowLabel({
  editing,
  selected,
  onSelect,
  label,
  children,
}: {
  editing: boolean;
  selected: boolean;
  onSelect: () => void;
  label: string;
  children: ReactNode;
}) {
  if (!editing) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Pilih semua malam ${label}`}
      title="Pilih semua malam bulan ini"
      className={cx("-mx-1 block w-[calc(100%+0.5rem)] rounded-md px-1 text-left hover:bg-primary/10", selected && "bg-primary/10 text-primary")}
    >
      {children}
    </button>
  );
}

/**
 * Bilah di bawah layar untuk mengisi semua kotak yang dipilih sekaligus: Ada (dengan nominal), Kosong,
 * atau hapus catatannya. Muncul selama ada kotak yang dipilih.
 */
function BulkBar({
  selected,
  defaultAmount,
  onClear,
}: {
  selected: ReadonlySet<string>;
  defaultAmount: number;
  onClear: () => void;
}) {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = useMutation({
    mutationFn: (status: "filled" | "empty" | "none") =>
      call(
        api.admin.riwayat.$put({
          json: {
            entries: [...selected].map((key) => {
              const [houseId, date] = key.split(":");
              return { date, houseId: Number(houseId), status, amount: status === "filled" ? Number(amount) : 0 };
            }),
          },
        }),
      ),
    onSuccess: async ({ success }) => {
      await invalidate(...CORRECTION_REFRESH);
      onClear();
      setNotice(success);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 3000);
    },
  });
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const count = selected.size;
  if (count === 0 && !notice) return null;
  return (
    <>
      {/* Ruang di bawah tabel supaya baris terakhir dan total tidak tertutup bilah ini. */}
      <div aria-hidden className="h-44 sm:h-32" />
      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:pl-[calc(16rem+0.75rem)] print:hidden">
        <div role="region" aria-label="Isi kotak terpilih" className="mx-auto max-w-3xl rounded-2xl border border-line bg-card p-3 shadow-lg">
          {count === 0 ? (
            <p role="status" className="flex items-center gap-2 text-sm font-semibold text-filled">
              <Check className="size-4" /> {notice}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {count} kotak dipilih
                  {Number(amount) > 0 && (
                    <span className="font-normal text-muted"> · Ada = {formatRupiah(count * Number(amount))}</span>
                  )}
                </p>
                <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Batal pilih" title="Batal pilih (Esc)">
                  <X className="size-4" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AmountChoice value={amount} onChange={setAmount} defaultAmount={defaultAmount} />
                <div className="flex flex-wrap gap-2 sm:ml-auto">
                  <Button size="sm" disabled={save.isPending || !(Number(amount) > 0)} onClick={() => save.mutate("filled")}>
                    Ada
                  </Button>
                  <Button variant="secondary" size="sm" disabled={save.isPending} onClick={() => save.mutate("empty")}>
                    Kosong
                  </Button>
                  <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => save.mutate("none")}>
                    Hapus catatan
                  </Button>
                </div>
              </div>
              {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Legend({ editing, defaultAmount }: { editing: boolean; defaultAmount: number }) {
  const swatch = "inline-flex size-5 items-center justify-center rounded-[4px]";
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className={cx(swatch, "bg-filled-soft ring-1 ring-inset ring-filled/15")} />
        Ada ({formatRupiah(defaultAmount)})
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cx(swatch, "bg-filled-soft text-[9px] font-semibold text-filled ring-1 ring-inset ring-filled/15")}>
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
          ? "Ketuk kotak untuk memilih (dengan mouse bisa diseret). Ketuk nama rumah untuk sebulan, tanggal untuk semalam. Lalu pilih Ada, Kosong, atau Hapus di bawah."
          : "Ketuk tanggal untuk membuka riwayat malam itu."}
      </span>
    </p>
  );
}

function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cx("p-3", className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className="whitespace-nowrap text-xl font-bold leading-tight">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
