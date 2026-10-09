import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  History,
  Table2,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, cx } from "@/components/ui";
import {
  addDays,
  formatDateLong,
  formatDateShort,
  formatMonth,
} from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { NightPicker } from "./night-picker";
import { patrolsQuery } from "./queries";
import { adminPath } from "@/lib/app-paths";

type Patrol = {
  date: string;
  filled: number;
  empty: number;
  checked: number;
  unchecked: number;
  expected: number;
  total: number;
  collectors: string | null;
};
/** Baris daftar: malam yang tercatat, atau malam-malam berurutan tanpa catatan (tanggal menurun). */
type Item =
  | { kind: "night"; patrol: Patrol }
  | { kind: "gap"; dates: string[] };

/** Chip tanggal yang ditampilkan untuk malam-malam berurutan tanpa catatan. */
const MAX_GAP_CHIPS = 7;

const percent = (part: number, whole: number) =>
  whole ? Math.min(100, (part / whole) * 100) : 0;

/**
 * Malam ini sampai malam tercatat paling lama, dikelompokkan per bulan. Malam tanpa catatan ikut
 * tampil (berurutan digabung) supaya yang terlewat kelihatan.
 */
function timeline(patrols: Patrol[], today: string) {
  const byDate = new Map(patrols.map((p) => [p.date, p]));
  const oldest = patrols[patrols.length - 1].date;
  const months = new Map<string, Item[]>();
  for (let d = today; d >= oldest; d = addDays(d, -1)) {
    const items = months.get(d.slice(0, 7)) ?? [];
    months.set(d.slice(0, 7), items);
    const patrol = byDate.get(d);
    const last = items[items.length - 1];
    if (patrol) items.push({ kind: "night", patrol });
    else if (last?.kind === "gap") last.dates.push(d);
    else items.push({ kind: "gap", dates: [d] });
  }
  return [...months];
}

/** Daftar malam ronda per bulan. `basePath` = alamat halaman ini di app (mis. /petugas/riwayat). */
export function PatrolList({ basePath }: { basePath: string }) {
  const query = useQuery(patrolsQuery);
  // Rekap bulanan dan pengisian catatan hanya ada di dashboard admin.
  const isAdmin = basePath === adminPath("/riwayat");

  return (
    <>
      <PageHeader
        title="Riwayat ronda"
        subtitle={
          isAdmin
            ? "Buka malam mana pun untuk melihat, mengisi, atau mengoreksi catatannya."
            : "Malam-malam ronda yang tercatat."
        }
        action={
          <NightPicker
            basePath={basePath}
            triggerClassName="shrink-0"
            hint={
              isAdmin
                ? "Malam tanpa titik belum ada catatannya. Pilih untuk mengisinya."
                : undefined
            }
          >
            <CalendarDays className="size-4" /> Pilih tanggal
          </NightPicker>
        }
      />
      <QueryState query={query}>
        {({ patrols, today }) => {
          if (patrols.length === 0) {
            return (
              <Card className="py-10 text-center">
                <History className="mx-auto size-10 text-muted" />
                <p className="mt-2 font-semibold">Belum ada catatan ronda</p>
                <p className="mt-1 text-sm text-muted">
                  {isAdmin
                    ? "Malam ronda muncul di sini setelah petugas mencatat. Catatan malam mana pun juga bisa diisi lewat Pilih tanggal."
                    : "Malam ronda muncul di sini setelah petugas mencatat rumah pertama."}
                </p>
              </Card>
            );
          }
          return (
            <div className="space-y-7">
              {timeline(patrols, today).map(([month, items]) => (
                <MonthSection
                  key={month}
                  month={month}
                  items={items}
                  basePath={basePath}
                  today={today}
                  rekapPath={isAdmin ? adminPath(`/rekap?bulan=${month}`) : null}
                />
              ))}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

function MonthSection({
  month,
  items,
  basePath,
  today,
  rekapPath,
}: {
  month: string;
  items: Item[];
  basePath: string;
  today: string;
  rekapPath: string | null;
}) {
  const nights = items.flatMap((i) => (i.kind === "night" ? [i.patrol] : []));
  const missing = items.reduce(
    (n, i) => n + (i.kind === "gap" ? i.dates.length : 0),
    0,
  );
  const total = nights.reduce((sum, p) => sum + p.total, 0);

  return (
    <section aria-label={formatMonth(month)}>
      <div className="mb-2.5 flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h2 className="font-semibold">{formatMonth(month)}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span>{nights.length} malam tercatat</span>
            {missing > 0 && (
              <>
                <span aria-hidden className="size-1 rounded-full bg-line" />
                <span className="text-warn">{missing} belum ada catatan</span>
              </>
            )}
            {rekapPath && (
              <>
                <span aria-hidden className="size-1 rounded-full bg-line" />
                <Link
                  to={rekapPath}
                  className="flex items-center gap-1 font-semibold text-primary hover:underline"
                >
                  <Table2 className="size-3.5" /> Rekap
                </Link>
              </>
            )}
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-[11px] text-muted">Terkumpul</span>
          <span className="font-bold tabular-nums">{formatRupiah(total)}</span>
        </p>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {items.map((item) =>
          item.kind === "night" ? (
            <NightRow
              key={item.patrol.date}
              patrol={item.patrol}
              to={`${basePath}/${item.patrol.date}`}
              tonight={item.patrol.date === today}
            />
          ) : (
            <GapRow
              key={item.dates[0]}
              dates={item.dates}
              basePath={basePath}
              today={today}
            />
          ),
        )}
      </ul>
    </section>
  );
}

function NightRow({
  patrol: p,
  to,
  tonight,
}: {
  patrol: Patrol;
  to: string;
  tonight: boolean;
}) {
  const { checked, unchecked, expected } = p;
  return (
    <li>
      <Link
        to={to}
        aria-label={`${formatDateLong(p.date)}${tonight ? ", malam ini" : ""}: ${formatRupiah(p.total)}, ${p.filled} ada, ${p.empty} kosong${unchecked ? `, ${unchecked} belum dicek` : ""}`}
        className="group flex items-center gap-3 px-3 py-3 hover:bg-idle-soft/50 active:bg-idle-soft sm:gap-4 sm:px-4"
      >
        <DateTile date={p.date} tonight={tonight} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex min-w-0 items-baseline gap-2">
              <span className="text-lg font-bold leading-tight tabular-nums">
                {formatRupiah(p.total)}
              </span>
              {tonight && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  Malam ini
                </span>
              )}
            </p>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {checked}/{expected} dicek
            </span>
          </div>
          <div
            className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-idle-soft"
            aria-hidden
          >
            <div
              className="h-full bg-filled"
              style={{ width: `${percent(p.filled, expected)}%` }}
            />
            <div
              className="h-full bg-empty"
              style={{ width: `${percent(p.empty, expected)}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <Count color="bg-filled" value={p.filled} label="ada" />
            <Count color="bg-empty" value={p.empty} label="kosong" />
            {unchecked > 0 && (
              <Count color="bg-muted/50" value={unchecked} label="belum dicek" />
            )}
            {p.collectors && (
              <span className="flex min-w-0 items-center gap-1 sm:ml-auto">
                <Users className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{p.collectors}</span>
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/** Satu malam tanpa catatan (bisa dibuka), atau beberapa malam berurutan sebagai chip tanggal. */
function GapRow({
  dates,
  basePath,
  today,
}: {
  dates: string[];
  basePath: string;
  today: string;
}) {
  if (dates.length === 1) {
    const [date] = dates;
    return (
      <li>
        <Link
          to={`${basePath}/${date}`}
          aria-label={`${formatDateLong(date)}${date === today ? ", malam ini" : ""}: belum ada catatan`}
          className="group flex items-center gap-3 px-3 py-2.5 hover:bg-idle-soft/50 active:bg-idle-soft sm:gap-4 sm:px-4"
        >
          <DateTile date={date} tonight={date === today} missing />
          <p className="min-w-0 flex-1 text-sm text-muted">
            Belum ada catatan
            {date === today && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Malam ini
              </span>
            )}
          </p>
          <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
      </li>
    );
  }
  const shown = dates.slice(0, MAX_GAP_CHIPS);
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
      <span className="flex w-11 shrink-0 flex-col items-center rounded-xl border border-dashed border-muted/40 py-1.5 leading-none text-muted">
        <span className="text-lg font-bold tabular-nums">{dates.length}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">
          malam
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">Belum ada catatan</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {shown.map((date) => (
            <Link
              key={date}
              to={`${basePath}/${date}`}
              aria-label={`${formatDateLong(date)}: belum ada catatan`}
              className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              {formatDateShort(date)}
            </Link>
          ))}
          {dates.length > shown.length && (
            <span className="px-1 py-1 text-xs text-muted">
              +{dates.length - shown.length} malam lagi
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** Hari dan tanggal di kiri baris. `missing` = malam tanpa catatan (garis putus-putus). */
function DateTile({
  date,
  tonight,
  missing = false,
}: {
  date: string;
  tonight: boolean;
  missing?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex w-11 shrink-0 flex-col items-center rounded-xl border py-1.5 leading-none",
        missing
          ? "border-dashed border-muted/40 text-muted"
          : "border-line bg-bg/70",
        tonight && "border-primary/40 bg-primary/10 text-primary",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {formatDateShort(date).split(",")[0]}
      </span>
      <span className="mt-0.5 text-lg font-bold tabular-nums">
        {Number(date.slice(8))}
      </span>
    </span>
  );
}

function Count({
  color,
  value,
  label,
}: {
  color: string;
  value: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden className={cx("size-1.5 rounded-full", color)} />
      <span className="font-semibold text-fg tabular-nums">{value}</span>{" "}
      {label}
    </span>
  );
}
