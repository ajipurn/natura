import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Hand, LayoutList, Map as MapIcon, Pencil, ScanLine, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ErrorCard, QueryState } from "@/components/query-state";
import { ShareRecap } from "@/components/share-recap";
import { SitePlanMap } from "@/components/site-plan-map";
import { Card, cx, inputClass, PageTitle } from "@/components/ui";
import { addDays, formatDateLong, formatDateShort, formatTime, isIsoDate, rondaDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { MarkerState } from "@/lib/house-state";
import { groupByBlock, houseLabel, searchHouses } from "@/lib/houses";
import { buildRecapText, summarize } from "@/lib/recap";
import type { CollectionDTO, HouseDTO } from "@/lib/types";
import { SITE_PLAN } from "@/site-plan";
import { CorrectionForm } from "./correction-form";
import { patrolQuery } from "./queries";

type Filter = "semua" | "ada" | "kosong" | "belum";

const percent = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

/** Detail satu malam ronda (alamat `${basePath}/:tanggal`). Admin bisa mengoreksi catatan. */
export function PatrolDetail({ basePath, canCorrect }: { basePath: string; canCorrect: boolean }) {
  const date = useParams().tanggal ?? "";
  const valid = isIsoDate(date);
  const query = useQuery({ ...patrolQuery(date), enabled: valid });
  const tonight = rondaDate(new Date());

  return (
    <>
      <nav aria-label="Navigasi riwayat" className="mb-3 flex items-center justify-between gap-2 text-sm">
        <Link to={basePath} className="flex items-center gap-1.5 font-semibold text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Riwayat
        </Link>
        {valid && (
          <div className="flex items-center rounded-xl border border-line bg-card p-0.5">
            <Link
              to={`${basePath}/${addDays(date, -1)}`}
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-muted hover:bg-idle-soft hover:text-fg"
              aria-label={`Malam sebelumnya, ${formatDateShort(addDays(date, -1))}`}
            >
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">{formatDateShort(addDays(date, -1))}</span>
            </Link>
            {date < tonight ? (
              <Link
                to={`${basePath}/${addDays(date, 1)}`}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-muted hover:bg-idle-soft hover:text-fg"
                aria-label={`Malam berikutnya, ${formatDateShort(addDays(date, 1))}`}
              >
                <span className="hidden sm:inline">{formatDateShort(addDays(date, 1))}</span>
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span aria-hidden className="flex h-8 items-center px-2 text-muted/40">
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
          {({ houses, collections, settings }) => (
            <NightDetail
              date={date}
              isTonight={date === tonight}
              houses={houses}
              collections={collections}
              communityName={settings.communityName}
              defaultAmount={settings.defaultAmount}
              canCorrect={canCorrect}
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
  communityName,
  defaultAmount,
  canCorrect,
}: {
  date: string;
  isTonight: boolean;
  houses: HouseDTO[];
  collections: CollectionDTO[];
  communityName: string;
  defaultAmount: number;
  canCorrect: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("semua");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"daftar" | "denah">("daftar");
  const [editing, setEditing] = useState<number | null>(null);

  const summary = summarize(houses, collections);
  const byHouse = new Map(collections.map((c) => [c.houseId, c]));
  const markers: Record<number, MarkerState> = Object.fromEntries(
    houses.map((h) => [h.id, byHouse.get(h.id)?.status ?? (h.status === "vacant" ? "vacant" : "unchecked")]),
  );
  const stateOf = (h: HouseDTO) => byHouse.get(h.id)?.status ?? (h.status === "vacant" ? "vacant" : "none");
  const matched = search.trim() ? new Set(searchHouses(houses, search, houses.length).map((h) => h.id)) : null;
  const shown = houses
    .filter((h) => !matched || matched.has(h.id))
    .filter((h) => {
      const s = stateOf(h);
      return filter === "semua" || (filter === "ada" && s === "filled") || (filter === "kosong" && s === "empty") || (filter === "belum" && s === "none");
    });

  const tabs: [Filter, string, number][] = [
    ["semua", "Semua", houses.length],
    ["ada", "Ada", summary.filled.length],
    ["kosong", "Kosong", summary.empty.length],
    ["belum", "Belum dicek", summary.unchecked.length],
  ];

  return (
    <>
      <PageTitle title={formatDateLong(date)} />
      <header className="mb-4">
        <h1 className="flex flex-wrap items-center gap-x-2 text-2xl font-bold tracking-tight">
          {formatDateLong(date)}
          {isTonight && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">Malam ini</span>}
        </h1>
        <p className="mt-0.5 text-sm text-muted">Jimpitan {communityName}</p>
      </header>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="text-xs text-muted">Terkumpul</p>
            <p className="text-3xl font-bold tabular-nums">{formatRupiah(summary.total)}</p>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-center sm:gap-6">
            <Stat label="Ada" value={summary.filled.length} className="text-filled" />
            <Stat label="Kosong" value={summary.empty.length} className="text-empty" />
            <Stat label="Belum dicek" value={summary.unchecked.length} />
          </dl>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-idle-soft" aria-hidden>
          <div className="h-full bg-filled" style={{ width: `${percent(summary.filled.length, summary.expected)}%` }} />
          <div className="h-full bg-empty" style={{ width: `${percent(summary.empty.length, summary.expected)}%` }} />
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>
            {summary.checked} dari {summary.expected} rumah dicek
            {summary.vacant.length > 0 && ` · ${summary.vacant.length} mudik`}
          </span>
          {summary.collectors.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Users className="size-4" aria-hidden /> {summary.collectors.join(", ")}
            </span>
          )}
        </p>
        {summary.checked > 0 ? (
          <ShareRecap className="mt-4" text={buildRecapText({ communityName, date, houses, collections })} />
        ) : (
          <p className="mt-4 rounded-xl bg-idle-soft px-3 py-2.5 text-sm text-muted">
            Belum ada catatan untuk malam ini.{canCorrect && " Catatan bisa diisi per rumah lewat tombol koreksi di bawah."}
          </p>
        )}
      </Card>

      {houses.length === 0 ? (
        <p className="mt-6 text-center text-muted">Belum ada data rumah.</p>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div role="tablist" aria-label="Saring rumah" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              {tabs.map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                  className={cx(
                    "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                    filter === value ? "border-primary bg-primary text-primary-fg" : "border-line bg-card",
                  )}
                >
                  {label} {count}
                </button>
              ))}
            </div>
            <div className="flex gap-2 lg:ml-auto">
              <label className="relative block min-w-0 flex-1 lg:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari rumah atau nama…"
                  aria-label="Cari rumah"
                  className={cx(inputClass, "h-10 pl-10")}
                />
              </label>
              <div role="tablist" aria-label="Tampilan" className="flex shrink-0 rounded-xl border border-line bg-card p-0.5">
                {(
                  [
                    ["daftar", "Daftar", LayoutList],
                    ["denah", "Denah", MapIcon],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={view === value}
                    aria-label={label}
                    title={label}
                    onClick={() => setView(value)}
                    className={cx("flex size-9 items-center justify-center rounded-lg", view === value ? "bg-primary text-primary-fg" : "text-muted")}
                  >
                    <Icon className="size-5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === "denah" ? (
            <SitePlanMap
              className="mt-4"
              plan={SITE_PLAN}
              houses={houses}
              markers={markers}
              highlight={matched || filter !== "semua" ? new Set(shown.map((h) => h.id)) : null}
            />
          ) : shown.length === 0 ? (
            <p className="mt-6 text-center text-muted">Tidak ada rumah yang cocok.</p>
          ) : (
            groupByBlock(shown).map(([block, list]) => (
              <section key={block} className="mt-5" aria-label={`Blok ${block}`}>
                <h2 className="mb-2 text-sm font-semibold">
                  Blok {block} <span className="font-normal text-muted">· {list.length} rumah</span>
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {list.map((h) => {
                    const c = byHouse.get(h.id);
                    const isEditing = editing === h.id;
                    return (
                      <li key={h.id} className={cx("px-4 py-2.5", isEditing && "bg-idle-soft/50")}>
                        <div className="flex items-center gap-3">
                          <span className="w-14 shrink-0 font-bold">{houseLabel(h)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{h.ownerName ?? <span className="text-muted">—</span>}</p>
                            {c && (
                              <p className="flex items-center gap-1 text-xs text-muted">
                                {c.method === "scan" ? (
                                  <ScanLine className="size-3.5" role="img" aria-label="scan QR" />
                                ) : (
                                  <Hand className="size-3.5" role="img" aria-label="manual" />
                                )}
                                {formatTime(c.recordedAt)}
                                {c.collectorName && ` · ${c.collectorName}`}
                              </p>
                            )}
                          </div>
                          <StatusBadge status={stateOf(h)} amount={c?.amount ?? 0} />
                          {canCorrect && (
                            <button
                              type="button"
                              onClick={() => setEditing(isEditing ? null : h.id)}
                              aria-expanded={isEditing}
                              aria-label={`Koreksi ${houseLabel(h)}`}
                              title="Koreksi"
                              className={cx(
                                "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-idle-soft hover:text-fg",
                                isEditing && "bg-idle-soft text-fg",
                              )}
                            >
                              <Pencil className="size-4" />
                            </button>
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

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    // Angka di atas label, tapi urutan dt → dd tetap untuk pembaca layar.
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cx("text-2xl font-bold tabular-nums", className)}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status, amount }: { status: "filled" | "empty" | "vacant" | "none"; amount: number }) {
  const styles = {
    filled: "bg-filled-soft text-filled",
    empty: "bg-empty-soft text-empty",
    vacant: "border border-dashed border-line text-muted",
    none: "bg-idle-soft text-muted",
  }[status];
  const label = {
    filled: formatRupiah(amount),
    empty: "Kosong",
    vacant: "Mudik",
    none: "Belum dicek",
  }[status];
  return <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", styles)}>{label}</span>;
}
