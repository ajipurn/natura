import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Hand,
  Home,
  LayoutList,
  ListChecks,
  Map as MapIcon,
  Pencil,
  ScanLine,
  ScrollText,
  Search,
  Users,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ErrorCard, QueryState } from "@/components/query-state";
import { ScrollArea } from "@/components/scroll-area";
import { ShareRecap } from "@/components/share-recap";
import { SitePlanMap } from "@/components/site-plan-map";
import { ChipGroup, SegmentedControl } from "@/components/toggle-group";
import { Button, Card, Input, PageTitle, cx } from "@/components/ui";
import {
  addDays,
  formatDateLong,
  formatDateShort,
  formatTime,
  isIsoDate,
  rondaDate,
} from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { rondaHouseState } from "@/lib/house-state";
import { CADENCE_LABEL, type BillingPeriod } from "@/lib/payments";
import { groupByBlock, houseLabel, searchHouses } from "@/lib/houses";
import { buildRecapText, summarize } from "@/lib/recap";
import type { CollectionDTO, HouseDTO } from "@/lib/types";
import { SITE_PLAN } from "@/site-plan";
import {
  BulkFillForm,
  CorrectionDialog,
  CorrectionForm,
  type CorrectionTarget,
} from "./correction-form";
import { NightPicker } from "./night-picker";
import { patrolQuery } from "./queries";
import { PatrolStamp } from "./patrol-stamp";

type Filter = "semua" | "ada" | "kosong" | "belum";
type View = "daftar" | "denah";
type Tab = "rumah" | "log";

/** Tab "Log catatan" (hanya admin); komponennya dari app admin. */
export type NightLogSlot = {
  /** Peringatan singkat di tab Rumah, dengan tautan ke tab log. */
  Alerts: ComponentType<{ date: string; logTo: string }>;
  Log: ComponentType<{ date: string }>;
};

const TABS = [
  { value: "rumah", label: "Rumah", icon: Home },
  { value: "log", label: "Log catatan", icon: ScrollText },
] as const;

const VIEWS = [
  { value: "daftar", label: "Daftar", icon: LayoutList },
  { value: "denah", label: "Denah", icon: MapIcon },
] as const;

const percent = (part: number, whole: number) =>
  whole ? (part / whole) * 100 : 0;

/**
 * Detail satu malam ronda (alamat `${basePath}/:tanggal`). Admin bisa mengisi dan mengoreksi catatan,
 * dan dengan `log` mendapat tab "Log catatan" (`?tab=log`).
 */
export function PatrolDetail({
  basePath,
  canCorrect,
  log,
}: {
  basePath: string;
  canCorrect: boolean;
  log?: NightLogSlot;
}) {
  const date = useParams().tanggal ?? "";
  const valid = isIsoDate(date);
  const query = useQuery({ ...patrolQuery(date), enabled: valid });
  const tonight = rondaDate(new Date());
  const [params] = useSearchParams();
  const tab: Tab = log && params.get("tab") === "log" ? "log" : "rumah";
  // Pindah malam tetap di tab yang sama.
  const search = tab === "log" ? "?tab=log" : "";

  return (
    <>
      <nav
        aria-label="Navigasi riwayat"
        className="mb-3 flex items-center justify-between gap-2 text-sm"
      >
        <Link
          to={basePath}
          className="flex items-center gap-1.5 font-semibold text-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" /> Riwayat
        </Link>
        {valid && (
          <div className="flex items-center rounded-xl border border-line bg-card p-0.5">
            <Link
              to={`${basePath}/${addDays(date, -1)}${search}`}
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-muted hover:bg-idle-soft hover:text-fg"
              aria-label={`Malam sebelumnya, ${formatDateShort(addDays(date, -1))}`}
            >
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">
                {formatDateShort(addDays(date, -1))}
              </span>
            </Link>
            <NightPicker
              basePath={basePath}
              search={search}
              selected={date}
              label="Pilih tanggal lain"
              variant="ghost"
              size="icon-sm"
              triggerClassName="text-muted hover:text-fg"
            >
              <CalendarDays className="size-4" />
            </NightPicker>
            {date < tonight ? (
              <Link
                to={`${basePath}/${addDays(date, 1)}${search}`}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-muted hover:bg-idle-soft hover:text-fg"
                aria-label={`Malam berikutnya, ${formatDateShort(addDays(date, 1))}`}
              >
                <span className="hidden sm:inline">
                  {formatDateShort(addDays(date, 1))}
                </span>
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span
                aria-hidden
                className="flex h-8 items-center px-2 text-muted/40"
              >
                <ChevronRight className="size-4" />
              </span>
            )}
          </div>
        )}
      </nav>
      {!valid ? (
        <ErrorCard message="Tanggal tidak valid." />
      ) : (
        <QueryState query={query}>
          {({ houses, collections, settings, paymentPeriods }) => (
            <NightDetail
              date={date}
              isTonight={date === tonight}
              houses={houses}
              collections={collections}
              paymentPeriods={paymentPeriods}
              communityName={settings.communityName}
              defaultAmount={settings.defaultAmount}
              // Malam yang belum tiba belum bisa diisi.
              canCorrect={canCorrect && date <= tonight}
              log={log}
              tab={tab}
              logTo={`${basePath}/${date}?tab=log`}
            />
          )}
        </QueryState>
      )}
    </>
  );
}

function NightDetail({
  date,
  isTonight,
  houses,
  collections,
  paymentPeriods = [],
  communityName,
  defaultAmount,
  canCorrect,
  log,
  tab,
  logTo,
}: {
  date: string;
  isTonight: boolean;
  houses: HouseDTO[];
  collections: CollectionDTO[];
  paymentPeriods?: BillingPeriod[];
  communityName: string;
  defaultAmount: number;
  canCorrect: boolean;
  log?: NightLogSlot;
  tab: Tab;
  logTo: string;
}) {
  const [, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("semua");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("daftar");
  const [editing, setEditing] = useState<number | null>(null);
  const [bulkFilling, setBulkFilling] = useState(false);
  // Rumah yang diketuk di denah (dikoreksi lewat dialog).
  const [mapTarget, setMapTarget] = useState<CorrectionTarget | null>(null);
  const [mapTargetOpen, setMapTargetOpen] = useState(false);

  const summary = summarize(houses, collections, paymentPeriods);
  const byHouse = new Map(collections.map((c) => [c.houseId, c]));
  const periodOf = (h: HouseDTO) => h.status === "active" ? paymentPeriods.find((p) => p.houseId === h.id) : undefined;
  const markers: Record<number, ReturnType<typeof rondaHouseState>> = Object.fromEntries(
    houses.map((h) => [h.id, rondaHouseState(h, byHouse.get(h.id), periodOf(h))]),
  );
  const stateOf = (h: HouseDTO) => {
    const state = markers[h.id];
    return state === "unchecked" ? "none" : state;
  };
  const matched = search.trim()
    ? new Set(searchHouses(houses, search, houses.length).map((h) => h.id))
    : null;
  const shown = houses
    .filter((h) => !matched || matched.has(h.id))
    .filter((h) => {
      const s = stateOf(h);
      return (
        filter === "semua" ||
        (filter === "ada" && s === "filled") ||
        (filter === "kosong" && s === "empty") ||
        (filter === "belum" && s === "none")
      );
    });

  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "semua", label: "Semua", count: houses.length },
    { value: "ada", label: "Ada", count: summary.filled.length },
    { value: "kosong", label: "Kosong", count: summary.empty.length },
    { value: "belum", label: "Belum dicek", count: summary.unchecked.length },
  ];

  return (
    <>
      <PageTitle title={formatDateLong(date)} />
      <header className="mb-4">
        <h1 className="flex flex-wrap items-center gap-x-2 text-2xl font-bold tracking-tight">
          {formatDateLong(date)}
          {isTonight && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">
              Malam ini
            </span>
          )}
        </h1>
        <p className="mt-0.5 text-sm text-muted">Jimpitan {communityName}</p>
      </header>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="text-xs text-muted">Terkumpul</p>
            <p className="text-3xl font-bold tabular-nums">
              {formatRupiah(summary.total)}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-center sm:gap-6">
            <Stat
              label="Ada"
              value={summary.filled.length}
              className="text-filled"
            />
            <Stat
              label="Kosong"
              value={summary.empty.length}
              className="text-empty"
            />
            <Stat label="Belum dicek" value={summary.unchecked.length} />
          </dl>
        </div>
        <div
          className="mt-3 flex h-2 overflow-hidden rounded-full bg-idle-soft"
          aria-hidden
        >
          <div
            className="h-full bg-filled"
            style={{
              width: `${percent(summary.filled.length, summary.expected)}%`,
            }}
          />
          <div
            className="h-full bg-empty"
            style={{
              width: `${percent(summary.empty.length, summary.expected)}%`,
            }}
          />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span>
            {summary.checked} dari {summary.expected} rumah dicek
            {summary.vacant.length > 0 && ` · ${summary.vacant.length} mudik`}
          </span>
          {summary.collectors.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Users className="size-4" aria-hidden />{" "}
              {summary.collectors.join(", ")}
            </span>
          )}
          <PatrolStamp date={date} checked={summary.checked} expected={summary.expected} />
        </p>
        {summary.checked > 0 ? (
          <ShareRecap
            className="mt-4"
            text={buildRecapText({ communityName, date, houses, collections, paymentPeriods })}
          />
        ) : (
          <p className="mt-4 rounded-xl bg-idle-soft px-3 py-2.5 text-sm text-muted">
            Belum ada catatan untuk malam ini.
            {canCorrect &&
              " Isi semua rumah sekaligus, lalu ubah yang berbeda lewat tombol koreksi di daftar."}
          </p>
        )}
        {paymentPeriods.length > 0 && <p className="mt-3 text-xs text-muted">Status periode otomatis dari pembayaran; tidak perlu discan. Nominal terkumpul hanya uang yang diambil saat ronda.</p>}
        {canCorrect &&
          summary.unchecked.length > 0 &&
          (bulkFilling ? (
            <section
              aria-label="Isi yang belum dicek"
              className="mt-4 max-w-xl border-t border-line pt-3"
            >
              <p className="text-sm font-semibold">
                Isi {summary.unchecked.length} rumah yang belum dicek
              </p>
              <p className="mb-2.5 text-xs text-muted">
                Semuanya dicatat sama.
                {summary.vacant.length > 0 && " Rumah mudik tidak ikut."} Rumah
                yang berbeda bisa dikoreksi sesudahnya.
              </p>
              <BulkFillForm
                date={date}
                houseIds={summary.unchecked.map((h) => h.id)}
                defaultAmount={defaultAmount}
                onDone={() => setBulkFilling(false)}
              />
            </section>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => setBulkFilling(true)}
            >
              <ListChecks className="size-4" /> Isi yang belum dicek (
              {summary.unchecked.length})
            </Button>
          ))}
      </Card>

      {log && (
        <>
          {tab === "rumah" && <log.Alerts date={date} logTo={logTo} />}
          <SegmentedControl
            aria-label="Isi detail malam"
            value={tab}
            onValueChange={(next) => setParams(next === "log" ? { tab: "log" } : {}, { replace: true })}
            options={TABS}
            className="mt-5 w-fit"
          />
        </>
      )}

      {log && tab === "log" ? (
        <div className="mt-4">
          <log.Log date={date} />
        </div>
      ) : houses.length === 0 ? (
        <p className="mt-6 text-center text-muted">Belum ada data rumah.</p>
      ) : (
        <>
          <div className={cx("flex flex-col gap-3 lg:flex-row lg:items-center", log ? "mt-4" : "mt-5")}>
            <ScrollArea className="-mx-4 overflow-x-auto lg:mx-0">
              <ChipGroup
                aria-label="Saring rumah"
                value={filter}
                onValueChange={setFilter}
                options={filters}
                className="w-max min-w-full px-4 lg:px-0"
              />
            </ScrollArea>
            <div className="flex gap-2 lg:ml-auto">
              <label className="relative block min-w-0 flex-1 lg:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari rumah atau nama…"
                  aria-label="Cari rumah"
                  className="pl-10"
                />
              </label>
              <SegmentedControl
                aria-label="Tampilan"
                iconOnly
                value={view}
                onValueChange={setView}
                options={VIEWS}
                className="shrink-0"
              />
            </div>
          </div>

          {view === "denah" ? (
            <>
              {canCorrect && (
                <p className="mt-4 flex items-center gap-1.5 text-sm text-muted">
                  <Pencil className="size-4 shrink-0" aria-hidden />
                  Ketuk rumah di denah untuk mengisi atau mengubah catatannya.
                </p>
              )}
              <SitePlanMap
                className={canCorrect ? "mt-2" : "mt-4"}
                plan={SITE_PLAN}
                houses={houses}
                markers={markers}
                selectedId={mapTargetOpen ? mapTarget?.house.id : null}
                onHouseClick={
                  canCorrect
                    ? (h) => {
                        const c = byHouse.get(h.id);
                        setMapTarget({
                          house: h,
                          date,
                          current: c,
                          note: c
                            ? `Dicatat ${formatTime(c.recordedAt)}${c.collectorName ? ` oleh ${c.collectorName}` : ""}.`
                            : undefined,
                        });
                        setMapTargetOpen(true);
                      }
                    : undefined
                }
                highlight={
                  matched || filter !== "semua"
                    ? new Set(shown.map((h) => h.id))
                    : null
                }
              />
              <CorrectionDialog
                target={mapTarget}
                open={mapTargetOpen}
                onClose={() => setMapTargetOpen(false)}
                defaultAmount={defaultAmount}
              />
            </>
          ) : shown.length === 0 ? (
            <p className="mt-6 text-center text-muted">
              Tidak ada rumah yang cocok.
            </p>
          ) : (
            groupByBlock(shown).map(([block, list]) => (
              <section
                key={block}
                className="mt-5"
                aria-label={`Blok ${block}`}
              >
                <h2 className="mb-2 text-sm font-semibold">
                  Blok {block}{" "}
                  <span className="font-normal text-muted">
                    · {list.length} rumah
                  </span>
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {list.map((h) => {
                    const c = byHouse.get(h.id);
                    const isEditing = editing === h.id;
                    return (
                      <li
                        key={h.id}
                        className={cx(
                          "px-4 py-2.5",
                          isEditing && "bg-idle-soft/50",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-14 shrink-0 font-bold">
                            {houseLabel(h)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                              {h.ownerName ?? (
                                <span className="text-muted">—</span>
                              )}
                            </p>
                            {c && (
                              <p className="flex items-center gap-1 text-xs text-muted">
                                {c.method === "scan" ? (
                                  <ScanLine
                                    className="size-3.5"
                                    role="img"
                                    aria-label="scan QR"
                                  />
                                ) : (
                                  <Hand
                                    className="size-3.5"
                                    role="img"
                                    aria-label="manual"
                                  />
                                )}
                                {formatTime(c.recordedAt)}
                                {c.collectorName && ` · ${c.collectorName}`}
                              </p>
                            )}
                          </div>
                          <StatusBadge
                            status={stateOf(h)}
                            amount={c?.amount ?? 0}
                            period={periodOf(h)}
                          />
                          {canCorrect && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setEditing(isEditing ? null : h.id)
                              }
                              aria-expanded={isEditing}
                              aria-label={`Koreksi ${houseLabel(h)}`}
                              title="Koreksi"
                              className={cx(
                                isEditing && "bg-idle-soft text-fg",
                              )}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          )}
                        </div>
                        {isEditing && (
                          <CorrectionForm
                            date={date}
                            houseId={h.id}
                            status={c?.status ?? "none"}
                            amount={c?.amount ?? 0}
                            defaultAmount={defaultAmount}
                            onDone={() => setEditing(null)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    // Angka di atas label, tapi urutan dt → dd tetap untuk pembaca layar.
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cx("text-2xl font-bold tabular-nums", className)}>
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({
  status,
  amount,
  period,
}: {
  status: "filled" | "empty" | "vacant" | "none";
  amount: number;
  period?: BillingPeriod;
}) {
  const styles = {
    filled: "bg-filled-soft text-filled",
    empty: "bg-empty-soft text-empty",
    vacant: "border border-dashed border-line text-muted",
    none: "bg-idle-soft text-muted",
  }[status];
  const label = period && (period.status === "paid" || status !== "filled")
    ? `${CADENCE_LABEL[period.cadence]} · ${period.status === "paid" ? "Sudah bayar" : "Belum bayar"}`
    : {
    filled: formatRupiah(amount),
    empty: "Kosong",
    vacant: "Mudik",
    none: "Belum dicek",
  }[status];
  return (
    <span
      className={cx(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
        styles,
      )}
    >
      {label}
    </span>
  );
}
