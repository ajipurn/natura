import { usePermission } from "@/client/permissions";
import { Field } from "@base-ui/react/field";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  ListFilter,
  Pencil,
  ReceiptText,
  Search,
  Sheet,
  Table2,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { BarChart } from "@/components/bar-chart";
import { SwitchControl } from "@/components/choice";
import { Menu } from "@/components/menu";
import { QueryState } from "@/components/query-state";
import { PaymentCadenceBadge } from "@/components/payment-cadence-badge";
import { ScrollArea } from "@/components/scroll-area";
import { Select } from "@/components/select";
import { SegmentedControl } from "@/components/toggle-group";
import { api, call, errorMessage } from "@/client/api";
import { invalidate } from "@/client/query";
import {
  Alert,
  Button,
  Card,
  Input,
  PageHeader,
  buttonClass,
  cx,
} from "@/components/ui";
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
import {
  BILLING_LABEL,
  CADENCE_LABEL,
  type BillingPeriod,
  type PaymentCadence,
} from "@/lib/payments";
import { buildRecapCsv } from "@/lib/recap-csv";
import { buildRecapSheets } from "@/lib/recap-xlsx";
import type { MonthCell, MonthRecap } from "@/lib/types";
import { recapQuery } from "./queries";
import { SheetsLinkDialog } from "./sheets-link";
import { PaymentPanel } from "./payments/payment-panel";
import { adminPath } from "@/lib/app-paths";

type Filter = "semua" | "kosong" | "tidak-dicek";
type RecapData = MonthRecap & { month: string; defaultAmount: number };
type Sort = "rumah" | "total" | "kosong";
type CadenceFilter = "all" | PaymentCadence;
type RecapView = "houses" | "payments";
type DateView = "recorded" | "month";
type AmountColumn = {
  key: "daily" | "weekly" | "monthly" | "rapel";
  field: "collectedTotal" | "weeklyTotal" | "monthlyTotal" | "rapelTotal";
  label: string;
  hint: string;
};

const CADENCE_FILTERS = [
  { value: "all", label: "Semua" },
  { value: "daily", label: CADENCE_LABEL.daily },
  { value: "weekly", label: CADENCE_LABEL.weekly },
  { value: "monthly", label: CADENCE_LABEL.monthly },
] as const;

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
  const canSettings = usePermission("settings", true);
  const canCorrect = usePermission("patrols", true);
  const [params] = useSearchParams();
  const tonight = rondaDate(new Date());
  const thisMonth = tonight.slice(0, 7);
  const bulan = params.get("bulan") ?? "";
  const month =
    isMonth(bulan) && bulan <= shiftMonth(thisMonth, 12) ? bulan : thisMonth;
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
        subtitle="Ringkasan jimpitan dan catatan setiap rumah."
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
                hint: "Per rumah, per malam, dan pembayaran periode",
                icon: (
                  <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-filled" />
                ),
                onSelect: exportXlsx,
                disabled: !ready || exporting,
              },
              {
                label: "CSV",
                hint: "Tabel polos untuk aplikasi lain",
                icon: (
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted" />
                ),
                onSelect: () => query.data && downloadCsv(month, query.data),
                disabled: !ready,
              },
              ...(canSettings ? [{
                label: "Google Sheets",
                hint: "Link IMPORTDATA yang ikut terbarui",
                icon: <Sheet className="mt-0.5 size-4 shrink-0 text-primary" />,
                onSelect: () => setSheetsOpen(true),
              }] : []),
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

      <nav
        aria-label="Pilih bulan"
        className="mb-4 inline-flex items-center rounded-xl border border-line bg-card p-0.5"
      >
        <Link
          to={adminPath(`/rekap?bulan=${shiftMonth(month, -1)}`)}
          className={buttonClass("ghost", "icon-sm")}
          aria-label={`Bulan sebelumnya (${formatMonth(shiftMonth(month, -1))})`}
        >
          <ChevronLeft className="size-5" />
        </Link>
        <span className="min-w-36 px-2 text-center font-semibold">
          {formatMonth(month)}
        </span>
        {month < shiftMonth(thisMonth, 12) ? (
          <Link
            to={adminPath(`/rekap?bulan=${shiftMonth(month, 1)}`)}
            className={buttonClass("ghost", "icon-sm")}
            aria-label={`Bulan berikutnya (${formatMonth(shiftMonth(month, 1))})`}
          >
            <ChevronRight className="size-5" />
          </Link>
        ) : (
          <span
            aria-hidden
            className="flex size-8 items-center justify-center text-muted/40"
          >
            <ChevronRight className="size-5" />
          </span>
        )}
      </nav>

      <QueryState query={query}>
        {(data) => (
          <div className={cx(query.isPlaceholderData && "opacity-60")}>
            <RecapBody
              data={data}
              editing={editing && canCorrect}
              onEditingChange={setEditing}
              tonight={tonight}
            />
          </div>
        )}
      </QueryState>
    </>
  );
}

/**
 * Tabel menampilkan malam yang tercatat. Seluruh kalender tersedia lewat filter tanggal dan
 * otomatis ditampilkan saat koreksi, agar malam yang belum dicatat tetap bisa diisi.
 */
function RecapBody({
  data,
  editing,
  onEditingChange,
  tonight,
}: {
  data: RecapData;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  tonight: string;
}) {
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("cari") ?? "");
  const [filter, setFilter] = useState<Filter>("semua");
  const [cadence, setCadence] = useState<CadenceFilter>("all");
  const [showVacant, setShowVacant] = useState(true);
  const [sort, setSort] = useState<Sort>("rumah");
  const canFinance = usePermission("finance");
  const canCorrect = usePermission("patrols", true);
  const [view, setView] = useState<RecapView>("houses");
  const [dateView, setDateView] = useState<DateView>("recorded");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);
  // const [guideOpen, setGuideOpen] = useState(false);
  const filtersId = useId();
  const trendId = useId();
  // const guideId = useId();
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
  const drag = useRef<{
    base: ReadonlySet<string>;
    on: boolean;
    row: number;
    col: number;
  } | null>(null);
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
  const periodAt = (houseId: number, date: string) =>
    data.paymentPeriods?.find(
      (p) => p.houseId === houseId && p.start <= date && p.end >= date,
    );
  const { rows, dateTotals, grandTotal } = summarizeMonth({ ...data, dates });
  const monthlyTotal = rows.reduce((sum, r) => sum + r.monthlyTotal, 0);
  const weeklyTotal = rows.reduce((sum, r) => sum + r.weeklyTotal, 0);
  const rapelTotal = rows.reduce((sum, r) => sum + r.rapelTotal, 0);
  const nights = data.dates.length;
  const maxNight = Math.max(...dateTotals, 1);
  const tableDates =
    editing || dateView === "month"
      ? dates
      : dates.filter((d) => patrolDates.has(d));
  const tableIndices = tableDates.map((d) => dates.indexOf(d));
  const paymentColumns: AmountColumn[] = [
    {
      key: "daily",
      field: "collectedTotal",
      label: "Harian",
      hint: "Uang yang diambil saat ronda",
    },
    ...(rapelTotal > 0 ? [{ key: "rapel", field: "rapelTotal", label: "Rapel", hint: "Pembayaran untuk hari kosong sebelumnya" } as const] : []),
    ...(weeklyTotal > 0 ||
    Object.values(data.paymentCadences ?? {}).some((c) => c.includes("weekly"))
      ? [
          {
            key: "weekly",
            field: "weeklyTotal",
            label: "Mingguan",
            hint: "Pembayaran untuk periode mingguan",
          } as const,
        ]
      : []),
    ...(monthlyTotal > 0 ||
    Object.values(data.paymentCadences ?? {}).some((c) => c.includes("monthly"))
      ? [
          {
            key: "monthly",
            field: "monthlyTotal",
            label: "Bulanan",
            hint: "Pembayaran untuk periode bulanan",
          } as const,
        ]
      : []),
  ];
  // Malam yang belum tiba (selalu di akhir bulan) diberi kolom sempit.
  const future = tableDates.filter((d) => d > tonight).length;
  // Kolom tanggal berbagi sisa lebar, tapi tidak lebih sempit dari ini (lihat `RecapCols`).
  const minWidth = `calc(var(--rumah-col) + ${tableDates.length - future} * ${DATE_COL} + ${future} * ${FUTURE_COL} + ${ADA_COL} + ${paymentColumns.length} * ${PERIOD_COL} + ${TOTAL_COL})`;

  const stats = rows.map((r) => {
    const cadences: PaymentCadence[] = data.paymentCadences?.[r.house.id] ?? [
      "daily",
    ];
    const statusAt = (i: number) => {
      if (dates[i] > tonight) return undefined;
      return r.nights[i].status;
    };
    return {
      ...r,
      cadences,
      filledCount: r.cells.filter((_, i) => statusAt(i) === "filled").length,
      empty: r.cells.filter((_, i) => statusAt(i) === "empty").length,
      // Rumah kosong/mudik tidak dihitung "tidak dicek", begitu juga malam tanpa catatan sama sekali.
      unchecked:
        r.house.status === "active"
          ? r.cells.filter(
              (c, i) =>
                !c &&
                patrolDates.has(dates[i]) &&
                !periodAt(r.house.id, dates[i]),
            ).length
          : 0,
    };
  });

  // Ringkasan per malam. Malam ini yang belum dicatat belum dihitung terlewat.
  const due = dates.filter(
    (d) => d < tonight || (d === tonight && patrolDates.has(d)),
  );
  const missingNights = due.length - nights;
  const activeRows = rows.filter((r) => r.house.status === "active");
  const checkedPerDate = dates.map(
    (date, i) =>
      activeRows.filter((r) => r.cells[i] || periodAt(r.house.id, date)).length,
  );
  // Malam yang dicek kurang dari separuh rumah (mis. baru mulai diisi) tidak ikut rata-rata.
  const halfChecked = (i: number) => checkedPerDate[i] * 2 >= activeRows.length;
  const countedNights = dates.flatMap((d, i) =>
    patrolDates.has(d) && halfChecked(i) ? [i] : [],
  );
  const partialNights = nights - countedNights.length;
  const average = countedNights.length
    ? countedNights.reduce((sum, i) => sum + dateTotals[i], 0) /
      countedNights.length
    : nights
      ? dateTotals.reduce((sum, n) => sum + n, 0) / nights
      : null;
  const best = dates.reduce<number | null>(
    (top, _, i) =>
      dateTotals[i] > (top === null ? 0 : dateTotals[top]) ? i : top,
    null,
  );

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
    .filter((r) => showVacant || r.house.status !== "vacant")
    .filter((r) => !matched || matched.has(r.house.id))
    .filter((r) => cadence === "all" || r.cadences.includes(cadence))
    .filter(filters.find((f) => f.value === filter)!.match)
    .sort((a, b) =>
      sort === "total"
        ? b.total - a.total
        : sort === "kosong"
          ? b.empty - a.empty || a.filledCount - b.filledCount
          : 0,
    );
  const shownTotals = {
    daily: visible.reduce((sum, r) => sum + r.collectedTotal, 0),
    rapel: visible.reduce((sum, r) => sum + r.rapelTotal, 0),
    weekly: visible.reduce((sum, r) => sum + r.weeklyTotal, 0),
    monthly: visible.reduce((sum, r) => sum + r.monthlyTotal, 0),
    total: visible.reduce((sum, r) => sum + r.total, 0),
  };
  const shownDateTotals = dates.map((_, i) =>
    visible.reduce((sum, r) => {
      const cell = r.cells[i];
      return sum + (cell?.status === "filled" ? cell.amount : 0);
    }, 0),
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
  const toggleCells = (keys: string[]) =>
    setCells(keys, !keys.every((k) => selected.has(k)));
  const keyAt = (target: EventTarget) =>
    (target as HTMLElement).closest<HTMLElement>("[data-cell]")?.dataset.cell;
  // Urutan rumah seperti yang tampil, untuk memilih kotak di antara dua titik.
  const rowOrder = groups.flatMap(([, list]) => list.map((r) => r.house.id));
  const position = (key: string) => {
    const [houseId, date] = key.split(":");
    return {
      row: rowOrder.indexOf(Number(houseId)),
      col: editableDates.indexOf(date),
    };
  };
  /** Kotak di persegi panjang antara kotak awal seretan dan kotak di bawah mouse. */
  function dragTo(key: string) {
    const start = drag.current;
    const end = position(key);
    if (!start || end.row < 0 || end.col < 0) return;
    const next = new Set(start.base);
    for (
      let row = Math.min(start.row, end.row);
      row <= Math.max(start.row, end.row);
      row++
    ) {
      for (
        let col = Math.min(start.col, end.col);
        col <= Math.max(start.col, end.col);
        col++
      ) {
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
      drag.current = {
        base: selected,
        on: !selected.has(key),
        ...position(key),
      };
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
  const rowKeys = (houseId: number) =>
    editableDates
      .map((d) => cellKey(houseId, d));
  // Satu malam: rumah yang tampil dan dihuni (rumah mudik tidak dicek).
  const columnKeys = (date: string) =>
    visible
      .filter((r) => r.house.status === "active")
      .map((r) => cellKey(r.house.id, date));

  return (
    <>
      <Card className="mb-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <dt className="text-sm text-muted">Total jimpitan</dt>
            <dd className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
              {formatRupiah(grandTotal)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Hasil ronda harian</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatRupiah(grandTotal - monthlyTotal - weeklyTotal)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Pembayaran periode</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatRupiah(monthlyTotal + weeklyTotal)}
            </dd>
          </div>
          <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:block">
            <div>
              <dt className="text-xs text-muted">Malam tercatat</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {nights}{" "}
                <span className="text-sm font-normal text-muted">malam</span>
              </dd>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="md:-ml-3 md:mt-1"
              aria-expanded={trendOpen}
              aria-controls={trendOpen ? trendId : undefined}
              onClick={() => setTrendOpen(!trendOpen)}
            >
              Grafik ronda{" "}
              <ChevronDown
                className={cx("size-4", trendOpen && "rotate-180")}
              />
            </Button>
          </div>
        </dl>
        {trendOpen && (
          <div
            id={trendId}
            className="mt-5 space-y-4 border-t border-line pt-4"
          >
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-muted">Rata-rata per malam</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {average === null ? "–" : formatRupiah(Math.round(average))}
                </p>
                {partialNights > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    Tanpa {partialNights} malam yang belum separuh dicek.
                  </p>
                )}
              </div>
              {best !== null && (
                <div>
                  <p className="text-xs text-muted">Ronda tertinggi</p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {formatRupiah(dateTotals[best])}{" "}
                    <span className="font-normal text-muted">
                      · {formatDateShort(dates[best])}
                    </span>
                  </p>
                </div>
              )}
              {missingNights > 0 && (
                <p className="text-xs text-warn">
                  {missingNights} malam belum ada catatan.
                </p>
              )}
            </div>
            <BarChart
              size="lg"
              formatValue={formatAmountShort}
              className="min-w-0"
              caption={`Hasil ronda harian, ${formatMonth(data.month)}`}
              bars={dates.flatMap((d, i) =>
                d > tonight
                  ? []
                  : [
                      {
                        key: d,
                        label: String(Number(d.slice(8))),
                        value: dateTotals[i],
                        highlight: d === tonight && patrolDates.has(d),
                        faint: patrolDates.has(d) && !halfChecked(i),
                        title: patrolDates.has(d)
                          ? `${formatDateShort(d)}: ${formatRupiah(dateTotals[i])} · ${checkedPerDate[i]} dari ${activeRows.length} rumah selesai`
                          : `${formatDateShort(d)}: belum ada catatan`,
                      },
                    ],
              )}
            />
            <p className="text-xs text-muted">
              Grafik hanya menunjukkan uang yang diambil saat ronda. Pembayaran
              mingguan dan bulanan dihitung terpisah.
            </p>
          </div>
        )}
      </Card>

      {canFinance && <SegmentedControl
        aria-label="Tampilan rekap"
        value={view}
        onValueChange={(next) => {
          setView(next);
          onEditingChange(false);
          setSelected(new Set());
        }}
        options={[
          { value: "houses", label: "Per rumah", icon: Table2 },
          { value: "payments", label: "Pembayaran", icon: ReceiptText },
        ]}
        size="sm"
        className="mb-5 w-fit max-w-full"
      />}

      {canFinance && view === "payments" ? (
        <PaymentPanel key={data.month} month={data.month} />
      ) : (
        <section aria-label="Rekap per rumah">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Catatan rumah</h2>
              <p className="mt-0.5 text-xs text-muted">
                {visible.length === stats.length
                  ? stats.length
                  : `${visible.length} dari ${stats.length}`}{" "}
                rumah ·{" "}
                {editing || dateView === "month"
                  ? "Seluruh tanggal bulan ini"
                  : "Malam yang tercatat"}
              </p>
            </div>
            {canCorrect && <Button
              variant={editing ? "primary" : "secondary"}
              size="sm"
              className="shrink-0 whitespace-nowrap"
              aria-pressed={editing}
              onClick={() => onEditingChange(!editing)}
            >
              {editing ? (
                <Check className="size-4" />
              ) : (
                <Pencil className="size-4" />
              )}
              {editing ? "Selesai" : "Ubah catatan"}
            </Button>}
          </div>
          {editing && <p className="mb-3 text-sm text-muted">Mode koreksi menampilkan catatan harian asli, termasuk rumah mingguan/bulanan. Status pembayaran periode tetap otomatis. Catat pembayaran periode melalui tampilan Pembayaran.</p>}
          {nights === 0 && (
            <p className="mb-3 text-sm text-muted">
              Belum ada ronda tercatat untuk bulan ini.
              {canCorrect && data.month <= tonight.slice(0, 7) &&
                " Gunakan Ubah catatan untuk mulai mengisi."}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
              <label className="relative block min-w-0 flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelected(new Set());
                  }}
                  placeholder="Cari rumah atau nama…"
                  aria-label="Cari rumah"
                  className="h-9 pl-9 sm:text-sm"
                />
              </label>
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={filtersOpen}
                aria-controls={filtersOpen ? filtersId : undefined}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <ListFilter className="size-4" /> Filter
                {(filter !== "semua" || cadence !== "all") && (
                  <span className="text-primary">
                    {Number(filter !== "semua") + Number(cadence !== "all")}
                  </span>
                )}
              </Button>
            </div>
            <Field.Root className="ml-auto flex min-h-9 items-center gap-3 text-sm">
              <Field.Label className="cursor-pointer">Mudik/kosong</Field.Label>
              <SwitchControl
                checked={showVacant}
                onCheckedChange={(show) => {
                  setShowVacant(show);
                  setSelected(new Set());
                  drag.current = null;
                }}
              />
            </Field.Root>
          </div>
          {filtersOpen && (
            <div
              id={filtersId}
              className="mt-3 grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              <Select
                label="Status catatan"
                value={filter}
                onValueChange={(next) => {
                  setFilter(next);
                  setSelected(new Set());
                }}
                options={filters.map((f) => ({
                  value: f.value,
                  label: f.label,
                  hint: String(stats.filter(f.match).length),
                }))}
                className="h-9 sm:text-sm"
              />
              <Select
                label="Cara bayar"
                value={cadence}
                onValueChange={(next) => {
                  setCadence(next);
                  setSelected(new Set());
                }}
                options={CADENCE_FILTERS.map((f) => ({
                  ...f,
                  hint: String(
                    stats.filter(
                      (r) => f.value === "all" || r.cadences.includes(f.value),
                    ).length,
                  ),
                }))}
                className="h-9 sm:text-sm"
              />
              <Select
                label="Urutkan"
                value={sort}
                onValueChange={setSort}
                options={SORTS}
                className="h-9 sm:text-sm"
              />
              <Select
                label="Tanggal ditampilkan"
                value={dateView}
                onValueChange={setDateView}
                disabled={editing}
                options={[
                  { value: "recorded", label: "Malam tercatat" },
                  { value: "month", label: "Seluruh bulan" },
                ]}
                className="h-9 sm:text-sm"
              />
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
              {(filter !== "semua" || cadence !== "all" || search.trim() || !showVacant) && (
                <>
                  <span>
                    {[
                      filter !== "semua" &&
                        filters.find((f) => f.value === filter)?.label,
                      cadence !== "all" && CADENCE_LABEL[cadence],
                      !showVacant && "Tanpa rumah mudik/kosong",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Hasil pencarian"}
                    . Total tabel mengikuti hasil filter.
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilter("semua");
                      setCadence("all");
                      setShowVacant(true);
                      setSelected(new Set());
                    }}
                  >
                    Reset filter
                  </Button>
                </>
              )}
              {editing && (
                <span className="text-primary">
                  Pilih kotak untuk mengisi atau mengubah catatan.
                </span>
              )}
            </div>
            {/* <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              aria-expanded={guideOpen}
              aria-controls={guideOpen ? guideId : undefined}
              onClick={() => setGuideOpen(!guideOpen)}
            >
              Arti warna{" "}
              <ChevronDown
                className={cx("size-4", guideOpen && "rotate-180")}
              />
            </Button> */}
          </div>
          {/* {guideOpen && <div id={guideId} className="mb-3 rounded-xl bg-idle-soft/50 px-3 pb-3 pt-px">
          <Legend editing={editing} defaultAmount={data.defaultAmount} />
          <p className="mt-2 text-xs text-muted">Harian menunjukkan uang hasil ronda. Rumah mingguan/bulanan mengikuti status pembayaran periode, kecuali sudah tercatat ada isinya saat ronda. Lihat rinciannya di tampilan Pembayaran.</p>
        </div>} */}

          {visible.length === 0 ? (
            <Card className="mt-3 py-10 text-center text-muted">
              {rows.length
                ? "Tidak ada rumah yang cocok. Coba ubah pencarian atau filter."
                : "Belum ada data rumah."}
            </Card>
          ) : (
            <div
              data-recap
              className="mt-1 rounded-2xl border border-line bg-card [--rumah-col:6.5rem] sm:[--rumah-col:12rem]"
              onMouseOver={(e) => {
                const col = (e.target as HTMLElement).closest<HTMLElement>(
                  "[data-col]",
                )?.dataset.col;
                if (hoverStyleRef.current) {
                  hoverStyleRef.current.textContent = col
                    ? `[data-recap] [data-col="${col}"] { background-color: color-mix(in oklab, var(--primary) 9%, transparent); }`
                    : "";
                }
              }}
              onMouseLeave={() => {
                if (hoverStyleRef.current)
                  hoverStyleRef.current.textContent = "";
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
                  <RecapCols
                    dates={tableDates.length}
                    future={future}
                    paymentColumns={paymentColumns.length}
                  />
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold sm:px-3">
                        Rumah
                      </th>
                      {tableDates.map((d) => {
                        const i = dates.indexOf(d);
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
                          <th
                            key={d}
                            data-col={i}
                            className="px-px py-1.5 font-medium"
                          >
                            {editing && d <= tonight ? (
                              <button
                                type="button"
                                onClick={() => toggleCells(columnKeys(d))}
                                aria-pressed={columnKeys(d).every((k) =>
                                  selected.has(k),
                                )}
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
                                to={adminPath(`/riwayat/${d}`)}
                                title={`Buka riwayat ${formatDateShort(d)}${patrolDates.has(d) ? "" : " (belum ada catatan)"}`}
                                aria-label={`Buka riwayat ${formatDateShort(d)}`}
                                className={cx(
                                  "flex flex-col items-center rounded-md py-0.5 leading-tight hover:bg-idle-soft hover:text-fg",
                                  !patrolDates.has(d) && "opacity-50",
                                  d === tonight &&
                                    "bg-primary/10 text-primary opacity-100",
                                )}
                              >
                                {label}
                              </Link>
                            )}
                          </th>
                        );
                      })}
                      <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                        Terisi
                      </th>
                      {paymentColumns.map((column) => (
                        <th
                          key={column.key}
                          className="whitespace-nowrap px-2 py-2 text-right font-semibold"
                          title={column.hint}
                        >
                          {column.label}
                        </th>
                      ))}
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
                    className={cx(
                      "w-full table-fixed border-collapse text-sm",
                      editing && "select-none",
                    )}
                    style={{ minWidth }}
                    {...(editing ? selectHandlers : {})}
                  >
                    <RecapCols
                      dates={tableDates.length}
                      future={future}
                      paymentColumns={paymentColumns.length}
                    />
                    {/* Judul kolom untuk pembaca layar; yang terlihat ada di strip di atas. */}
                    <thead className="sr-only">
                      <tr>
                        <th>Rumah</th>
                        {tableDates.map((d) => (
                          <th key={d}>{formatDateShort(d)}</th>
                        ))}
                        <th>Terisi</th>
                        {paymentColumns.map((column) => (
                          <th key={column.key}>{column.label}</th>
                        ))}
                        <th>Total</th>
                      </tr>
                    </thead>
                    {groups.map(([block, list]) => (
                      <tbody key={block ?? "semua"}>
                        {block && (
                          <tr className="border-b border-line bg-bg/60">
                            <th
                              colSpan={
                                tableDates.length + paymentColumns.length + 3
                              }
                              className="px-3 py-2 text-left text-xs font-medium text-muted"
                            >
                              {/* Sel ini selebar tabel, jadi yang menempel di kiri saat digeser teksnya. */}
                              <span className="sticky left-3 inline-block">
                                Blok {block} · {list.length} rumah ·{" "}
                                {formatRupiah(
                                  list.reduce((s, r) => s + r.total, 0),
                                )}
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
                              className="sticky left-0 z-10 bg-card px-2 py-2.5 text-left font-normal group-hover:bg-[color-mix(in_oklab,var(--idle-soft)_50%,var(--card))] sm:px-3"
                            >
                              {/* HP: label di atas, nama kecil di bawah. Layar lebar: satu baris. */}
                              <RowLabel
                                editing={
                                  editing && rowKeys(r.house.id).length > 0
                                }
                                selected={
                                  rowKeys(r.house.id).length > 0 &&
                                  rowKeys(r.house.id).every((k) =>
                                    selected.has(k),
                                  )
                                }
                                onSelect={() =>
                                  toggleCells(rowKeys(r.house.id))
                                }
                                label={houseLabel(r.house)}
                              >
                                <span className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                                  <span className="shrink-0 whitespace-nowrap font-semibold leading-4 sm:leading-normal">
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
                                {r.cadences.some((c) => c !== "daily") && (
                                  <span
                                    className="mt-0.5 block"
                                    title={`Cara bayar yang berlaku pada ${formatMonth(data.month)}${r.cadences.length > 1 ? "; berubah dalam bulan ini" : ""}`}
                                  >
                                    {r.cadences.length > 1 ? (
                                      <span className="text-[10px] font-medium leading-3 text-muted">
                                        <span aria-hidden>{r.cadences.map((c) => CADENCE_LABEL[c]).join(" → ")}</span>
                                        <span className="sr-only">Cara bayar berubah dari {r.cadences.map((c) => CADENCE_LABEL[c]).join(" menjadi ")}.</span>
                                      </span>
                                    ) : (
                                      <PaymentCadenceBadge
                                        cadence={r.cadences[0]}
                                        className="px-1.5 text-[10px] leading-3"
                                      />
                                    )}
                                  </span>
                                )}
                              </RowLabel>
                            </th>
                            {tableIndices.map((i) => {
                              const cell = r.cells[i];
                              const date = dates[i];
                              const vacant = r.house.status === "vacant";
                              const recorded = patrolDates.has(date);
                              const future = date > tonight;
                              const period = vacant
                                ? undefined
                                : periodAt(r.house.id, date);
                              const rapel = r.nights[i].rapel;
                              const content = future ? null : !editing && rapel && cell?.status !== "filled" ? (
                                <span role="img" aria-label={`${formatDateShort(date)}: Rapel lunas, catatan ronda ${cellText(cell, vacant)}`} title={`${formatDateShort(date)}: Rapel lunas · ${formatRupiah(rapel.rapelAmount ?? 0)}; catatan ronda ${cellText(cell, vacant)}`} className={cx(cellBox, "bg-filled-soft text-xs font-bold text-filled ring-1 ring-inset ring-filled/15")}>R</span>
                              ) : !editing && period &&
                                cell?.status !== "filled" ? (
                                <PeriodCell period={period} date={date} />
                              ) : (
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
                                      : !recorded &&
                                          !future &&
                                          "bg-idle-soft/25",
                                  )}
                                >
                                  {editing && !future ? (
                                    // Tombol biasa (bukan Base UI Button): jumlahnya bisa ribuan dalam satu tabel. Diketuk
                                    // atau diseret dipilih lewat `selectHandlers` di tabel.
                                    <button
                                      type="button"
                                      data-cell={cellKey(r.house.id, date)}
                                      aria-pressed={selected.has(
                                        cellKey(r.house.id, date),
                                      )}
                                      aria-label={`${houseLabel(r.house)}, ${formatDateShort(date)}: ${cellText(cell, vacant)}`}
                                      // Seukuran kotaknya supaya cincin sorotan pas di kotak, bukan selebar kolom.
                                      className={cx(
                                        cellBox,
                                        "cursor-pointer transition hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                        selected.has(
                                          cellKey(r.house.id, date),
                                        ) &&
                                          "bg-primary/15 ring-2 ring-primary hover:ring-primary",
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
                            {paymentColumns.map((column) => (
                              <td
                                key={column.key}
                                className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums"
                                title={column.hint}
                              >
                                {r[column.field] > 0
                                  ? formatRupiah(r[column.field])
                                  : "–"}
                              </td>
                            ))}
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
                        {tableIndices.map((i) => (
                          <td key={dates[i]}>
                            {shownDateTotals[i] > 0
                              ? formatRupiah(shownDateTotals[i])
                              : "–"}
                          </td>
                        ))}
                        <td />
                        {paymentColumns.map((column) => (
                          <td key={column.key}>
                            {formatRupiah(shownTotals[column.key])}
                          </td>
                        ))}
                        <td>{formatRupiah(shownTotals.total)}</td>
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
                  <RecapCols
                    dates={tableDates.length}
                    future={future}
                    paymentColumns={paymentColumns.length}
                  />
                  <tbody>
                    <tr className="font-semibold">
                      <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left sm:px-3">
                        Total
                      </th>
                      {tableIndices.map((i) => {
                        const t = shownDateTotals[i];
                        return (
                          // Kolomnya sempit untuk angka: tinggi batang = terkumpul malam itu, angkanya di judul.
                          <td
                            key={dates[i]}
                            data-col={i}
                            title={
                              t > 0
                                ? `${formatDateShort(dates[i])}: ${formatRupiah(t)}`
                                : undefined
                            }
                            className="h-10 px-px py-1.5 align-bottom"
                          >
                            {t > 0 && (
                              <span
                                className="mx-auto block w-full max-w-5 rounded-sm bg-filled/70"
                                style={{
                                  height: `${Math.max(3, (t / maxNight) * 26)}px`,
                                }}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td />
                      {paymentColumns.map((column) => (
                        <td
                          key={column.key}
                          className="whitespace-nowrap px-2 py-2 text-right tabular-nums"
                        >
                          {formatRupiah(shownTotals[column.key])}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatRupiah(shownTotals.total)}
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
        </section>
      )}
    </>
  );
}

const DATE_COL = "2rem";
const FUTURE_COL = "1rem";
const ADA_COL = "3.5rem";
const PERIOD_COL = "7rem";
const TOTAL_COL = "7rem";

/**
 * Lebar kolom (`table-fixed`), sama untuk strip judul dan isi tabel supaya kolomnya sejajar.
 * Kolom Rumah selebar `--rumah-col`; kolom tanggal berbagi sisa lebar (tidak lebih sempit dari
 * `DATE_COL`), jadi kotaknya tidak terpisah jauh dari nama rumah. `future` kolom terakhir (malam
 * yang belum tiba) dibuat sempit.
 */
function RecapCols({
  dates,
  future,
  paymentColumns,
}: {
  dates: number;
  future: number;
  paymentColumns: number;
}) {
  return (
    <colgroup>
      <col style={{ width: "var(--rumah-col)" }} />
      {Array.from({ length: dates }, (_, i) => (
        <col
          key={i}
          style={i >= dates - future ? { width: FUTURE_COL } : undefined}
        />
      ))}
      <col style={{ width: ADA_COL }} />
      {Array.from({ length: paymentColumns }, (_, i) => (
        <col key={`amount-${i}`} style={{ width: PERIOD_COL }} />
      ))}
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
const cellBox =
  "mx-auto flex aspect-square w-full max-w-6 items-center justify-center rounded-[5px]";

function PeriodCell({ period, date }: { period: BillingPeriod; date: string }) {
  const paid = period.status === "paid";
  return (
    <span
      title={`${formatDateShort(date)}: ${CADENCE_LABEL[period.cadence]} · ${BILLING_LABEL[period.status]} (otomatis)`}
      className={cx(
        cellBox,
        "text-xs font-bold ring-1 ring-inset",
        paid
          ? "bg-filled-soft text-filled ring-filled/15"
          : "bg-empty-soft text-empty ring-empty/15",
      )}
    >
      {paid ? <Check className="size-3" aria-hidden /> : "×"}
    </span>
  );
}

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
        className={cx(
          cellBox,
          "bg-filled-soft text-[9px] font-semibold leading-none text-filled ring-1 ring-inset ring-filled/15",
        )}
      >
        {cell.amount !== defaultAmount && formatAmountShort(cell.amount)}
      </span>
    );
  }
  if (cell?.status === "empty") {
    return (
      <span
        title={title}
        className={cx(cellBox, "bg-empty-soft text-xs font-bold text-empty")}
      >
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
        !recorded
          ? "border-line/70"
          : vacant
            ? "border-line"
            : "border-muted/40",
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
      className={cx(
        "-mx-1 block w-[calc(100%+0.5rem)] rounded-md px-1 text-left hover:bg-primary/10",
        selected && "bg-primary/10 text-primary",
      )}
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
              return {
                date,
                houseId: Number(houseId),
                status,
                amount: status === "filled" ? Number(amount) : 0,
              };
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
        <div
          role="region"
          aria-label="Isi kotak terpilih"
          className="mx-auto max-w-3xl rounded-2xl border border-line bg-card p-3 shadow-lg"
        >
          {count === 0 ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm font-semibold text-filled"
            >
              <Check className="size-4" /> {notice}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {count} kotak dipilih
                  {Number(amount) > 0 && (
                    <span className="font-normal text-muted">
                      {" "}
                      · Ada = {formatRupiah(count * Number(amount))}
                    </span>
                  )}
                </p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClear}
                  aria-label="Batal pilih"
                  title="Batal pilih (Esc)"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AmountChoice
                  value={amount}
                  onChange={setAmount}
                  defaultAmount={defaultAmount}
                />
                <div className="flex flex-wrap gap-2 sm:ml-auto">
                  <Button
                    size="sm"
                    disabled={save.isPending || !(Number(amount) > 0)}
                    onClick={() => save.mutate("filled")}
                  >
                    Ada
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={save.isPending}
                    onClick={() => save.mutate("empty")}
                  >
                    Kosong
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={save.isPending}
                    onClick={() => save.mutate("none")}
                  >
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

// function Legend({
//   editing,
//   defaultAmount,
// }: {
//   editing: boolean;
//   defaultAmount: number;
// }) {
//   const swatch = "inline-flex size-5 items-center justify-center rounded-[4px]";
//   return (
//     <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
//       <span className="flex items-center gap-1.5">
//         <span
//           className={cx(
//             swatch,
//             "bg-filled-soft ring-1 ring-inset ring-filled/15",
//           )}
//         />
//         Ada ({formatRupiah(defaultAmount)})
//       </span>
//       <span className="flex items-center gap-1.5">
//         <span
//           className={cx(
//             swatch,
//             "bg-filled-soft text-[9px] font-semibold text-filled ring-1 ring-inset ring-filled/15",
//           )}
//         >
//           1rb
//         </span>
//         Nominal lain
//       </span>
//       <span className="flex items-center gap-1.5">
//         <span
//           className={cx(swatch, "bg-empty-soft text-xs font-bold text-empty")}
//         >
//           ×
//         </span>
//         Kosong
//       </span>
//       <span className="flex items-center gap-1.5">
//         <span className={cx(swatch, "border border-dashed border-muted/40")} />
//         Tidak dicek
//       </span>
//       <span className="flex items-center gap-1.5">
//         <span
//           className={cx(
//             swatch,
//             "border border-dashed border-line/70 bg-idle-soft/40",
//           )}
//         />
//         Malam tanpa catatan
//       </span>
//       <span
//         className={cx(
//           "basis-full sm:basis-auto",
//           editing && "font-semibold text-fg",
//         )}
//       >
//         {editing
//           ? "Ketuk kotak untuk memilih (dengan mouse bisa diseret). Ketuk nama rumah untuk sebulan, tanggal untuk semalam. Lalu pilih Ada, Kosong, atau Hapus di bawah."
//           : "Ketuk tanggal untuk membuka riwayat malam itu."}
//       </span>
//     </p>
//   );
// }
