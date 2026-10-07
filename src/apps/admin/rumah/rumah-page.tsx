import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Home, LayoutGrid, Map as MapIcon, MapPin, Plus, Printer, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Legend, LegendItem } from "@/components/map-legend";
import { QueryState } from "@/components/query-state";
import { ScrollArea } from "@/components/scroll-area";
import { SitePlanMap } from "@/components/site-plan-map";
import { ChipGroup, SegmentedControl } from "@/components/toggle-group";
import { Button, Card, Input, PageHeader, buttonClass, cx } from "@/components/ui";
import { fitGeoTransform } from "@/lib/geo";
import type { MarkerState } from "@/lib/house-state";
import { groupByBlock, houseLabel, searchHouses } from "@/lib/houses";
import { CADENCE_LABEL } from "@/lib/payments";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import { housesQuery, planAnchorsQuery, usersQuery } from "../queries";
import { AddHouseDialog, EditHouseDialog, type AdminHouse } from "./house-dialog";
import { PlanCalibration } from "./plan-calibration";
import { RegisterPlanHouses } from "./register-plan-houses";

type Filter = "semua" | "dihuni" | "kosong" | "petugas" | "tanpa-nama";
type View = "daftar" | "denah";
type NewHouse = { block: string; number: string };

const FILTERS: { value: Filter; label: string; match: (h: AdminHouse, hasAccount: boolean) => boolean }[] = [
  { value: "semua", label: "Semua", match: () => true },
  { value: "dihuni", label: "Dihuni", match: (h) => h.status === "active" },
  { value: "kosong", label: "Kosong/mudik", match: (h) => h.status === "vacant" },
  { value: "petugas", label: "Rumah petugas", match: (_, hasAccount) => hasAccount },
  { value: "tanpa-nama", label: "Tanpa nama", match: (h) => !h.ownerName },
];

const VIEWS = [
  { value: "daftar", label: "Daftar", icon: LayoutGrid },
  { value: "denah", label: "Denah", icon: MapIcon },
] as const;

export function RumahPage() {
  const query = useQuery(housesQuery);
  const users = useQuery(usersQuery).data?.users ?? [];
  const [params, setParams] = useSearchParams();
  const view: View = params.get("tampilan") === "denah" ? "denah" : "daftar";
  // `?tampilan=denah&lokasi=1`: atur titik acuan GPS di denah (untuk "Lokasi saya" di app petugas).
  const calibrating = view === "denah" && params.get("lokasi") === "1";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  // `?ubah=12` (mis. dari Peta ronda) langsung membuka dialog ubah rumah itu.
  const [editing, setEditing] = useState<number | null>(() => Number(params.get("ubah")) || null);
  const [adding, setAdding] = useState<NewHouse | null>(null);

  return (
    <QueryState query={query}>
      {({ houses, origin }) => {
        // Akun petugas per rumah: nama warga rumah itu diambil dari akunnya.
        const accounts = new Map<number, string[]>();
        for (const u of users) if (u.houseId) accounts.set(u.houseId, [...(accounts.get(u.houseId) ?? []), u.name]);
        const counts = Object.fromEntries(
          FILTERS.map((f) => [f.value, houses.filter((h) => f.match(h, accounts.has(h.id))).length]),
        ) as Record<Filter, number>;
        const match = FILTERS.find((f) => f.value === filter)!.match;
        const found = search.trim() ? searchHouses(houses, search, houses.length) : houses;
        const shown = found.filter((h) => match(h, accounts.has(h.id)));
        const narrowed = Boolean(search.trim()) || filter !== "semua";
        const editingHouse = editing === null ? undefined : houses.find((h) => h.id === editing);
        const blockCount = new Set(houses.map((h) => h.block)).size;

        return (
          <>
            <PageHeader
              title="Data rumah"
              subtitle={houses.length ? `${houses.length} rumah · ${blockCount} blok` : undefined}
              action={
                <div className="flex shrink-0 gap-2">
                  {houses.length > 0 && (
                    <Link to="/admin/rumah/cetak" className={buttonClass("secondary", "sm")} title="Cetak QR">
                      <Printer className="size-4" /> <span className="max-sm:sr-only">Cetak QR</span>
                    </Link>
                  )}
                  <Button size="sm" onClick={() => setAdding({ block: "", number: "" })}>
                    <Plus className="size-4" /> Tambah
                  </Button>
                </div>
              }
            />

            {houses.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Home className="size-6" />
                </span>
                <div>
                  <p className="font-semibold">Belum ada rumah</p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    Tambahkan rumah per blok, misalnya nomor 1-20 sekaligus, atau daftarkan semua kavling dari denah.
                  </p>
                </div>
                <div className="flex flex-wrap items-start justify-center gap-2">
                  <Button size="sm" onClick={() => setAdding({ block: "", number: "" })}>
                    <Plus className="size-4" /> Tambah rumah
                  </Button>
                  <RegisterPlanHouses count={matchPlan(SITE_PLAN, houses).missing.length} />
                </div>
              </Card>
            ) : calibrating ? (
              <>
                <Link
                  to="/admin/rumah?tampilan=denah"
                  className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
                >
                  <ArrowLeft className="size-4" /> Kembali ke denah rumah
                </Link>
                <PlanCalibration houses={houses} />
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <label className="relative block min-w-0 flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
                    <Input
                      type="search"
                      value={search}
                      onValueChange={setSearch}
                      placeholder="Cari nomor atau nama…"
                      aria-label="Cari rumah"
                      className="pl-10"
                    />
                  </label>
                  <SegmentedControl
                    aria-label="Tampilan"
                    compact
                    value={view}
                    onValueChange={(next) => setParams(next === "denah" ? { tampilan: "denah" } : {}, { replace: true })}
                    options={VIEWS}
                    className="ml-auto shrink-0"
                  />
                </div>
                <ScrollArea className="-mx-4 mb-5 overflow-x-auto lg:mx-0">
                  <ChipGroup
                    aria-label="Saring rumah"
                    value={filter}
                    onValueChange={setFilter}
                    options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))}
                    className="w-max min-w-full px-4 lg:px-0"
                  />
                </ScrollArea>

                {view === "denah" ? (
                  <HouseMap
                    houses={houses}
                    highlight={narrowed ? new Set(shown.map((h) => h.id)) : null}
                    onOpen={setEditing}
                    onAdd={setAdding}
                  />
                ) : shown.length === 0 ? (
                  <Card className="text-center text-muted">{search.trim() ? "Tidak ada rumah yang cocok." : "Tidak ada rumah di sini."}</Card>
                ) : (
                  <div className="space-y-6">
                    {groupByBlock(shown).map(([block, list]) => (
                      <BlockSection key={block} block={block} houses={list} accounts={accounts} onOpen={setEditing} />
                    ))}
                  </div>
                )}
              </>
            )}

            <AddHouseDialog initial={adding} onClose={() => setAdding(null)} houses={houses} />
            <EditHouseDialog
              house={editingHouse}
              accounts={(editingHouse && accounts.get(editingHouse.id)) ?? []}
              origin={origin}
              onClose={() => {
                setEditing(null);
                if (params.has("ubah")) setParams(view === "denah" ? { tampilan: "denah" } : {}, { replace: true });
              }}
            />
          </>
        );
      }}
    </QueryState>
  );
}

function BlockSection({
  block,
  houses,
  accounts,
  onOpen,
}: {
  block: string;
  houses: AdminHouse[];
  accounts: Map<number, string[]>;
  onOpen: (id: number) => void;
}) {
  const vacant = houses.filter((h) => h.status === "vacant").length;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-2">
          <span className="font-bold">Blok {block}</span>
          <span className="text-sm text-muted">
            {houses.length} rumah{vacant ? ` · ${vacant} mudik` : ""}
          </span>
        </h2>
        <Link
          to={`/admin/rumah/cetak?blok=${encodeURIComponent(block)}`}
          className={cx(buttonClass("ghost", "sm"), "-mr-2")}
          title={`Cetak QR blok ${block}`}
        >
          <Printer className="size-4" /> <span className="max-sm:sr-only">Cetak QR blok</span>
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {houses.map((h) => (
          <li key={h.id}>
            <HouseTile house={h} hasAccount={accounts.has(h.id)} onOpen={() => onOpen(h.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HouseTile({ house, hasAccount, onOpen }: { house: AdminHouse; hasAccount: boolean; onOpen: () => void }) {
  const vacant = house.status === "vacant";
  const cadenceLabel = CADENCE_LABEL[house.paymentCadence];
  return (
    <Button
      variant="plain"
      onClick={onOpen}
      className={cx(
        "flex size-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        // Rumah kosong/mudik: garis putus-putus tanpa latar, seperti kavling kosong.
        vacant ? "border-dashed border-muted/40" : "border-line bg-card",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cx("text-base font-bold tabular-nums", vacant && "text-muted")}>{houseLabel(house)}</span>
        {vacant && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">mudik</span>}
      </span>
      <span className="flex w-full min-w-0 items-center gap-1.5 text-sm">
        {hasAccount && <UserRound className="size-3.5 shrink-0 text-primary" aria-label="Rumah petugas" />}
        {house.ownerName ? (
          <span className={cx("truncate", vacant ? "text-muted" : "text-fg/80")}>{house.ownerName}</span>
        ) : (
          <span className="italic text-muted/70">Belum ada nama</span>
        )}
      </span>
      {cadenceLabel && (
        <span
          className="mt-1 self-start rounded-full bg-idle-soft px-2 py-0.5 text-[11px] font-medium text-fg/80"
          aria-label={`Jimpitan ${cadenceLabel.toLowerCase()}`}
        >
          {cadenceLabel}
        </span>
      )}
    </Button>
  );
}

/**
 * Rumah di denah: ketuk rumah untuk mengubahnya, ketuk kavling bergaris oranye (belum terdaftar)
 * untuk menambahkannya. `highlight` = hasil cari/saring; rumah lain diredupkan.
 */
function HouseMap({
  houses,
  highlight,
  onOpen,
  onAdd,
}: {
  houses: AdminHouse[];
  highlight: Set<number> | null;
  onOpen: (id: number) => void;
  onAdd: (house: NewHouse) => void;
}) {
  const { missing, notOnPlan } = useMemo(() => matchPlan(SITE_PLAN, houses), [houses]);
  const markers = useMemo(
    () => Object.fromEntries(houses.map((h) => [h.id, h.status === "vacant" ? "vacant" : "neutral"])) as Record<number, MarkerState>,
    [houses],
  );
  const offPlan = highlight ? notOnPlan.filter((h) => highlight.has(h.id)) : notOnPlan;

  return (
    <div className="space-y-3">
      <RegisterPlanHouses count={missing.length} banner />
      {highlight?.size === 0 && <p className="text-sm text-muted">Tidak ada rumah yang cocok.</p>}
      <SitePlanMap
        plan={SITE_PLAN}
        houses={houses}
        markers={markers}
        highlight={highlight}
        highlightMissing
        onHouseClick={(h) => onOpen(h.id)}
        onMissingClick={(lot) => onAdd({ block: lot.block, number: lot.number ?? "" })}
      />
      <Legend>
        <LegendItem swatch="border-fg/40 bg-card">Terdaftar</LegendItem>
        <LegendItem swatch="border-dashed border-muted bg-card">Kosong/mudik</LegendItem>
        {missing.length > 0 && <LegendItem swatch="border-dashed border-warn bg-card">Belum terdaftar ({missing.length})</LegendItem>}
        <LegendItem swatch="border-line bg-[repeating-linear-gradient(45deg,var(--line)_0_2px,transparent_2px_5px)]">Belum dibangun</LegendItem>
        <span className="sm:ml-auto">
          Ketuk rumah untuk mengubah data atau QR-nya{missing.length > 0 && ", kavling oranye untuk menambahkannya"}.
        </span>
      </Legend>
      <LocationStatus />
      {offPlan.length > 0 && (
        <div className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm">
          <p className="text-muted">{offPlan.length} rumah terdaftar tidak ada di denah (blok/nomornya tidak cocok dengan kavling):</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {offPlan.map((h) => (
              <Button
                key={h.id}
                variant="plain"
                onClick={() => onOpen(h.id)}
                className="rounded-full border border-line px-2.5 py-0.5 font-semibold hover:border-primary/50"
              >
                {houseLabel(h)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Status "Lokasi saya" di denah app petugas, dengan tautan ke pengaturan titik acuannya. */
function LocationStatus() {
  const anchors = useQuery(planAnchorsQuery).data?.anchors;
  if (!anchors) return null;
  const active = Boolean(fitGeoTransform(anchors));
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line bg-card px-3 py-2.5 text-sm">
      <p className="flex items-center gap-2">
        <MapPin className="size-4 shrink-0 text-primary" />
        <span>
          <strong>Lokasi GPS di denah</strong>{" "}
          <span className="text-muted">
            · {active ? `aktif, ${anchors.length} titik acuan` : "belum diatur, petugas belum bisa memakai “Lokasi saya”"}
          </span>
        </span>
      </p>
      <Link to="/admin/rumah?tampilan=denah&lokasi=1" onClick={() => window.scrollTo(0, 0)} className={buttonClass("secondary", "sm")}>
        Atur
      </Link>
    </div>
  );
}
